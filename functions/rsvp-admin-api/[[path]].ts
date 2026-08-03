import { ZodError } from "zod";
import {
  sendInvitesSchema,
  type DeliveryChannel,
  type DeliveryStatus,
} from "../../shared/delivery";
import {
  buildPersonalizedInviteEmail,
  buildPersonalizedInviteSms,
  buildPersonalizedInviteText,
  createRsvpToken,
  hashRsvpToken,
  invitationExpiresAt,
  rsvpAdminEventPatchSchema,
  type RsvpLocationVisibility,
} from "../../shared/rsvp";
import { DeliveryProviderError, providerName, sendDelivery } from "../lib/delivery";
import { apiError, json, readJson, validationError } from "../lib/http";
import { queueEventUpdateNotifications } from "../lib/automation";
import { encryptRsvpToken } from "../lib/token-vault";
import type { AppPagesFunction, Env, OrganizerIdentity } from "../lib/types";

interface RsvpEventRow {
  id: string;
  title: string;
  starts_at: string;
  host_name: string | null;
  location: string;
  game_notes: string | null;
  stakes_notes: string | null;
  status: "draft" | "open" | "active" | "completed" | "cancelled" | "archived";
  rsvp_location_visibility: RsvpLocationVisibility;
  invite_automation_enabled: number;
}

interface RsvpPlayerRow {
  event_player_id: string;
  player_id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  preferred_channel: "email" | "sms";
  invitation_status: "invited" | "not_invited";
  rsvp_status: "pending" | "yes" | "maybe" | "no";
  invite_id: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  last_response_at: string | null;
  response_count: number | null;
  invite_created_at: string | null;
  email_delivery_status: DeliveryStatus | null;
  email_delivery_provider: string | null;
  email_delivery_at: string | null;
  email_delivery_error: string | null;
  sms_delivery_status: DeliveryStatus | null;
  sms_delivery_provider: string | null;
  sms_delivery_at: string | null;
  sms_delivery_error: string | null;
}

interface GeneratedInvite {
  playerId: string;
  playerName: string;
  url: string;
  inviteText: string;
  expiresAt: string;
}

interface DeliveryRow {
  id: string;
  player_id: string;
  display_name: string;
  channel: DeliveryChannel;
  destination: string;
  provider: string;
  status: DeliveryStatus;
  provider_message_id: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  batch_id: string | null;
  attempt: number;
  provider_status: string | null;
  provider_status_at: string | null;
}

interface DeliveryResult {
  deliveryId: string | null;
  playerId: string;
  playerName: string;
  channel: DeliveryChannel;
  destination: string | null;
  provider: string | null;
  status: "sent" | "failed" | "skipped";
  errorMessage: string | null;
}

