import { ZodError } from "zod";
import {
  canTransition,
  deriveDisplayName,
  eventCreateSchema,
  eventPatchSchema,
  eventPlayerCreateSchema,
  eventPlayerDeleteSchema,
  eventPlayerPatchSchema,
  eventReopenSchema,
  playerCreateSchema,
  playerPatchSchema,
  type EventStatus,
} from "../../shared/domain";
import { apiError, json, readJson, validationError } from "../lib/http";
import type { AppPagesFunction, OrganizerIdentity } from "../lib/types";

interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  title: string;
  starts_at: string;
  host_player_id: string | null;
  host_name: string | null;
  location: string;
  game_notes: string | null;
  notes: string | null;
  status: EventStatus;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  attendance_count?: number;
  player_count?: number;
}

interface EventPlayerRow {
  id: string;
  event_id: string;
  player_id: string;
  display_name: string;
  invitation_status: "invited" | "not_invited";
  rsvp_status: "pending" | "yes" | "maybe" | "no";
  attended: number;
  checked_in_at: string | null;
  notes: string | null;
}

interface EventAuditRow {
  id: string;
  action: string;
  details_json: string;
  created_at: string;
  organizer_name: string;
}

function playerJson(row: PlayerRow) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function eventJson(row: EventRow) {
  return {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    hostPlayerId: row.host_player_id,
    hostName: row.host_name,
    location: row.location,
    gameNotes: row.game_notes,
    notes: row.notes,
    status: row.status,
    attendanceCount: Number(row.attendance_count ?? 0),
    playerCount: Number(row.player_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function eventPlayerJson(row: EventPlayerRow) {
  return {
    id: row.id,
    eventId: row.event_id,
    playerId: row.player_id,
    displayName: row.display_name,
    invitationStatus: row.invitation_status,
    rsvpStatus: row.rsvp_status,
    attended: Boolean(row.attended),
    checkedInAt: row.checked_in_at,
    notes: row.notes,
  };
}

function auditJson(row: EventAuditRow) {
  let details: Record<string, unknown> = {};
  try {
    details = JSON.parse(row.details_json) as Record<string, unknown>;
  } catch {
    details = {};
  }
  return {
    id: row.id,
    action: row.action,
    details,
    organizerName: row.organizer_name,
    createdAt: row.created_at,
  };
}

function isLockedStatus(status: EventStatus): boolean {
  return ["completed", "cancelled", "archived"].includes(status);
}

function requireCorrectionNote(event: EventRow, note?: string): string | undefined {
  if (!isLockedStatus(event.status)) return undefined;
  if (!note) {
    throw new Response("A correction note is required to edit a locked event.", { status: 409 });
  }
  return note;
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

function changesBetween(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [field, to] of Object.entries(after)) {
    const from = before[field];
    if (!Object.is(from, to)) changes[field] = { from, to };
  }
  return changes;
}

async function getEvent(db: D1Database, id: string): Promise<EventRow | null> {
  return db
    .prepare(
      `SELECT e.*, p.display_name AS host_name,
        COUNT(ep.id) AS player_count,
        COALESCE(SUM(ep.attended), 0) AS attendance_count
       FROM events e
       LEFT JOIN players p ON p.id = e.host_player_id
       LEFT JOIN event_players ep ON ep.event_id = e.id
       WHERE e.id = ?1
       GROUP BY e.id`,
    )
    .bind(id)
    .first<EventRow>();
}

async function requireEvent(db: D1Database, id: string): Promise<EventRow> {
  const event = await getEvent(db, id);
  if (!event) throw new Response("Event not found", { status: 404 });
  return event;
}

async function dashboard(db: D1Database): Promise<Response> {
  const [playerCount, nextEvent, recent] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM players WHERE status = 'active'").first<{ count: number }>(),
    db
      .prepare(
        `SELECT e.*, p.display_name AS host_name,
          COUNT(ep.id) AS player_count,
          COALESCE(SUM(ep.attended), 0) AS attendance_count
         FROM events e
         LEFT JOIN players p ON p.id = e.host_player_id
         LEFT JOIN event_players ep ON ep.event_id = e.id
         WHERE e.status IN ('draft', 'open', 'active')
         GROUP BY e.id
         ORDER BY e.starts_at ASC
         LIMIT 1`,
      )
      .first<EventRow>(),
    db
      .prepare(
        `SELECT e.*, p.display_name AS host_name,
          COUNT(ep.id) AS player_count,
          COALESCE(SUM(ep.attended), 0) AS attendance_count
         FROM events e
         LEFT JOIN players p ON p.id = e.host_player_id
         LEFT JOIN event_players ep ON ep.event_id = e.id
         WHERE e.status = 'completed'
         GROUP BY e.id
         ORDER BY e.completed_at DESC
         LIMIT 5`,
      )
      .all<EventRow>(),
  ]);

  return json({
    activePlayerCount: Number(playerCount?.count ?? 0),
    nextEvent: nextEvent ? eventJson(nextEvent) : null,
    recentEvents: recent.results.map(eventJson),
  });
}

async function listPlayers(request: Request, db: D1Database): Promise<Response> {
  const status = new URL(request.url).searchParams.get("status") ?? "active";
  if (!["active", "archived", "all"].includes(status)) {
    return apiError(400, "BAD_REQUEST", "Player status filter is invalid.");
  }

  const statement =
    status === "all"
      ? db.prepare("SELECT * FROM players ORDER BY status, display_name COLLATE NOCASE")
      : db.prepare("SELECT * FROM players WHERE status = ?1 ORDER BY display_name COLLATE NOCASE").bind(status);
  const rows = await statement.all<PlayerRow>();
  return json({ players: rows.results.map(playerJson) });
}

async function createPlayer(request: Request, db: D1Database): Promise<Response> {
  const input = playerCreateSchema.parse(await readJson(request));
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const displayName = deriveDisplayName(input);

  await db
    .prepare(
      `INSERT INTO players
       (id, first_name, last_name, display_name, email, phone, notes, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, NULLIF(?5, ''), NULLIF(?6, ''), NULLIF(?7, ''), 'active', ?8, ?8)`,
    )
    .bind(
      id,
      input.firstName,
      input.lastName,
      displayName,
      input.email ?? "",
      input.phone ?? "",
      input.notes ?? "",
      now,
    )
    .run();

  const row = await db.prepare("SELECT * FROM players WHERE id = ?1").bind(id).first<PlayerRow>();
  return json({ player: playerJson(row as PlayerRow) }, { status: 201 });
}

async function playerDetail(db: D1Database, id: string): Promise<Response> {
  const [player, history] = await Promise.all([
    db.prepare("SELECT * FROM players WHERE id = ?1").bind(id).first<PlayerRow>(),
    db
      .prepare(
        `SELECT e.*, p.display_name AS host_name,
          1 AS player_count,
          ep.attended AS attendance_count
         FROM event_players ep
         JOIN events e ON e.id = ep.event_id
         LEFT JOIN players p ON p.id = e.host_player_id
         WHERE ep.player_id = ?1 AND e.status = 'completed'
         ORDER BY e.starts_at DESC`,
      )
      .bind(id)
      .all<EventRow>(),
  ]);
  if (!player) return apiError(404, "NOT_FOUND", "Player not found.");
  return json({ player: playerJson(player), history: history.results.map(eventJson) });
}

async function patchPlayer(request: Request, db: D1Database, id: string): Promise<Response> {
  const current = await db.prepare("SELECT * FROM players WHERE id = ?1").bind(id).first<PlayerRow>();
  if (!current) return apiError(404, "NOT_FOUND", "Player not found.");

  const input = playerPatchSchema.parse(await readJson(request));
  const firstName = input.firstName ?? current.first_name;
  const lastName = input.lastName ?? current.last_name;
  const displayName =
    input.displayName !== undefined
      ? deriveDisplayName({ firstName, lastName, displayName: input.displayName })
      : current.display_name;
  const email = input.email !== undefined ? input.email : (current.email ?? "");
  const phone = input.phone !== undefined ? input.phone : (current.phone ?? "");
  const notes = input.notes !== undefined ? input.notes : (current.notes ?? "");
  const status = input.status ?? current.status;
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE players
       SET first_name = ?1, last_name = ?2, display_name = ?3,
           email = NULLIF(?4, ''), phone = NULLIF(?5, ''), notes = NULLIF(?6, ''),
           status = ?7, updated_at = ?8
       WHERE id = ?9`,
    )
    .bind(firstName, lastName, displayName, email, phone, notes, status, now, id)
    .run();

  const row = await db.prepare("SELECT * FROM players WHERE id = ?1").bind(id).first<PlayerRow>();
  return json({ player: playerJson(row as PlayerRow) });
}

async function listEvents(request: Request, db: D1Database): Promise<Response> {
  const status = new URL(request.url).searchParams.get("status");
  const where = status ? "WHERE e.status = ?1" : "";
  const statement = db.prepare(
    `SELECT e.*, p.display_name AS host_name,
      COUNT(ep.id) AS player_count,
      COALESCE(SUM(ep.attended), 0) AS attendance_count
     FROM events e
     LEFT JOIN players p ON p.id = e.host_player_id
     LEFT JOIN event_players ep ON ep.event_id = e.id
     ${where}
     GROUP BY e.id
     ORDER BY e.starts_at DESC`,
  );
  const rows = status ? await statement.bind(status).all<EventRow>() : await statement.all<EventRow>();
  return json({ events: rows.results.map(eventJson) });
}

async function createEvent(
  request: Request,
  db: D1Database,
  organizer: OrganizerIdentity,
): Promise<Response> {
  const input = eventCreateSchema.parse(await readJson(request));
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO events
       (id, title, starts_at, host_player_id, location, game_notes, notes, status,
        created_by_organizer_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, NULLIF(?6, ''), NULLIF(?7, ''), 'draft', ?8, ?9, ?9)`,
    )
    .bind(
      id,
      input.title,
      input.startsAt,
      input.hostPlayerId ?? null,
      input.location,
      input.gameNotes ?? "",
      input.notes ?? "",
      organizer.id,
      now,
    )
    .run();

  const event = await getEvent(db, id);
  return json({ event: eventJson(event as EventRow) }, { status: 201 });
}

