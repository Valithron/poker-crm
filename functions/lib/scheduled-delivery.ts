import {
  buildPersonalizedReminderEmail,
  buildPersonalizedUpdateEmail,
  hashRsvpToken,
  type RsvpLocationVisibility,
} from "../../shared/rsvp";
import { DeliveryProviderError, providerName, sendDelivery } from "./delivery";
import { decryptRsvpToken } from "./token-vault";
import { notificationFields } from "./automation";
import type { Env } from "./types";

type ReminderType = "twenty_four_hours";
type EventStatus = "open" | "active" | "completed" | "cancelled" | "archived" | "draft";

interface ReminderRow {
  id: string;
  event_id: string;
  event_player_id: string;
  reminder_type: ReminderType;
  scheduled_for: string;
  attempt_count: number;
  event_title: string;
  starts_at: string;
  host_name: string | null;
  location: string;
  game_notes: string | null;
  stakes_notes: string | null;
  location_visibility: RsvpLocationVisibility;
  event_status: EventStatus;
  organizer_id: string;
  player_id: string;
  display_name: string;
  email: string | null;
  rsvp_status: "pending" | "yes" | "maybe" | "no";
  invitation_status: "invited" | "not_invited";
  invite_id: string | null;
  token_hash: string | null;
  token_ciphertext: string | null;
}

interface UpdateRow {
  id: string;
  event_id: string;
  event_player_id: string;
  notification_key: string;
  attempt_count: number;
  event_title: string;
  starts_at: string;
  host_name: string | null;
  location: string;
  game_notes: string | null;
  stakes_notes: string | null;
  location_visibility: RsvpLocationVisibility;
  event_status: EventStatus;
  organizer_id: string;
  player_id: string;
  display_name: string;
  email: string | null;
  invitation_status: "invited" | "not_invited";
  invite_id: string | null;
  token_hash: string | null;
  token_ciphertext: string | null;
}

type NotificationRow = ReminderRow | UpdateRow;

function destinationFor(email: string | null): { destination: string | null; error: string | null; skipped: boolean } {
  const destination = email?.trim() ?? "";
  if (!destination) return { destination: null, error: "No email address is saved.", skipped: true };
  if (!/^\S+@\S+\.\S+$/u.test(destination)) {
    return { destination, error: "The saved email address is invalid.", skipped: false };
  }
  return { destination, error: null, skipped: false };
}

export function reminderTime(startsAt: string, _type: ReminderType = "twenty_four_hours"): string {
  return new Date(new Date(startsAt).getTime() - 24 * 60 * 60 * 1000).toISOString();
}