function auditStatement(
  db: D1Database,
  eventId: string,
  organizer: OrganizerIdentity,
  action: string,
  details: Record<string, unknown>,
  createdAt: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO event_audit_log
       (id, event_id, organizer_id, action, details_json, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(crypto.randomUUID(), eventId, organizer.id, action, JSON.stringify(details), createdAt);
}

async function getEvent(db: D1Database, eventId: string): Promise<RsvpEventRow | null> {
  return db
    .prepare(
      `SELECT e.id, e.title, e.starts_at, host.display_name AS host_name,
              e.location, e.game_notes, e.stakes_notes, e.status,
              e.rsvp_location_visibility, e.invite_automation_enabled
       FROM events e
       LEFT JOIN players host ON host.id = e.host_player_id
       WHERE e.id = ?1`,
    )
    .bind(eventId)
    .first<RsvpEventRow>();
}

async function requireEvent(db: D1Database, eventId: string): Promise<RsvpEventRow> {
  const event = await getEvent(db, eventId);
  if (!event) throw new Response("Event not found.", { status: 404 });
  return event;
}

function requireMutableEvent(event: RsvpEventRow): void {
  if (["completed", "cancelled", "archived"].includes(event.status)) {
    throw new Response("RSVP links cannot be changed for a locked event.", { status: 409 });
  }
}

async function getPlayers(db: D1Database, eventId: string): Promise<RsvpPlayerRow[]> {
  const rows = await db
    .prepare(
      `SELECT ep.id AS event_player_id, ep.player_id, p.display_name, p.email, p.phone,
              p.preferred_channel,
              ep.invitation_status, ep.rsvp_status,
              ei.id AS invite_id, ei.expires_at, ei.revoked_at,
              ei.last_response_at, ei.response_count,
              ei.created_at AS invite_created_at,
              (SELECT d.status FROM invite_deliveries d
               WHERE d.event_invite_id = ei.id AND d.channel = 'email'
               ORDER BY d.created_at DESC LIMIT 1) AS email_delivery_status,
              (SELECT d.provider FROM invite_deliveries d
               WHERE d.event_invite_id = ei.id AND d.channel = 'email'
               ORDER BY d.created_at DESC LIMIT 1) AS email_delivery_provider,
              (SELECT COALESCE(d.completed_at, d.created_at) FROM invite_deliveries d
               WHERE d.event_invite_id = ei.id AND d.channel = 'email'
               ORDER BY d.created_at DESC LIMIT 1) AS email_delivery_at,
              (SELECT d.error_message FROM invite_deliveries d
               WHERE d.event_invite_id = ei.id AND d.channel = 'email'
               ORDER BY d.created_at DESC LIMIT 1) AS email_delivery_error,
              (SELECT d.status FROM invite_deliveries d
               WHERE d.event_invite_id = ei.id AND d.channel = 'sms'
               ORDER BY d.created_at DESC LIMIT 1) AS sms_delivery_status,
              (SELECT d.provider FROM invite_deliveries d
               WHERE d.event_invite_id = ei.id AND d.channel = 'sms'
               ORDER BY d.created_at DESC LIMIT 1) AS sms_delivery_provider,
              (SELECT COALESCE(d.completed_at, d.created_at) FROM invite_deliveries d
               WHERE d.event_invite_id = ei.id AND d.channel = 'sms'
               ORDER BY d.created_at DESC LIMIT 1) AS sms_delivery_at,
              (SELECT d.error_message FROM invite_deliveries d
               WHERE d.event_invite_id = ei.id AND d.channel = 'sms'
               ORDER BY d.created_at DESC LIMIT 1) AS sms_delivery_error
       FROM event_players ep
       JOIN players p ON p.id = ep.player_id
       LEFT JOIN event_invites ei ON ei.event_player_id = ep.id
       WHERE ep.event_id = ?1
       ORDER BY
         CASE ep.invitation_status WHEN 'invited' THEN 0 ELSE 1 END,
         CASE ep.rsvp_status WHEN 'yes' THEN 0 WHEN 'maybe' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
         p.display_name COLLATE NOCASE`,
    )
    .bind(eventId)
    .all<RsvpPlayerRow>();
  return rows.results;
}

function playerJson(player: RsvpPlayerRow) {
  const now = Date.now();
  const expired = player.expires_at ? new Date(player.expires_at).getTime() <= now : false;
  const revoked = Boolean(player.revoked_at);
  return {
    eventPlayerId: player.event_player_id,
    playerId: player.player_id,
    displayName: player.display_name,
    contact: { email: player.email, phone: player.phone },
    preferredChannel: player.preferred_channel,
    invitationStatus: player.invitation_status,
    rsvpStatus: player.rsvp_status,
    invite: player.invite_id
      ? {
          exists: true,
          active: !expired && !revoked,
          expired,
          revoked,
          expiresAt: player.expires_at,
          revokedAt: player.revoked_at,
          lastResponseAt: player.last_response_at,
          responseCount: Number(player.response_count ?? 0),
          createdAt: player.invite_created_at,
        }
      : {
          exists: false,
          active: false,
          expired: false,
          revoked: false,
          expiresAt: null,
          revokedAt: null,
          lastResponseAt: null,
          responseCount: 0,
          createdAt: null,
        },
    latestDelivery: {
      email: player.email_delivery_status
        ? {
            status: player.email_delivery_status,
            provider: player.email_delivery_provider,
            at: player.email_delivery_at,
            errorMessage: player.email_delivery_error,
          }
        : null,
      sms: player.sms_delivery_status
        ? {
            status: player.sms_delivery_status,
            provider: player.sms_delivery_provider,
            at: player.sms_delivery_at,
            errorMessage: player.sms_delivery_error,
          }
        : null,
    },
  };
}

function requireSendableEvent(event: RsvpEventRow): void {
  if (event.status !== "open" && event.status !== "active") {
    throw new Response("Invitations can only be sent for open or active events.", { status: 409 });
  }
  if (new Date(invitationExpiresAt(event.starts_at)).getTime() <= Date.now()) {
    throw new Response("This event's RSVP invitation window has expired.", { status: 409 });
  }
}

function publicOrigin(request: Request, env: Env): string {
  return env.PUBLIC_APP_ORIGIN?.trim() || new URL(request.url).origin;
}

async function detail(db: D1Database, eventId: string): Promise<Response> {
  const [event, players] = await Promise.all([requireEvent(db, eventId), getPlayers(db, eventId)]);
  return json({
    event: {
      id: event.id,
      title: event.title,
      startsAt: event.starts_at,
      hostName: event.host_name,
      location: event.location,
      gameNotes: event.game_notes,
      stakesNotes: event.stakes_notes,
      status: event.status,
      locationVisibility: event.rsvp_location_visibility,
      inviteAutomationEnabled: Boolean(event.invite_automation_enabled),
    },
    players: players.map(playerJson),
  });
}

async function requireInvitedPlayer(
  db: D1Database,
  eventId: string,
  playerId: string,
): Promise<RsvpPlayerRow> {
  const player = (await getPlayers(db, eventId)).find((row) => row.player_id === playerId);
  if (!player) throw new Response("Player is not on this event roster.", { status: 404 });
  if (player.invitation_status !== "invited") {
    throw new Response("Mark the player as invited before generating an RSVP link.", { status: 409 });
  }
  return player;
}

async function prepareInvite(
  event: RsvpEventRow,
  player: RsvpPlayerRow,
  origin: string,
  tokenSecret: string,
): Promise<{ generated: GeneratedInvite; tokenHash: string; tokenCiphertext: string; inviteId: string }> {
  const token = createRsvpToken();
  const tokenHash = await hashRsvpToken(token);
  const tokenCiphertext = await encryptRsvpToken(token, tokenSecret);
  const expiresAt = invitationExpiresAt(event.starts_at);
  const url = `${origin.replace(/\/+$/u, "")}/rsvp/${token}`;
  return {
    tokenHash,
    tokenCiphertext,
    inviteId: player.invite_id ?? crypto.randomUUID(),
    generated: {
      playerId: player.player_id,
      playerName: player.display_name,
      url,
      expiresAt,
      inviteText: buildPersonalizedInviteText({
        playerName: player.display_name,
        title: event.title,
        startsAt: event.starts_at,
        hostName: event.host_name,
        location: event.location,
        locationVisibility: event.rsvp_location_visibility,
        gameNotes: event.game_notes,
        stakesNotes: event.stakes_notes,
        rsvpUrl: url,
      }),
    },
  };
}

function upsertInviteStatement(
  db: D1Database,
  eventPlayerId: string,
  inviteId: string,
  organizer: OrganizerIdentity,
  tokenHash: string,
  tokenCiphertext: string,
  expiresAt: string,
  now: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO event_invites
       (id, event_player_id, token_hash, expires_at, revoked_at,
        last_response_at, response_count, created_by_organizer_id, created_at, updated_at, token_ciphertext)
       VALUES (?1, ?2, ?3, ?4, NULL, NULL, 0, ?5, ?6, ?6, ?7)
       ON CONFLICT(event_player_id) DO UPDATE SET
         token_hash = excluded.token_hash,
         expires_at = excluded.expires_at,
         revoked_at = NULL,
         created_by_organizer_id = excluded.created_by_organizer_id,
         created_at = excluded.created_at,
         token_ciphertext = excluded.token_ciphertext,
         updated_at = excluded.updated_at`,
    )
    .bind(
      inviteId,
      eventPlayerId,
      tokenHash,
      expiresAt,
      organizer.id,
      now,
      tokenCiphertext,
    );
}

async function generateOne(
  request: Request,
  db: D1Database,
  eventId: string,
  playerId: string,
  organizer: OrganizerIdentity,
  origin: string,
  tokenSecret: string,
): Promise<Response> {
  const event = await requireEvent(db, eventId);
  requireMutableEvent(event);
  const player = await requireInvitedPlayer(db, eventId, playerId);
  const prepared = await prepareInvite(event, player, origin, tokenSecret);
  const now = new Date().toISOString();
  await db.batch([
    upsertInviteStatement(
      db,
      player.event_player_id,
      prepared.inviteId,
      organizer,
      prepared.tokenHash,
      prepared.tokenCiphertext,
      prepared.generated.expiresAt,
      now,
    ),
    auditStatement(
      db,
      eventId,
      organizer,
      player.invite_id ? "rsvp_link_regenerated" : "rsvp_link_generated",
      { playerId, playerName: player.display_name, expiresAt: prepared.generated.expiresAt },
      now,
    ),
  ]);
  return json({ generated: prepared.generated });
}

async function generateAll(
  db: D1Database,
  eventId: string,
  organizer: OrganizerIdentity,
  origin: string,
  tokenSecret: string,
): Promise<Response> {
  const event = await requireEvent(db, eventId);
  requireMutableEvent(event);
  const players = (await getPlayers(db, eventId)).filter((player) => player.invitation_status === "invited");
  if (!players.length) return apiError(409, "NO_INVITEES", "Add invited players before generating links.");

  const prepared = await Promise.all(
    players.map((player) => prepareInvite(event, player, origin, tokenSecret)),
  );
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  for (let index = 0; index < players.length; index += 1) {
    const player = players[index];
    const invite = prepared[index];
    statements.push(
      upsertInviteStatement(
        db,
        player.event_player_id,
        invite.inviteId,
        organizer,
        invite.tokenHash,
        invite.tokenCiphertext,
        invite.generated.expiresAt,
        now,
      ),
      auditStatement(
        db,
        eventId,
        organizer,
        player.invite_id ? "rsvp_link_regenerated" : "rsvp_link_generated",
        {
          playerId: player.player_id,
          playerName: player.display_name,
          expiresAt: invite.generated.expiresAt,
          generatedAsBatch: true,
        },
        now,
      ),
    );
  }
  await db.batch(statements);
  return json({ generated: prepared.map((item) => item.generated) });
}

type DestinationCheck =
  | { kind: "ready"; destination: string }
  | { kind: "skipped" | "failed"; message: string; destination: string | null };

function destinationFor(channel: DeliveryChannel, player: RsvpPlayerRow): DestinationCheck {
  if (channel === "email") {
    const destination = player.email?.trim() ?? "";
    if (!destination) return { kind: "skipped", message: "No email address is saved for this player.", destination: null };
    if (!/^\S+@\S+\.\S+$/u.test(destination)) {
      return { kind: "failed", message: "The saved email address is invalid.", destination };
    }
    return { kind: "ready", destination };
  }

  const destination = (player.phone?.trim() ?? "").replace(/[()\s.-]/gu, "");
  if (!destination) return { kind: "skipped", message: "No phone number is saved for this player.", destination: null };
  if (!/^\+[1-9]\d{7,14}$/u.test(destination)) {
    return { kind: "failed", message: "SMS numbers must use E.164 format, such as +15551234567.", destination };
  }
  return { kind: "ready", destination };
}

function deliveryMessage(
  event: RsvpEventRow,
  player: RsvpPlayerRow,
  channel: DeliveryChannel,
  destination: string,
  url: string,
  deliveryId: string,
  origin: string,
) {
  const input = {
    playerName: player.display_name,
    title: event.title,
    startsAt: event.starts_at,
    hostName: event.host_name,
    location: event.location,
    locationVisibility: event.rsvp_location_visibility,
    gameNotes: event.game_notes,
    stakesNotes: event.stakes_notes,
    rsvpUrl: url,
    brandAssetUrl: `${origin.replace(/\/+$/u, "")}/apple-touch-icon.png?v=2`,
    calendarUrl: `${origin.replace(/\/+$/u, "")}/rsvp-api/${encodeURIComponent(url.split("/rsvp/").pop() ?? "")}/calendar.ics`,
    directionsUrl: event.location
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`
      : null,
  };
  if (channel === "email") {
    const email = buildPersonalizedInviteEmail(input);
    return {
      channel,
      destination,
      subject: email.subject,
      text: email.text,
      html: email.html,
      headers: email.headers,
      idempotencyKey: deliveryId,
    };
  }
  return {
    channel,
    destination,
    text: buildPersonalizedInviteSms(input),
    idempotencyKey: deliveryId,
  };
}