async function eventDetail(db: D1Database, id: string): Promise<Response> {
  const [event, players, audits] = await Promise.all([
    getEvent(db, id),
    db
      .prepare(
        `SELECT ep.*, p.display_name
         FROM event_players ep
         JOIN players p ON p.id = ep.player_id
         WHERE ep.event_id = ?1
         ORDER BY ep.attended DESC, p.display_name COLLATE NOCASE`,
      )
      .bind(id)
      .all<EventPlayerRow>(),
    db
      .prepare(
        `SELECT l.id, l.action, l.details_json, l.created_at,
                o.display_name AS organizer_name
         FROM event_audit_log l
         JOIN organizers o ON o.id = l.organizer_id
         WHERE l.event_id = ?1
         ORDER BY l.created_at DESC`,
      )
      .bind(id)
      .all<EventAuditRow>(),
  ]);
  if (!event) return apiError(404, "NOT_FOUND", "Event not found.");
  return json({
    event: eventJson(event),
    players: players.results.map(eventPlayerJson),
    audits: audits.results.map(auditJson),
  });
}

async function patchEvent(
  request: Request,
  db: D1Database,
  id: string,
  organizer: OrganizerIdentity,
): Promise<Response> {
  const current = await requireEvent(db, id);
  const input = eventPatchSchema.parse(await readJson(request));
  const correction = requireCorrectionNote(current, input.correctionNote);

  if (input.status) {
    if (isLockedStatus(current.status)) {
      return apiError(409, "LOCKED_EVENT", "Use the dedicated reopen action for a completed event.");
    }
    if (!canTransition(current.status, input.status)) {
      return apiError(409, "INVALID_TRANSITION", `Cannot move from ${current.status} to ${input.status}.`);
    }
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const setField = (field: string, column: string, currentValue: unknown, value: unknown) => {
    values.push(value);
    updates.push(`${column} = ?${values.length}`);
    before[field] = currentValue;
    after[field] = value;
  };

  if (input.title !== undefined) setField("title", "title", current.title, input.title);
  if (input.startsAt !== undefined) setField("startsAt", "starts_at", current.starts_at, input.startsAt);
  if (input.hostPlayerId !== undefined) {
    setField("hostPlayerId", "host_player_id", current.host_player_id, input.hostPlayerId);
  }
  if (input.location !== undefined) setField("location", "location", current.location, input.location);
  if (input.gameNotes !== undefined) {
    setField("gameNotes", "game_notes", current.game_notes, input.gameNotes || null);
  }
  if (input.notes !== undefined) setField("notes", "notes", current.notes, input.notes || null);
  if (input.status !== undefined) setField("status", "status", current.status, input.status);

  const now = new Date().toISOString();
  values.push(now, id);
  updates.push(`updated_at = ?${values.length - 1}`);
  const update = db
    .prepare(`UPDATE events SET ${updates.join(", ")} WHERE id = ?${values.length}`)
    .bind(...values);

  if (correction) {
    await db.batch([
      update,
      auditStatement(
        db,
        id,
        organizer,
        "event_corrected",
        { correctionNote: correction, changes: changesBetween(before, after) },
        now,
      ),
    ]);
  } else {
    await update.run();
  }

  const event = await getEvent(db, id);
  return json({ event: eventJson(event as EventRow) });
}

async function addEventPlayer(
  request: Request,
  db: D1Database,
  eventId: string,
  organizer: OrganizerIdentity,
): Promise<Response> {
  const event = await requireEvent(db, eventId);
  const input = eventPlayerCreateSchema.parse(await readJson(request));
  const correction = requireCorrectionNote(event, input.correctionNote);
  const player = await db.prepare("SELECT id, display_name FROM players WHERE id = ?1").bind(input.playerId).first<{
    id: string;
    display_name: string;
  }>();
  if (!player) return apiError(404, "NOT_FOUND", "Player not found.");

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const insert = db
    .prepare(
      `INSERT INTO event_players
       (id, event_id, player_id, invitation_status, rsvp_status, attended, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?6)`,
    )
    .bind(id, eventId, input.playerId, input.invitationStatus, input.rsvpStatus, now);

  try {
    if (correction) {
      await db.batch([
        insert,
        auditStatement(
          db,
          eventId,
          organizer,
          "event_player_added_correction",
          { correctionNote: correction, playerId: player.id, playerName: player.display_name },
          now,
        ),
      ]);
    } else {
      await insert.run();
    }
  } catch {
    return apiError(409, "ALREADY_EXISTS", "That player is already on this event.");
  }

  return eventDetail(db, eventId);
}

async function patchEventPlayer(
  request: Request,
  db: D1Database,
  eventId: string,
  playerId: string,
  organizer: OrganizerIdentity,
): Promise<Response> {
  const event = await requireEvent(db, eventId);
  const input = eventPlayerPatchSchema.parse(await readJson(request));
  const correction = requireCorrectionNote(event, input.correctionNote);
  const current = await db
    .prepare(
      `SELECT ep.*, p.display_name
       FROM event_players ep
       JOIN players p ON p.id = ep.player_id
       WHERE ep.event_id = ?1 AND ep.player_id = ?2`,
    )
    .bind(eventId, playerId)
    .first<EventPlayerRow>();
  if (!current) return apiError(404, "NOT_FOUND", "Event player not found.");

  const updates: string[] = [];
  const values: unknown[] = [];
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const setField = (field: string, column: string, currentValue: unknown, value: unknown) => {
    values.push(value);
    updates.push(`${column} = ?${values.length}`);
    before[field] = currentValue;
    after[field] = value;
  };

  if (input.invitationStatus !== undefined) {
    setField(
      "invitationStatus",
      "invitation_status",
      current.invitation_status,
      input.invitationStatus,
    );
  }
  if (input.rsvpStatus !== undefined) {
    setField("rsvpStatus", "rsvp_status", current.rsvp_status, input.rsvpStatus);
  }
  if (input.attended !== undefined) {
    setField("attended", "attended", Boolean(current.attended), input.attended ? 1 : 0);
    values.push(input.attended ? new Date().toISOString() : null);
    updates.push(`checked_in_at = ?${values.length}`);
  }
  if (input.notes !== undefined) {
    setField("notes", "notes", current.notes, input.notes || null);
  }

  const now = new Date().toISOString();
  values.push(now, eventId, playerId);
  updates.push(`updated_at = ?${values.length - 2}`);
  const update = db
    .prepare(
      `UPDATE event_players SET ${updates.join(", ")}
       WHERE event_id = ?${values.length - 1} AND player_id = ?${values.length}`,
    )
    .bind(...values);

  if (correction) {
    await db.batch([
      update,
      auditStatement(
        db,
        eventId,
        organizer,
        "event_player_corrected",
        {
          correctionNote: correction,
          playerId,
          playerName: current.display_name,
          changes: changesBetween(before, after),
        },
        now,
      ),
    ]);
  } else {
    await update.run();
  }

  return eventDetail(db, eventId);
}

async function removeEventPlayer(
  request: Request,
  db: D1Database,
  eventId: string,
  playerId: string,
  organizer: OrganizerIdentity,
): Promise<Response> {
  const event = await requireEvent(db, eventId);
  const input = eventPlayerDeleteSchema.parse(await readJson(request));
  const correction = requireCorrectionNote(event, input.correctionNote);
  const current = await db
    .prepare(
      `SELECT ep.*, p.display_name
       FROM event_players ep
       JOIN players p ON p.id = ep.player_id
       WHERE ep.event_id = ?1 AND ep.player_id = ?2`,
    )
    .bind(eventId, playerId)
    .first<EventPlayerRow>();
  if (!current) return apiError(404, "NOT_FOUND", "Event player not found.");

  const now = new Date().toISOString();
  const remove = db
    .prepare("DELETE FROM event_players WHERE event_id = ?1 AND player_id = ?2")
    .bind(eventId, playerId);

  if (correction) {
    await db.batch([
      remove,
      auditStatement(
        db,
        eventId,
        organizer,
        "event_player_removed_correction",
        {
          correctionNote: correction,
          playerId,
          playerName: current.display_name,
          attended: Boolean(current.attended),
        },
        now,
      ),
    ]);
  } else {
    await remove.run();
  }

  return eventDetail(db, eventId);
}

async function completeEvent(
  db: D1Database,
  id: string,
  organizer: OrganizerIdentity,
): Promise<Response> {
  const event = await getEvent(db, id);
  if (!event) return apiError(404, "NOT_FOUND", "Event not found.");
  if (event.status !== "active") {
    return apiError(409, "INVALID_TRANSITION", "Start Live Night before completing the event.");
  }

  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `UPDATE events
         SET status = 'completed', completed_at = ?1, updated_at = ?1
         WHERE id = ?2 AND status = 'active'`,
      )
      .bind(now, id),
    auditStatement(
      db,
      id,
      organizer,
      "event_completed",
      { attendanceCount: event.attendance_count ?? 0 },
      now,
    ),
  ]);

  const completed = await getEvent(db, id);
  return json({ event: eventJson(completed as EventRow) });
}