function auditStatement(
  db: D1Database,
  row: NotificationRow,
  action: string,
  details: Record<string, unknown>,
  now: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO event_audit_log
       (id, event_id, organizer_id, action, details_json, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(crypto.randomUUID(), row.event_id, row.organizer_id, action, JSON.stringify(details), now);
}

async function scheduleUpcoming(db: D1Database, now: string): Promise<void> {
  const events = await db
    .prepare(
      `SELECT id, starts_at
       FROM events
       WHERE status IN ('open', 'active')
         AND invite_automation_enabled = 1
         AND datetime(starts_at) > datetime(?1)
       ORDER BY starts_at ASC LIMIT 50`,
    )
    .bind(now)
    .all<{ id: string; starts_at: string }>();

  for (const event of events.results) {
    const players = await db
      .prepare(
        `SELECT id FROM event_players
         WHERE event_id = ?1 AND invitation_status = 'invited'`,
      )
      .bind(event.id)
      .all<{ id: string }>();
    const scheduledFor = reminderTime(event.starts_at);
    if (new Date(scheduledFor).getTime() <= Date.now()) continue;
    const statements = players.results.map((player) =>
      db
        .prepare(
          `INSERT INTO delivery_schedules
           (id, event_id, event_player_id, reminder_type, scheduled_for, created_at, updated_at)
           VALUES (?1, ?2, ?3, 'twenty_four_hours', ?4, ?5, ?5)
           ON CONFLICT(event_id, event_player_id, reminder_type) DO UPDATE SET
             scheduled_for = CASE WHEN delivery_schedules.status = 'pending' THEN excluded.scheduled_for ELSE delivery_schedules.scheduled_for END,
             updated_at = excluded.updated_at`,
        )
        .bind(crypto.randomUUID(), event.id, player.id, scheduledFor, now),
    );
    if (statements.length) await db.batch(statements);
  }
}

async function dueReminders(db: D1Database, now: string): Promise<ReminderRow[]> {
  const rows = await db
    .prepare(
      `SELECT s.id, s.event_id, s.event_player_id, s.reminder_type, s.scheduled_for, s.attempt_count,
              e.title AS event_title, e.starts_at, e.location, e.game_notes, e.stakes_notes,
              e.status AS event_status, e.rsvp_location_visibility AS location_visibility,
              host.display_name AS host_name, e.created_by_organizer_id AS organizer_id,
              ep.player_id, ep.rsvp_status, ep.invitation_status,
              p.display_name, p.email, ei.id AS invite_id, ei.token_hash, ei.token_ciphertext
       FROM delivery_schedules s
       JOIN events e ON e.id = s.event_id
       JOIN event_players ep ON ep.id = s.event_player_id
       JOIN players p ON p.id = ep.player_id
       LEFT JOIN players host ON host.id = e.host_player_id
       LEFT JOIN event_invites ei ON ei.event_player_id = ep.id
       WHERE s.status IN ('pending', 'failed') AND s.attempt_count < 3
         AND e.invite_automation_enabled = 1
         AND datetime(s.scheduled_for) <= datetime(?1)
       ORDER BY s.scheduled_for LIMIT 25`,
    )
    .bind(now)
    .all<ReminderRow>();
  return rows.results;
}

async function dueUpdates(db: D1Database, now: string): Promise<UpdateRow[]> {
  const rows = await db
    .prepare(
      `SELECT n.id, n.event_id, n.event_player_id, n.notification_key, n.attempt_count,
              e.title AS event_title, e.starts_at, e.location, e.game_notes, e.stakes_notes,
              e.status AS event_status, e.rsvp_location_visibility AS location_visibility,
              host.display_name AS host_name, e.created_by_organizer_id AS organizer_id,
              ep.player_id, ep.invitation_status, p.display_name, p.email,
              ei.id AS invite_id, ei.token_hash, ei.token_ciphertext
       FROM event_update_notifications n
       JOIN events e ON e.id = n.event_id
       JOIN event_players ep ON ep.id = n.event_player_id
       JOIN players p ON p.id = ep.player_id
       LEFT JOIN players host ON host.id = e.host_player_id
       LEFT JOIN event_invites ei ON ei.event_player_id = ep.id
       WHERE n.status IN ('pending', 'failed') AND n.attempt_count < 3
         AND e.invite_automation_enabled = 1
         AND datetime(n.created_at) <= datetime(?1)
       ORDER BY n.created_at LIMIT 25`,
    )
    .bind(now)
    .all<UpdateRow>();
  return rows.results;
}

async function claim(db: D1Database, row: NotificationRow, now: string): Promise<boolean> {
  const table = "reminder_type" in row ? "delivery_schedules" : "event_update_notifications";
  const result = await db
    .prepare(
      `UPDATE ${table}
       SET status = 'claimed', claimed_at = ?1, attempt_count = attempt_count + 1, updated_at = ?1
       WHERE id = ?2 AND status IN ('pending', 'failed') AND attempt_count < 3`,
    )
    .bind(now, row.id)
    .run();
  return result.meta.changes === 1;
}

async function finish(db: D1Database, row: NotificationRow, status: "sent" | "skipped" | "failed" | "cancelled", error: string | null, now: string): Promise<void> {
  if ("reminder_type" in row) {
    await db
      .prepare(
        `UPDATE delivery_schedules SET status = ?1, last_error = ?2,
         scheduled_for = CASE WHEN ?1 = 'failed' THEN datetime(?3, '+15 minutes') ELSE scheduled_for END,
         completed_at = CASE WHEN ?1 = 'failed' THEN NULL ELSE ?3 END, updated_at = ?3 WHERE id = ?4`,
      )
      .bind(status, error, now, row.id)
      .run();
  } else {
    await db
      .prepare(
        `UPDATE event_update_notifications SET status = ?1, last_error = ?2,
         completed_at = CASE WHEN ?1 = 'failed' THEN NULL ELSE ?3 END, updated_at = ?3 WHERE id = ?4`,
      )
      .bind(status, error, now, row.id)
      .run();
  }
}

function calendarUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/u, "")}/rsvp-api/${encodeURIComponent(token)}/calendar.ics`;
}

async function processRow(db: D1Database, env: Env, row: NotificationRow, origin: string): Promise<void> {
  const now = new Date().toISOString();
  const isReminder = "reminder_type" in row;
  const eligible = row.event_status === "open" || row.event_status === "active";
  const reminderEligible = !isReminder || row.rsvp_status === "pending";
  if (!eligible || row.invitation_status !== "invited" || !reminderEligible) {
    await finish(db, row, row.event_status === "cancelled" ? "cancelled" : "skipped", "Player is no longer eligible for this message.", now);
    await db.batch([auditStatement(db, row, isReminder ? "scheduled_reminder_skipped" : "event_update_skipped", {}, now)]);
    return;
  }

  const destination = destinationFor(row.email);
  if (destination.error || !destination.destination) {
    await finish(db, row, destination.skipped ? "skipped" : "failed", destination.error, now);
    await db.batch([auditStatement(db, row, isReminder ? "scheduled_reminder_skipped" : "event_update_skipped", { reason: destination.error }, now)]);
    return;
  }

  if (!row.invite_id || !row.token_ciphertext || !row.token_hash) {
    const error = "This player needs a fresh invitation before automated email can be sent.";
    await finish(db, row, "skipped", error, now);
    await db.batch([auditStatement(db, row, isReminder ? "scheduled_reminder_skipped" : "event_update_skipped", { reason: error }, now)]);
    return;
  }
  const token = await decryptRsvpToken(row.token_ciphertext, env.RSVP_TOKEN_ENCRYPTION_KEY ?? "development-rsvp-token-key");
  if (!token) {
    const error = "The RSVP token could not be opened. Send a fresh invitation.";
    await finish(db, row, "failed", error, now);
    return;
  }

  const batchId = crypto.randomUUID();
  const deliveryId = crypto.randomUUID();
  const resultId = crypto.randomUUID();
  const notificationType = isReminder ? "reminder" : "event_update";
  const fields = isReminder ? [] : notificationFields(row.notification_key);
  const rsvpUrl = `${origin.replace(/\/+$/u, "")}/rsvp/${token}`;
  const input = {
    playerName: row.display_name,
    title: row.event_title,
    startsAt: row.starts_at,
    hostName: row.host_name,
    location: row.location,
    locationVisibility: row.location_visibility,
    gameNotes: row.game_notes,
    stakesNotes: row.stakes_notes,
    rsvpUrl,
    calendarUrl: calendarUrl(origin, token),
    directionsUrl: row.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.location)}` : null,
    brandAssetUrl: `${origin.replace(/\/+$/u, "")}/apple-touch-icon.png`,
  };
  const email = isReminder ? buildPersonalizedReminderEmail(input) : buildPersonalizedUpdateEmail(input, fields);
  const provider = providerName("email", env);
  const message = {
    channel: "email" as const,
    destination: destination.destination,
    subject: email.subject,
    text: email.text,
    html: email.html,
    headers: email.headers,
    idempotencyKey: `${batchId}:${deliveryId}`,
  };

  await db.batch([
    db.prepare(
      `INSERT INTO delivery_batches
       (id, event_id, requested_by_organizer_id, requested_channels_json, policy, source, notification_type, status, requested_count, created_at)
       VALUES (?1, ?2, ?3, '["email"]', 'requested_channels', 'scheduled', ?4, 'sending', 1, ?5)`,
    ).bind(batchId, row.event_id, row.organizer_id, notificationType, now),
    db.prepare(
      `INSERT INTO invite_deliveries
       (id, event_invite_id, channel, destination, provider, status, provider_message_id, error_message, token_hash,
        requested_by_organizer_id, created_at, completed_at, updated_at, batch_id, attempt, idempotency_key)
       VALUES (?1, ?2, 'email', ?3, ?4, 'sending', NULL, NULL, ?5, ?6, ?7, NULL, ?7, ?8, 1, ?9)`,
    ).bind(deliveryId, row.invite_id, destination.destination, provider, row.token_hash, row.organizer_id, now, batchId, message.idempotencyKey),
    db.prepare(
      `INSERT INTO invite_delivery_results
       (id, batch_id, event_player_id, channel, destination, status, delivery_id, error_message, token_hash, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'email', ?4, 'failed', ?5, NULL, ?6, ?7, ?7)`,
    ).bind(resultId, batchId, row.event_player_id, destination.destination, deliveryId, row.token_hash, now),
    auditStatement(db, row, isReminder ? "scheduled_reminder_requested" : "event_update_requested", { provider }, now),
  ]);

  try {
    const sent = await sendDelivery(env, message);
    await db.batch([
      db.prepare("UPDATE invite_deliveries SET status = 'sent', provider_message_id = ?1, completed_at = ?2, updated_at = ?2 WHERE id = ?3").bind(sent.providerMessageId, now, deliveryId),
      db.prepare("UPDATE invite_delivery_results SET status = 'sent', error_message = NULL, updated_at = ?1 WHERE id = ?2").bind(now, resultId),
      db.prepare("UPDATE delivery_batches SET status = 'completed', sent_count = 1, completed_at = ?1 WHERE id = ?2").bind(now, batchId),
      finishStatement(db, row, "sent", null, now),
      auditStatement(db, row, isReminder ? "scheduled_reminder_sent" : "event_update_sent", { provider: sent.provider }, now),
    ]);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "The delivery provider failed.";
    const failedProvider = error instanceof DeliveryProviderError ? error.provider : provider;
    await db.batch([
      db.prepare("UPDATE invite_deliveries SET status = 'failed', provider = ?1, error_message = ?2, completed_at = ?3, updated_at = ?3 WHERE id = ?4").bind(failedProvider, messageText, now, deliveryId),
      db.prepare("UPDATE invite_delivery_results SET status = 'failed', error_message = ?1, updated_at = ?2 WHERE id = ?3").bind(messageText, now, resultId),
      db.prepare("UPDATE delivery_batches SET status = 'failed', failed_count = 1, completed_at = ?1 WHERE id = ?2").bind(now, batchId),
      finishStatement(db, row, "failed", messageText, now),
      auditStatement(db, row, isReminder ? "scheduled_reminder_failed" : "event_update_failed", { provider: failedProvider, reason: messageText }, now),
    ]);
  }
}

function finishStatement(db: D1Database, row: NotificationRow, status: "sent" | "skipped" | "failed" | "cancelled", error: string | null, now: string): D1PreparedStatement {
  const table = "reminder_type" in row ? "delivery_schedules" : "event_update_notifications";
  return db.prepare(`UPDATE ${table} SET status = ?1, last_error = ?2, completed_at = CASE WHEN ?1 = 'failed' THEN NULL ELSE ?3 END, updated_at = ?3 WHERE id = ?4`).bind(status, error, now, row.id);
}

export async function runScheduledReminders(env: Env): Promise<{ scheduled: number; processed: number }> {
  const now = new Date().toISOString();
  await scheduleUpcoming(env.DB, now);
  const [reminders, updates] = await Promise.all([dueReminders(env.DB, now), dueUpdates(env.DB, now)]);
  const rows: NotificationRow[] = [...reminders, ...updates];
  const origin = env.PUBLIC_APP_ORIGIN?.trim() || "http://localhost:8788";
  let processed = 0;
  for (const row of rows) {
    if (await claim(env.DB, row, now)) {
      await processRow(env.DB, env, row, origin);
      processed += 1;
    }
  }
  return { scheduled: rows.length, processed };
}