function insertDeliveryStatement(
  db: D1Database,
  values: {
    id: string;
    batchId: string;
    inviteId: string;
    channel: DeliveryChannel;
    destination: string;
    provider: string;
    status: DeliveryStatus;
    tokenHash: string;
    organizerId: string;
    createdAt: string;
      completedAt: string | null;
      errorMessage: string | null;
    idempotencyKey: string;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO invite_deliveries
       (id, event_invite_id, channel, destination, provider, status,
        provider_message_id, error_message, token_hash,
        requested_by_organizer_id, created_at, completed_at, updated_at,
        batch_id, attempt, idempotency_key)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8, ?9, ?10, ?11, ?10, ?12, 1, ?13)`,
    )
    .bind(
      values.id,
      values.inviteId,
      values.channel,
      values.destination,
      values.provider,
      values.status,
      values.errorMessage,
      values.tokenHash,
      values.organizerId,
      values.createdAt,
      values.completedAt,
      values.batchId,
      values.idempotencyKey,
    );
}

function insertDeliveryResultStatement(
  db: D1Database,
  values: {
    id: string;
    batchId: string;
    eventPlayerId: string;
    channel: DeliveryChannel;
    destination: string | null;
    status: "sent" | "failed" | "skipped";
    deliveryId: string | null;
    errorMessage: string | null;
    tokenHash: string;
    now: string;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO invite_delivery_results
       (id, batch_id, event_player_id, channel, destination, status,
        delivery_id, error_message, token_hash, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`,
    )
    .bind(
      values.id,
      values.batchId,
      values.eventPlayerId,
      values.channel,
      values.destination,
      values.status,
      values.deliveryId,
      values.errorMessage,
      values.tokenHash,
      values.now,
    );
}

