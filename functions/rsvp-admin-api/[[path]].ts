import { ZodError } from "zod";
import {
  buildPersonalizedInviteText,
  createRsvpToken,
  hashRsvpToken,
  invitationExpiresAt,
  rsvpAdminEventPatchSchema,
  type RsvpLocationVisibility,
} from "../../shared/rsvp";
import { apiError, json, readJson, validationError } from "../lib/http";
import type { AppPagesFunction, OrganizerIdentity } from "../lib/types";

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
}

interface RsvpPlayerRow {
  event_player_id: string;
  player_id: string;
  display_name: string;
  invitation_status: "invited" | "not_invited";
  rsvp_status: "pending" | "yes" | "maybe" | "no";
  invite_id: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  last_response_at: string | null;
  response_count: number | null;
  invite_created_at: string | null;
}

interface GeneratedInvite {
  playerId: string;
  playerName: string;
  url: string;
  inviteText: string;
  expiresAt: string;
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
              e.rsvp_location_visibility
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
      `SELECT ep.id AS event_player_id, ep.player_id, p.display_name,
              ep.invitation_status, ep.rsvp_status,
              ei.id AS invite_id, ei.expires_at, ei.revoked_at,
              ei.last_response_at, ei.response_count,
              ei.created_at AS invite_created_at
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
  };
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
  request: Request,
  event: RsvpEventRow,
  player: RsvpPlayerRow,
): Promise<{ generated: GeneratedInvite; tokenHash: string }> {
  const token = createRsvpToken();
  const tokenHash = await hashRsvpToken(token);
  const expiresAt = invitationExpiresAt(event.starts_at);
  const url = `${new URL(request.url).origin}/rsvp/${token}`;
  return {
    tokenHash,
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
  player: RsvpPlayerRow,
  organizer: OrganizerIdentity,
  tokenHash: string,
  expiresAt: string,
  now: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO event_invites
       (id, event_player_id, token_hash, expires_at, revoked_at,
        last_response_at, response_count, created_by_organizer_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, NULL, NULL, 0, ?5, ?6, ?6)
       ON CONFLICT(event_player_id) DO UPDATE SET
         token_hash = excluded.token_hash,
         expires_at = excluded.expires_at,
         revoked_at = NULL,
         created_by_organizer_id = excluded.created_by_organizer_id,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at`,
    )
    .bind(
      player.invite_id ?? crypto.randomUUID(),
      player.event_player_id,
      tokenHash,
      expiresAt,
      organizer.id,
      now,
    );
}

async function generateOne(
  request: Request,
  db: D1Database,
  eventId: string,
  playerId: string,
  organizer: OrganizerIdentity,
): Promise<Response> {
  const event = await requireEvent(db, eventId);
  requireMutableEvent(event);
  const player = await requireInvitedPlayer(db, eventId, playerId);
  const prepared = await prepareInvite(request, event, player);
  const now = new Date().toISOString();
  await db.batch([
    upsertInviteStatement(db, player, organizer, prepared.tokenHash, prepared.generated.expiresAt, now),
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
  request: Request,
  db: D1Database,
  eventId: string,
  organizer: OrganizerIdentity,
): Promise<Response> {
  const event = await requireEvent(db, eventId);
  requireMutableEvent(event);
  const players = (await getPlayers(db, eventId)).filter((player) => player.invitation_status === "invited");
  if (!players.length) return apiError(409, "NO_INVITEES", "Add invited players before generating links.");

  const prepared = await Promise.all(players.map((player) => prepareInvite(request, event, player)));
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  for (let index = 0; index < players.length; index += 1) {
    const player = players[index];
    const invite = prepared[index];
    statements.push(
      upsertInviteStatement(db, player, organizer, invite.tokenHash, invite.generated.expiresAt, now),
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
      parts[2] === "generate-all" &&
      parts.length === 3
    ) {
      return generateAll(request, context.env.DB, parts[1], context.data.organizer);
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
      return generateOne(request, context.env.DB, parts[1], parts[3], context.data.organizer);
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
