import { ZodError } from "zod";
import {
  canTransition,
  deriveDisplayName,
  eventCreateSchema,
  eventPatchSchema,
  eventPlayerCreateSchema,
  eventPlayerPatchSchema,
  playerCreateSchema,
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

async function requireEditableEvent(db: D1Database, id: string): Promise<EventRow> {
  const event = await getEvent(db, id);
  if (!event) throw new Response("Event not found", { status: 404 });
  if (["completed", "cancelled", "archived"].includes(event.status)) {
    throw new Response("Completed or cancelled events cannot be edited", { status: 409 });
  }
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

async function listPlayers(db: D1Database): Promise<Response> {
  const rows = await db
    .prepare("SELECT * FROM players WHERE status = 'active' ORDER BY display_name COLLATE NOCASE")
    .all<PlayerRow>();
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
       (id, title, starts_at, host_player_id, location, game_notes, status,
        created_by_organizer_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, NULLIF(?6, ''), 'draft', ?7, ?8, ?8)`,
    )
    .bind(
      id,
      input.title,
      input.startsAt,
      input.hostPlayerId ?? null,
      input.location,
      input.gameNotes ?? "",
      organizer.id,
      now,
    )
    .run();

  const event = await getEvent(db, id);
  return json({ event: eventJson(event as EventRow) }, { status: 201 });
}

async function eventDetail(db: D1Database, id: string): Promise<Response> {
  const [event, players] = await Promise.all([
    getEvent(db, id),
    db
      .prepare(
        `SELECT ep.*, p.display_name
         FROM event_players ep
         JOIN players p ON p.id = ep.player_id
         WHERE ep.event_id = ?1
         ORDER BY p.display_name COLLATE NOCASE`,
      )
      .bind(id)
      .all<EventPlayerRow>(),
  ]);
  if (!event) return apiError(404, "NOT_FOUND", "Event not found.");
  return json({ event: eventJson(event), players: players.results.map(eventPlayerJson) });
}

async function patchEvent(request: Request, db: D1Database, id: string): Promise<Response> {
  const current = await requireEditableEvent(db, id);
  const input = eventPatchSchema.parse(await readJson(request));

  if (input.status && !canTransition(current.status, input.status)) {
    return apiError(409, "INVALID_TRANSITION", `Cannot move from ${current.status} to ${input.status}.`);
  }

  const columnMap = {
    title: "title",
    startsAt: "starts_at",
    hostPlayerId: "host_player_id",
    location: "location",
    gameNotes: "game_notes",
    status: "status",
  } as const;
  const entries = Object.entries(input) as Array<[keyof typeof columnMap, unknown]>;
  const assignments = entries.map(([key], index) => `${columnMap[key]} = ?${index + 1}`);
  const values = entries.map(([, value]) => value);
  assignments.push(`updated_at = ?${values.length + 1}`);
  values.push(new Date().toISOString(), id);

  await db
    .prepare(`UPDATE events SET ${assignments.join(", ")} WHERE id = ?${values.length}`)
    .bind(...values)
    .run();

  const event = await getEvent(db, id);
  return json({ event: eventJson(event as EventRow) });
}

async function addEventPlayer(request: Request, db: D1Database, eventId: string): Promise<Response> {
  await requireEditableEvent(db, eventId);
  const input = eventPlayerCreateSchema.parse(await readJson(request));
  const player = await db
    .prepare("SELECT id FROM players WHERE id = ?1 AND status = 'active'")
    .bind(input.playerId)
    .first<{ id: string }>();
  if (!player) return apiError(404, "NOT_FOUND", "Player not found.");

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO event_players
         (id, event_id, player_id, invitation_status, rsvp_status, attended, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?6)`,
      )
      .bind(id, eventId, input.playerId, input.invitationStatus, input.rsvpStatus, now)
      .run();
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
): Promise<Response> {
  await requireEditableEvent(db, eventId);
  const input = eventPlayerPatchSchema.parse(await readJson(request));
  const updates: string[] = [];
  const values: unknown[] = [];

  if (input.rsvpStatus !== undefined) {
    values.push(input.rsvpStatus);
    updates.push(`rsvp_status = ?${values.length}`);
  }
  if (input.attended !== undefined) {
    values.push(input.attended ? 1 : 0);
    updates.push(`attended = ?${values.length}`);
    values.push(input.attended ? new Date().toISOString() : null);
    updates.push(`checked_in_at = ?${values.length}`);
  }
  if (input.notes !== undefined) {
    values.push(input.notes);
    updates.push(`notes = ?${values.length}`);
  }
  values.push(new Date().toISOString(), eventId, playerId);
  updates.push(`updated_at = ?${values.length - 2}`);

  const result = await db
    .prepare(
      `UPDATE event_players SET ${updates.join(", ")}
       WHERE event_id = ?${values.length - 1} AND player_id = ?${values.length}`,
    )
    .bind(...values)
    .run();

  if (!result.meta.changes) return apiError(404, "NOT_FOUND", "Event player not found.");
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
    db
      .prepare(
        `INSERT INTO event_audit_log
         (id, event_id, organizer_id, action, details_json, created_at)
         VALUES (?1, ?2, ?3, 'event_completed', ?4, ?5)`,
      )
      .bind(
        crypto.randomUUID(),
        id,
        organizer.id,
        JSON.stringify({ attendanceCount: event.attendance_count ?? 0 }),
        now,
      ),
  ]);

  const completed = await getEvent(db, id);
  return json({ event: eventJson(completed as EventRow) });
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
      if (method === "GET") return listPlayers(context.env.DB);
      if (method === "POST") return createPlayer(request, context.env.DB);
    }
    if (method === "GET" && parts[0] === "players" && parts[1] && parts.length === 2) {
      return playerDetail(context.env.DB, parts[1]);
    }
    if (parts[0] === "events" && parts.length === 1) {
      if (method === "GET") return listEvents(request, context.env.DB);
      if (method === "POST") return createEvent(request, context.env.DB, context.data.organizer);
    }
    if (parts[0] === "events" && parts[1] && parts.length === 2) {
      if (method === "GET") return eventDetail(context.env.DB, parts[1]);
      if (method === "PATCH") return patchEvent(request, context.env.DB, parts[1]);
    }
    if (method === "POST" && parts[0] === "events" && parts[2] === "players" && parts.length === 3) {
      return addEventPlayer(request, context.env.DB, parts[1]);
    }
    if (
      method === "PATCH" &&
      parts[0] === "events" &&
      parts[2] === "players" &&
      parts[3] &&
      parts.length === 4
    ) {
      return patchEventPlayer(request, context.env.DB, parts[1], parts[3]);
    }
    if (
      method === "POST" &&
      parts[0] === "events" &&
      parts[2] === "complete" &&
      parts.length === 3
    ) {
      return completeEvent(context.env.DB, parts[1], context.data.organizer);
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