function updateDeliveryResultStatement(
  db: D1Database,
  resultId: string,
  status: "sent" | "failed" | "skipped",
  errorMessage: string | null,
  deliveryId: string | null,
  now: string,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE invite_delivery_results
       SET status = ?1, error_message = ?2, delivery_id = ?3, updated_at = ?4
       WHERE id = ?5`,
    )
    .bind(status, errorMessage, deliveryId, now, resultId);
}

function updateDeliveryStatement(
  db: D1Database,
  deliveryId: string,
  status: DeliveryStatus,
  providerMessageId: string | null,
  errorMessage: string | null,
  completedAt: string,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE invite_deliveries
       SET status = ?1, provider_message_id = ?2, error_message = ?3,
           completed_at = ?4, updated_at = ?4
       WHERE id = ?5`,
    )
    .bind(status, providerMessageId, errorMessage, completedAt, deliveryId);
}

async function deliveries(db: D1Database, eventId: string): Promise<Response> {
  await requireEvent(db, eventId);
  const [rows, batchRows] = await Promise.all([
    db
      .prepare(
        `SELECT d.id, ep.player_id, p.display_name, d.channel, d.destination,
                d.provider, d.status, d.provider_message_id, d.error_message,
                d.created_at, d.completed_at, d.batch_id, d.attempt,
                d.provider_status, d.provider_status_at
         FROM invite_deliveries d
         JOIN event_invites ei ON ei.id = d.event_invite_id
         JOIN event_players ep ON ep.id = ei.event_player_id
         JOIN players p ON p.id = ep.player_id
         WHERE ep.event_id = ?1
         ORDER BY d.created_at DESC
         LIMIT 200`,
      )
      .bind(eventId)
      .all<DeliveryRow>(),
    db
      .prepare(
        `SELECT id, policy, source, notification_type, status, requested_count, sent_count,
                failed_count, skipped_count, created_at, completed_at
         FROM delivery_batches
         WHERE event_id = ?1
         ORDER BY created_at DESC
         LIMIT 50`,
      )
      .bind(eventId)
      .all<DeliveryBatchRow>(),
  ]);
  return json({
    deliveries: rows.results.map((row) => ({
      id: row.id,
      playerId: row.player_id,
      playerName: row.display_name,
      channel: row.channel,
      destination: row.destination,
      provider: row.provider,
      status: row.status,
      providerMessageId: row.provider_message_id,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      batchId: row.batch_id,
      attempt: Number(row.attempt ?? 1),
      providerStatus: row.provider_status,
      providerStatusAt: row.provider_status_at,
    })),
    batches: batchRows.results.map((batch) => ({
      id: batch.id,
      policy: batch.policy,
      source: batch.source,
      notificationType: batch.notification_type,
      status: batch.status,
      summary: {
        requested: Number(batch.requested_count),
        sent: Number(batch.sent_count),
        failed: Number(batch.failed_count),
        skipped: Number(batch.skipped_count),
      },
      createdAt: batch.created_at,
      completedAt: batch.completed_at,
    })),
  });
}