async function reopenEvent(
  request: Request,
  db: D1Database,
  id: string,
  organizer: OrganizerIdentity,
): Promise<Response> {
  const event = await requireEvent(db, id);
  if (event.status !== "completed") {
    return apiError(409, "INVALID_TRANSITION", "Only a completed event can be reopened.");
  }
  const input = eventReopenSchema.parse(await readJson(request));
  const now = new Date().toISOString();

  await db.batch([
    db
      .prepare(
        `UPDATE events
         SET status = 'active', completed_at = NULL, updated_at = ?1
         WHERE id = ?2 AND status = 'completed'`,
      )
      .bind(now, id),
    auditStatement(
      db,
      id,
      organizer,
      "event_reopened",
      { correctionNote: input.correctionNote, previousStatus: "completed" },
      now,
    ),
  ]);

  return eventDetail(db, id);
}

export const onRequest: AppPagesFunction = async (context) => {
  const request = context.request;
  const method = request.method.toUpperCase();
  const path = new URL(request.url).pathname.replace(/^\/api\/?/, "");
  const parts = path.split("/").filter(Boolean);

  try {
    if (method === "GET" && parts[0] === "session" && parts.length === 1) {
      return json({ organizer: context.data.organizer });
    }
    if (method === "GET" && parts[0] === "dashboard" && parts.length === 1) {
      return dashboard(context.env.DB);
    }
    if (parts[0] === "players" && parts.length === 1) {
      if (method === "GET") return listPlayers(request, context.env.DB);
      if (method === "POST") return createPlayer(request, context.env.DB);
    }
    if (parts[0] === "players" && parts[1] && parts.length === 2) {
      if (method === "GET") return playerDetail(context.env.DB, parts[1]);
      if (method === "PATCH") return patchPlayer(request, context.env.DB, parts[1]);
    }
    if (parts[0] === "events" && parts.length === 1) {
      if (method === "GET") return listEvents(request, context.env.DB);
      if (method === "POST") return createEvent(request, context.env.DB, context.data.organizer);
    }
    if (parts[0] === "events" && parts[1] && parts.length === 2) {
      if (method === "GET") return eventDetail(context.env.DB, parts[1]);
      if (method === "PATCH") {
        return patchEvent(request, context.env.DB, parts[1], context.data.organizer);
      }
    }
    if (method === "POST" && parts[0] === "events" && parts[2] === "players" && parts.length === 3) {
      return addEventPlayer(request, context.env.DB, parts[1], context.data.organizer);
    }
    if (parts[0] === "events" && parts[2] === "players" && parts[3] && parts.length === 4) {
      if (method === "PATCH") {
        return patchEventPlayer(request, context.env.DB, parts[1], parts[3], context.data.organizer);
      }
      if (method === "DELETE") {
        return removeEventPlayer(request, context.env.DB, parts[1], parts[3], context.data.organizer);
      }
    }
    if (method === "POST" && parts[0] === "events" && parts[2] === "complete" && parts.length === 3) {
      return completeEvent(context.env.DB, parts[1], context.data.organizer);
    }
    if (method === "POST" && parts[0] === "events" && parts[2] === "reopen" && parts.length === 3) {
      return reopenEvent(request, context.env.DB, parts[1], context.data.organizer);
    }

    return apiError(404, "NOT_FOUND", "API route not found.");
  } catch (error) {
    if (error instanceof ZodError) return validationError(error);
    if (error instanceof TypeError) return apiError(400, "BAD_REQUEST", error.message);
    if (error instanceof Response) {
      return apiError(error.status, "REQUEST_REJECTED", await error.text());
    }
    return apiError(500, "INTERNAL_ERROR", "The request could not be completed.");
  }
};