interface DeliveryBatchRow {
  id: string;
  requested_channels_json: string;
  policy: "requested_channels" | "preferred_with_fallback";
  source: "manual" | "scheduled";
  notification_type: "invite" | "reminder" | "event_update";
  status: "sending" | "completed" | "partial" | "failed";
  requested_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  created_at: string;
  completed_at: string | null;
}

interface DeliveryBatchResultRow {
  id: string;
  player_id: string;
  display_name: string;
  channel: DeliveryChannel;
  destination: string | null;
  status: "sent" | "failed" | "skipped";
  delivery_id: string | null;
  provider: string | null;
  error_message: string | null;
}

async function batchResponse(db: D1Database, batchId: string): Promise<Response> {
  const [batch, resultRows] = await Promise.all([
    db.prepare("SELECT * FROM delivery_batches WHERE id = ?1").bind(batchId).first<DeliveryBatchRow>(),
    db
      .prepare(
        `SELECT r.id, ep.player_id, p.display_name, r.channel, r.destination,
                r.status, r.delivery_id, d.provider, r.error_message
         FROM invite_delivery_results r
         JOIN event_players ep ON ep.id = r.event_player_id
         JOIN players p ON p.id = ep.player_id
         LEFT JOIN invite_deliveries d ON d.id = r.delivery_id
         WHERE r.batch_id = ?1
         ORDER BY p.display_name COLLATE NOCASE, r.channel`,
      )
      .bind(batchId)
      .all<DeliveryBatchResultRow>(),
  ]);
  if (!batch) return apiError(404, "BATCH_NOT_FOUND", "Delivery batch not found.");

  return json({
    batchId: batch.id,
    policy: batch.policy,
    source: batch.source,
    notificationType: batch.notification_type,
    summary: {
      requested: Number(batch.requested_count),
      sent: Number(batch.sent_count),
      failed: Number(batch.failed_count),
      skipped: Number(batch.skipped_count),
    },
    results: resultRows.results.map((row) => ({
      deliveryId: row.delivery_id,
      playerId: row.player_id,
      playerName: row.display_name,
      channel: row.channel,
      destination: row.destination,
      provider: row.provider,
      status: row.status,
      errorMessage: row.error_message,
    })),
    createdAt: batch.created_at,
    completedAt: batch.completed_at,
  });
}

function channelsForPlayer(
  player: RsvpPlayerRow,
  channels: DeliveryChannel[],
  policy: "requested_channels" | "preferred_with_fallback",
): DeliveryChannel[] {
  if (policy === "requested_channels") return channels;
  const ordered = [player.preferred_channel, ...channels.filter((channel) => channel !== player.preferred_channel)];
  return Array.from(new Set(ordered)).filter((channel) => channels.includes(channel));
}

async function sendInvites(
  request: Request,
  db: D1Database,
  eventId: string,
  organizer: OrganizerIdentity,
  env: Env,
): Promise<Response> {
  const event = await requireEvent(db, eventId);
  requireSendableEvent(event);
  const input = sendInvitesSchema.parse(await readJson(request));
  if (input.requestId) {
    const existing = await db.prepare("SELECT id FROM delivery_batches WHERE id = ?1").bind(input.requestId).first<{ id: string }>();
    if (existing) return batchResponse(db, existing.id);
  }
  const allPlayers = await getPlayers(db, eventId);
  const invitedPlayers = allPlayers.filter((player) => player.invitation_status === "invited");
  if (!invitedPlayers.length) return apiError(409, "NO_INVITEES", "Add invited players before sending invitations.");

  const selectedIds = input.playerIds ? Array.from(new Set(input.playerIds)) : undefined;
  const selectedPlayers = selectedIds
    ? selectedIds.map((playerId) => {
        const player = allPlayers.find((candidate) => candidate.player_id === playerId);
        if (!player) throw new Response("A selected player is not on this event roster.", { status: 404 });
        if (player.invitation_status !== "invited") {
          throw new Response("Only invited players can receive invitations.", { status: 409 });
        }
        return player;
      })
    : invitedPlayers;
  if (selectedPlayers.length > 50) {
    return apiError(400, "BATCH_TOO_LARGE", "Send invitations to no more than 50 players at a time.");
  }

  const origin = publicOrigin(request, env);
  const now = new Date().toISOString();
  const batchId = input.requestId ?? crypto.randomUUID();
  const setupStatements: D1PreparedStatement[] = [];
  const results: DeliveryResult[] = [];
  const jobs: Array<{
    deliveryId: string;
    resultId: string;
    resultIndex: number;
    message: ReturnType<typeof deliveryMessage>;
    player: RsvpPlayerRow;
    provider: string;
  }> = [];

  setupStatements.push(
    db
      .prepare(
        `INSERT INTO delivery_batches
         (id, event_id, requested_by_organizer_id, requested_channels_json,
          policy, source, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'manual', 'sending', ?6)`,
      )
      .bind(batchId, eventId, organizer.id, JSON.stringify(input.channels), input.policy, now),
  );

  for (const player of selectedPlayers) {
    const prepared = await prepareInvite(event, player, origin, env.RSVP_TOKEN_ENCRYPTION_KEY ?? "development-rsvp-token-key");
    setupStatements.push(
      upsertInviteStatement(
        db,
        player.event_player_id,
        prepared.inviteId,
        organizer,
        prepared.tokenHash,
        prepared.tokenCiphertext,
        prepared.generated.expiresAt,
        now,
      ),
      auditStatement(
        db,
        eventId,
        organizer,
        player.invite_id ? "rsvp_link_regenerated_for_delivery" : "rsvp_link_generated_for_delivery",
        { playerId: player.player_id, playerName: player.display_name },
        now,
      ),
    );

    const playerChannels = channelsForPlayer(player, input.channels, input.policy);
    for (const channel of playerChannels) {
      const destination = destinationFor(channel, player);
      if (destination.kind === "skipped") {
        const resultId = crypto.randomUUID();
        results.push({
          deliveryId: null,
          playerId: player.player_id,
          playerName: player.display_name,
          channel,
          destination: null,
          provider: null,
          status: "skipped",
          errorMessage: destination.message,
        });
        setupStatements.push(
          insertDeliveryResultStatement(db, {
            id: resultId,
            batchId,
            eventPlayerId: player.event_player_id,
            channel,
            destination: null,
            status: "skipped",
            deliveryId: null,
            errorMessage: destination.message,
            tokenHash: prepared.tokenHash,
            now,
          }),
          auditStatement(
            db,
            eventId,
            organizer,
            "invite_delivery_skipped",
            { playerId: player.player_id, playerName: player.display_name, channel, reason: destination.message },
            now,
          ),
        );
        continue;
      }

      const deliveryId = crypto.randomUUID();
      const resultId = crypto.randomUUID();
      const provider = destination.kind === "failed" ? "validation" : providerName(channel, env);
      if (destination.kind === "failed") {
        results.push({
          deliveryId,
          playerId: player.player_id,
          playerName: player.display_name,
          channel,
          destination: destination.destination,
          provider,
          status: "failed",
          errorMessage: destination.message,
        });
        setupStatements.push(
          insertDeliveryStatement(db, {
            id: deliveryId,
            batchId,
            inviteId: prepared.inviteId,
            channel,
            destination: destination.destination ?? "",
            provider,
            status: "failed",
            tokenHash: prepared.tokenHash,
            organizerId: organizer.id,
            createdAt: now,
            completedAt: now,
            errorMessage: destination.message,
            idempotencyKey: `${batchId}:${deliveryId}`,
          }),
          insertDeliveryResultStatement(db, {
            id: resultId,
            batchId,
            eventPlayerId: player.event_player_id,
            channel,
            destination: destination.destination,
            status: "failed",
            deliveryId,
            errorMessage: destination.message,
            tokenHash: prepared.tokenHash,
            now,
          }),
          auditStatement(
            db,
            eventId,
            organizer,
            "invite_delivery_failed",
            { playerId: player.player_id, playerName: player.display_name, channel, reason: destination.message },
            now,
          ),
        );
        continue;
      }

      results.push({
        deliveryId,
        playerId: player.player_id,
        playerName: player.display_name,
        channel,
        destination: destination.destination,
        provider,
        status: "failed",
        errorMessage: null,
      });
      const destinationValue = destination.destination;
      if (!destinationValue) continue;
      setupStatements.push(
        insertDeliveryStatement(db, {
          id: deliveryId,
          batchId,
          inviteId: prepared.inviteId,
          channel,
          destination: destinationValue,
          provider,
          status: "sending",
          tokenHash: prepared.tokenHash,
          organizerId: organizer.id,
          createdAt: now,
          completedAt: null,
          errorMessage: null,
          idempotencyKey: `${batchId}:${deliveryId}`,
        }),
        insertDeliveryResultStatement(db, {
          id: resultId,
          batchId,
          eventPlayerId: player.event_player_id,
          channel,
          destination: destinationValue,
          status: "failed",
          deliveryId,
          errorMessage: null,
          tokenHash: prepared.tokenHash,
          now,
        }),
        auditStatement(
          db,
          eventId,
          organizer,
          "invite_delivery_requested",
          { playerId: player.player_id, playerName: player.display_name, channel, provider },
          now,
        ),
      );
      jobs.push({
        deliveryId,
        resultId,
        resultIndex: results.length - 1,
        message: deliveryMessage(event, player, channel, destinationValue, prepared.generated.url, deliveryId, origin),
        player,
        provider,
      });
    }
  }

  await db.batch(setupStatements);
  for (const job of jobs) {
    const completedAt = new Date().toISOString();
    try {
      const sent = await sendDelivery(env, job.message);
      await db.batch([
        updateDeliveryStatement(db, job.deliveryId, "sent", sent.providerMessageId, null, completedAt),
        updateDeliveryResultStatement(db, job.resultId, "sent", null, job.deliveryId, completedAt),
        auditStatement(
          db,
          eventId,
          organizer,
          "invite_delivery_sent",
          {
            playerId: job.player.player_id,
            playerName: job.player.display_name,
            channel: job.message.channel,
            provider: sent.provider,
            providerMessageId: sent.providerMessageId,
          },
          completedAt,
        ),
      ]);
      results[job.resultIndex] = {
        ...results[job.resultIndex],
        provider: sent.provider,
        status: "sent",
        errorMessage: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "The delivery provider failed.";
      const failedProvider = error instanceof DeliveryProviderError ? error.provider : job.provider;
      await db.batch([
        updateDeliveryStatement(db, job.deliveryId, "failed", null, message, completedAt),
        updateDeliveryResultStatement(db, job.resultId, "failed", message, job.deliveryId, completedAt),
        auditStatement(
          db,
          eventId,
          organizer,
          "invite_delivery_failed",
          {
            playerId: job.player.player_id,
            playerName: job.player.display_name,
            channel: job.message.channel,
            provider: failedProvider,
            reason: message,
          },
          completedAt,
        ),
      ]);
      results[job.resultIndex] = {
        ...results[job.resultIndex],
        provider: failedProvider,
        status: "failed",
        errorMessage: message,
      };
    }
  }

  const summary = {
    requested: results.length,
    sent: results.filter((result) => result.status === "sent").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
  };
  const batchStatus = summary.failed === 0 ? "completed" : summary.sent > 0 ? "partial" : "failed";
  await db
    .prepare(
      `UPDATE delivery_batches
       SET status = ?1, requested_count = ?2, sent_count = ?3,
           failed_count = ?4, skipped_count = ?5, completed_at = ?6
       WHERE id = ?7`,
    )
    .bind(batchStatus, summary.requested, summary.sent, summary.failed, summary.skipped, new Date().toISOString(), batchId)
    .run();

  return json({ batchId, summary, results });
}

async function retryDelivery(
  request: Request,
  db: D1Database,
  deliveryId: string,
  organizer: OrganizerIdentity,
  env: Env,
): Promise<Response> {
  const row = await db
    .prepare(
      `SELECT d.status, d.channel, ep.event_id, ep.player_id, d.event_invite_id,
              b.notification_type
       FROM invite_deliveries d
       JOIN event_invites ei ON ei.id = d.event_invite_id
       JOIN event_players ep ON ep.id = ei.event_player_id
       LEFT JOIN delivery_batches b ON b.id = d.batch_id
       WHERE d.id = ?1`,
    )
    .bind(deliveryId)
    .first<{
      status: DeliveryStatus;
      channel: DeliveryChannel;
      event_id: string;
      player_id: string;
      notification_type: "invite" | "reminder" | "event_update" | null;
    }>();
  if (!row) return apiError(404, "DELIVERY_NOT_FOUND", "Delivery attempt not found.");
  if (row.status !== "failed") return apiError(409, "DELIVERY_NOT_FAILED", "Only failed deliveries can be retried.");

  if (row.notification_type === "reminder" || row.notification_type === "event_update") {
    const now = new Date().toISOString();
    if (row.notification_type === "reminder") {
      await db
        .prepare(
          `UPDATE delivery_schedules SET status = 'pending', scheduled_for = ?1, last_error = NULL, updated_at = ?1
           WHERE event_player_id = ?2 AND status = 'failed'`,
        )
        .bind(now, row.player_id)
        .run();
    } else {
      await db
        .prepare(
          `UPDATE event_update_notifications SET status = 'pending', last_error = NULL, updated_at = ?1
           WHERE event_player_id = ?2 AND status = 'failed'`,
        )
        .bind(now, row.player_id)
        .run();
    }
    return json({ queued: true, notificationType: row.notification_type });
  }

  const retryRequest = new Request(request.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playerIds: [row.player_id],
      channels: [row.channel],
      policy: "requested_channels",
    }),
  });
  return sendInvites(retryRequest, db, row.event_id, organizer, env);
}

async function revoke(
  db: D1Database,
  eventId: string,
  playerId: string,
  organizer: OrganizerIdentity,
): Promise<Response> {
  const event = await requireEvent(db, eventId);
  requireMutableEvent(event);
  const player = await requireInvitedPlayer(db, eventId, playerId);
  if (!player.invite_id) return apiError(409, "NO_LINK", "This player does not have an RSVP link.");
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare("UPDATE event_invites SET revoked_at = ?1, updated_at = ?1 WHERE id = ?2")
      .bind(now, player.invite_id),
    auditStatement(
      db,
      eventId,
      organizer,
      "rsvp_link_revoked",
      { playerId, playerName: player.display_name },
      now,
    ),
  ]);
  return detail(db, eventId);
}

async function patchEvent(
  request: Request,
  db: D1Database,
  eventId: string,
  organizer: OrganizerIdentity,
): Promise<Response> {
  const event = await requireEvent(db, eventId);
  requireMutableEvent(event);
  const input = rsvpAdminEventPatchSchema.parse(await readJson(request));
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `UPDATE events
         SET rsvp_location_visibility = ?1, updated_at = ?2
         WHERE id = ?3`,
      )
      .bind(input.locationVisibility, now, eventId),
    auditStatement(
      db,
      eventId,
      organizer,
      "rsvp_location_visibility_updated",
      { from: event.rsvp_location_visibility, to: input.locationVisibility },
      now,
    ),
  ]);
  await queueEventUpdateNotifications(db, eventId, ["locationVisibility"], now);
  return detail(db, eventId);
}

export const onRequest: AppPagesFunction = async (context) => {
  const request = context.request;
  const method = request.method.toUpperCase();
  const path = new URL(request.url).pathname.replace(/^\/rsvp-admin-api\/?/u, "");
  const parts = path.split("/").filter(Boolean);

  try {
    if (parts[0] === "events" && parts[1] && parts.length === 2) {
      if (method === "GET") return detail(context.env.DB, parts[1]);
      if (method === "PATCH") {
        return patchEvent(request, context.env.DB, parts[1], context.data.organizer);
      }
    }
    if (
      method === "POST" &&
      parts[0] === "events" &&
      parts[1] &&
      parts[2] === "send-invites" &&
      parts.length === 3
    ) {
      return sendInvites(request, context.env.DB, parts[1], context.data.organizer, context.env);
    }
    if (
      method === "GET" &&
      parts[0] === "events" &&
      parts[1] &&
      parts[2] === "deliveries" &&
      parts.length === 3
    ) {
      return deliveries(context.env.DB, parts[1]);
    }
    if (
      method === "POST" &&
      parts[0] === "deliveries" &&
      parts[1] &&
      parts.length === 2
    ) {
      return retryDelivery(request, context.env.DB, parts[1], context.data.organizer, context.env);
    }
    if (
      method === "POST" &&
      parts[0] === "events" &&
      parts[1] &&
      parts[2] === "generate-all" &&
      parts.length === 3
    ) {
      return generateAll(
        context.env.DB,
        parts[1],
        context.data.organizer,
        publicOrigin(request, context.env),
        context.env.RSVP_TOKEN_ENCRYPTION_KEY ?? "development-rsvp-token-key",
      );
    }
    if (
      method === "POST" &&
      parts[0] === "events" &&
      parts[1] &&
      parts[2] === "players" &&
      parts[3] &&
      parts[4] === "generate" &&
      parts.length === 5
    ) {
      return generateOne(
        request,
        context.env.DB,
        parts[1],
        parts[3],
        context.data.organizer,
        publicOrigin(request, context.env),
        context.env.RSVP_TOKEN_ENCRYPTION_KEY ?? "development-rsvp-token-key",
      );
    }
    if (
      method === "POST" &&
      parts[0] === "events" &&
      parts[1] &&
      parts[2] === "players" &&
      parts[3] &&
      parts[4] === "revoke" &&
      parts.length === 5
    ) {
      return revoke(context.env.DB, parts[1], parts[3], context.data.organizer);
    }
    return apiError(404, "NOT_FOUND", "RSVP administration route not found.");
  } catch (error) {
    if (error instanceof ZodError) return validationError(error);
    if (error instanceof TypeError) return apiError(400, "BAD_REQUEST", error.message);
    if (error instanceof Response) {
      return apiError(error.status, "REQUEST_REJECTED", await error.text());
    }
    return apiError(500, "INTERNAL_ERROR", "The RSVP administration request could not be completed.");
  }
};
