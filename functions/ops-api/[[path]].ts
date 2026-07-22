import { ZodError } from "zod";
import {
  buildInviteText,
  operationsEventCreateSchema,
  operationsEventPatchSchema,
  operationsSettingsPatchSchema,
  organizerCreateSchema,
  organizerPatchSchema,
  summarizeRsvps,
  type OrganizerRole,
} from "../../shared/operations";
import { apiError, json, readJson, validationError } from "../lib/http";
import type { AppPagesFunction, OrganizerIdentity } from "../lib/types";

interface SettingsRow {
  default_location: string;
  default_game_notes: string | null;
  default_stakes_notes: string | null;
  default_money_tracking_enabled: number;
  default_buy_in_cents: number;
  updated_at: string;
  updated_by_name: string | null;
}

interface OrganizerRow {
  id: string;
  email: string;
  display_name: string;
  role: OrganizerRole;
  active: number;
  created_at: string;
  updated_at: string;
}

interface EventSummaryRow {
  id: string;
  title: string;
  starts_at: string;
  host_player_id: string | null;
  host_name: string | null;
  location: string;
  game_notes: string | null;
  stakes_notes: string | null;
  notes: string | null;
  capacity: number | null;
  money_tracking_enabled: number;
  default_buy_in_cents: number;
  status: "draft" | "open" | "active" | "completed" | "cancelled" | "archived";
  player_count: number;
  attendance_count: number;
  invited_count: number;
  yes_count: number;
  maybe_count: number;
  no_count: number;
  pending_count: number;
  cash_in_cents: number;
  cash_out_cents: number;
  missing_cash_outs: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface EventPlayerRow {
  id: string;
  player_id: string;
  display_name: string;
  invitation_status: "invited" | "not_invited";
  rsvp_status: "pending" | "yes" | "maybe" | "no";
  attended: number;
  checked_in_at: string | null;
}

interface SearchPlayerRow {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  status: "active" | "archived";
}

interface SearchEventRow {
  id: string;
  title: string;
  starts_at: string;
  location: string;
  status: EventSummaryRow["status"];
  host_name: string | null;
}

function settingsJson(row: SettingsRow) {
  return {
    defaultLocation: row.default_location,
    defaultGameNotes: row.default_game_notes,
    defaultStakesNotes: row.default_stakes_notes,
    defaultMoneyTrackingEnabled: Boolean(row.default_money_tracking_enabled),
    defaultBuyInCents: Number(row.default_buy_in_cents),
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name,
  };
}

function organizerJson(row: OrganizerRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function eventSummaryJson(row: EventSummaryRow) {
  const cashInCents = Number(row.cash_in_cents ?? 0);
  const cashOutCents = Number(row.cash_out_cents ?? 0);
  const yes = Number(row.yes_count ?? 0);
  const maybe = Number(row.maybe_count ?? 0);
  return {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    hostPlayerId: row.host_player_id,
    hostName: row.host_name,
    location: row.location,
    gameNotes: row.game_notes,
    stakesNotes: row.stakes_notes,
    notes: row.notes,
    capacity: row.capacity,
    moneyTrackingEnabled: Boolean(row.money_tracking_enabled),
    defaultBuyInCents: Number(row.default_buy_in_cents ?? 0),
    status: row.status,
    playerCount: Number(row.player_count ?? 0),
    attendanceCount: Number(row.attendance_count ?? 0),
    rsvp: {
      invited: Number(row.invited_count ?? 0),
      yes,
      maybe,
      no: Number(row.no_count ?? 0),
      pending: Number(row.pending_count ?? 0),
      expected: yes + maybe,
    },
    cashInCents,
    cashOutCents,
    differenceCents: cashInCents - cashOutCents,
    missingCashOuts: Number(row.missing_cash_outs ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function eventPlayerJson(row: EventPlayerRow) {
  return {
    id: row.id,
    playerId: row.player_id,
    displayName: row.display_name,
    invitationStatus: row.invitation_status,
    rsvpStatus: row.rsvp_status,
    attended: Boolean(row.attended),
    checkedInAt: row.checked_in_at,
  };
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

async function getSettings(db: D1Database): Promise<SettingsRow> {
  const row = await db
    .prepare(
      `SELECT s.*, o.display_name AS updated_by_name
       FROM app_settings s
       LEFT JOIN organizers o ON o.id = s.updated_by_organizer_id
       WHERE s.id = 1`,
    )
    .first<SettingsRow>();
  if (!row) throw new Response("Application settings are not initialized.", { status: 500 });
  return row;
}

const eventSummarySelect = `
  SELECT e.*, host.display_name AS host_name,
    COUNT(DISTINCT ep.id) AS player_count,
    COALESCE(SUM(CASE WHEN ep.attended = 1 THEN 1 ELSE 0 END), 0) AS attendance_count,
    COALESCE(SUM(CASE WHEN ep.invitation_status = 'invited' THEN 1 ELSE 0 END), 0) AS invited_count,
    COALESCE(SUM(CASE WHEN ep.invitation_status = 'invited' AND ep.rsvp_status = 'yes' THEN 1 ELSE 0 END), 0) AS yes_count,
    COALESCE(SUM(CASE WHEN ep.invitation_status = 'invited' AND ep.rsvp_status = 'maybe' THEN 1 ELSE 0 END), 0) AS maybe_count,
    COALESCE(SUM(CASE WHEN ep.invitation_status = 'invited' AND ep.rsvp_status = 'no' THEN 1 ELSE 0 END), 0) AS no_count,
    COALESCE(SUM(CASE WHEN ep.invitation_status = 'invited' AND ep.rsvp_status = 'pending' THEN 1 ELSE 0 END), 0) AS pending_count,
    COALESCE((
      SELECT SUM(CASE
        WHEN le.entry_type IN ('buy_in', 'rebuy') THEN le.amount_cents
        WHEN le.entry_type = 'adjustment' AND le.amount_cents > 0 THEN le.amount_cents
        ELSE 0 END)
      FROM ledger_entries le WHERE le.event_id = e.id
    ), 0) AS cash_in_cents,
    COALESCE((
      SELECT SUM(CASE
        WHEN le.entry_type = 'cash_out' THEN le.amount_cents
        WHEN le.entry_type = 'adjustment' AND le.amount_cents < 0 THEN -le.amount_cents
        ELSE 0 END)
      FROM ledger_entries le WHERE le.event_id = e.id
    ), 0) AS cash_out_cents,
    COALESCE((
      SELECT COUNT(*) FROM event_players attended
      WHERE attended.event_id = e.id
        AND attended.attended = 1
        AND NOT EXISTS (
          SELECT 1 FROM ledger_entries cashout
          WHERE cashout.event_id = e.id
            AND cashout.player_id = attended.player_id
            AND cashout.entry_type = 'cash_out'
        )
    ), 0) AS missing_cash_outs
  FROM events e
  LEFT JOIN players host ON host.id = e.host_player_id
  LEFT JOIN event_players ep ON ep.event_id = e.id
`;

async function requireEvent(db: D1Database, id: string): Promise<EventSummaryRow> {
  const row = await db
    .prepare(`${eventSummarySelect} WHERE e.id = ?1 GROUP BY e.id`)
    .bind(id)
    .first<EventSummaryRow>();
  if (!row) throw new Response("Event not found.", { status: 404 });
  return row;
}

function requireAdmin(organizer: OrganizerIdentity): void {
  if (organizer.role !== "admin") {
    throw new Response("Admin access is required for organizer management.", { status: 403 });
  }
}

async function dashboard(db: D1Database): Promise<Response> {
  const [settings, activePlayers, currentRows, recentRows] = await Promise.all([
    getSettings(db),
    db.prepare("SELECT COUNT(*) AS count FROM players WHERE status = 'active'").first<{ count: number }>(),
    db
      .prepare(
        `${eventSummarySelect}
         WHERE e.status IN ('draft', 'open', 'active')
         GROUP BY e.id
         ORDER BY CASE e.status WHEN 'active' THEN 0 WHEN 'open' THEN 1 ELSE 2 END, e.starts_at ASC
         LIMIT 12`,
      )
      .all<EventSummaryRow>(),
    db
      .prepare(
        `${eventSummarySelect}
         WHERE e.status = 'completed'
         GROUP BY e.id
         ORDER BY e.completed_at DESC
         LIMIT 6`,
      )
      .all<EventSummaryRow>(),
  ]);

  const currentEvents = currentRows.results.map(eventSummaryJson);
  const incompleteCloseouts = currentEvents.filter(
    (event) =>
      event.status === "active" &&
      (!event.moneyTrackingEnabled || event.missingCashOuts > 0 || event.differenceCents !== 0),
  );

  return json({
    settings: settingsJson(settings),
    activePlayerCount: Number(activePlayers?.count ?? 0),
    currentEvents,
    nextEvent: currentEvents[0] ?? null,
    incompleteCloseouts,
    recentEvents: recentRows.results.map(eventSummaryJson),
  });
}

async function search(request: Request, db: D1Database): Promise<Response> {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const scope = url.searchParams.get("scope") ?? "all";
  if (!query) return json({ players: [], events: [] });
  if (!['all', 'players', 'events'].includes(scope)) {
    return apiError(400, "BAD_REQUEST", "Search scope is invalid.");
  }
  const pattern = `%${query.replaceAll("%", "").replaceAll("_", "")}%`;

  const playersPromise =
    scope === "events"
      ? Promise.resolve({ results: [] as SearchPlayerRow[] })
      : db
          .prepare(
            `SELECT id, display_name, email, phone, status
             FROM players
             WHERE display_name LIKE ?1 COLLATE NOCASE
                OR COALESCE(email, '') LIKE ?1 COLLATE NOCASE
                OR COALESCE(phone, '') LIKE ?1 COLLATE NOCASE
             ORDER BY status, display_name COLLATE NOCASE
             LIMIT 30`,
          )
          .bind(pattern)
          .all<SearchPlayerRow>();

  const eventsPromise =
    scope === "players"
      ? Promise.resolve({ results: [] as SearchEventRow[] })
      : db
          .prepare(
            `SELECT e.id, e.title, e.starts_at, e.location, e.status,
                    p.display_name AS host_name
             FROM events e
             LEFT JOIN players p ON p.id = e.host_player_id
             WHERE e.title LIKE ?1 COLLATE NOCASE
                OR e.location LIKE ?1 COLLATE NOCASE
                OR COALESCE(p.display_name, '') LIKE ?1 COLLATE NOCASE
             ORDER BY e.starts_at DESC
             LIMIT 30`,
          )
          .bind(pattern)
          .all<SearchEventRow>();

  const [players, events] = await Promise.all([playersPromise, eventsPromise]);
  return json({
    players: players.results.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      email: row.email,
      phone: row.phone,
      status: row.status,
    })),
    events: events.results.map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: row.starts_at,
      location: row.location,
      status: row.status,
      hostName: row.host_name,
    })),
  });
}

async function settings(db: D1Database): Promise<Response> {
  const [settingsRow, organizers, players] = await Promise.all([
    getSettings(db),
    db.prepare("SELECT * FROM organizers ORDER BY active DESC, display_name COLLATE NOCASE").all<OrganizerRow>(),
    db
      .prepare("SELECT id, display_name FROM players WHERE status = 'active' ORDER BY display_name COLLATE NOCASE")
      .all<{ id: string; display_name: string }>(),
  ]);
  return json({
    settings: settingsJson(settingsRow),
    organizers: organizers.results.map(organizerJson),
    activePlayers: players.results.map((row) => ({ id: row.id, displayName: row.display_name })),
  });
}

async function patchSettings(
  request: Request,
  db: D1Database,
  organizer: OrganizerIdentity,
): Promise<Response> {
  const input = operationsSettingsPatchSchema.parse(await readJson(request));
  const current = await getSettings(db);
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE app_settings
       SET default_location = ?1,
           default_game_notes = ?2,
           default_stakes_notes = ?3,
           default_money_tracking_enabled = ?4,
           default_buy_in_cents = ?5,
           updated_by_organizer_id = ?6,
           updated_at = ?7
       WHERE id = 1`,
    )
    .bind(
      input.defaultLocation ?? current.default_location,
      input.defaultGameNotes !== undefined ? input.defaultGameNotes : current.default_game_notes,
      input.defaultStakesNotes !== undefined ? input.defaultStakesNotes : current.default_stakes_notes,
      input.defaultMoneyTrackingEnabled !== undefined
        ? input.defaultMoneyTrackingEnabled
          ? 1
          : 0
        : current.default_money_tracking_enabled,
      input.defaultBuyInCents ?? current.default_buy_in_cents,
      organizer.id,
      now,
    )
    .run();
  return settings(db);
}

async function createOrganizer(
  request: Request,
  db: D1Database,
  organizer: OrganizerIdentity,
): Promise<Response> {
  requireAdmin(organizer);
  const input = organizerCreateSchema.parse(await readJson(request));
  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO organizers
         (id, email, display_name, role, active, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)`,
      )
      .bind(crypto.randomUUID(), input.email, input.displayName, input.role, now)
      .run();
  } catch {
    return apiError(409, "ALREADY_EXISTS", "An organizer with that email already exists.");
  }
  return settings(db);
}

async function patchOrganizer(
  request: Request,
  db: D1Database,
  id: string,
  organizer: OrganizerIdentity,
): Promise<Response> {
  requireAdmin(organizer);
  const current = await db.prepare("SELECT * FROM organizers WHERE id = ?1").bind(id).first<OrganizerRow>();
  if (!current) return apiError(404, "NOT_FOUND", "Organizer not found.");
  const input = organizerPatchSchema.parse(await readJson(request));

  if (id === organizer.id && (input.active === false || input.role === "organizer")) {
    return apiError(409, "SELF_LOCKOUT", "You cannot remove your own admin access.");
  }

  if (current.role === "admin" && current.active && (input.active === false || input.role === "organizer")) {
    const adminCount = await db
      .prepare("SELECT COUNT(*) AS count FROM organizers WHERE role = 'admin' AND active = 1")
      .first<{ count: number }>();
    if (Number(adminCount?.count ?? 0) <= 1) {
      return apiError(409, "LAST_ADMIN", "At least one active admin is required.");
    }
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE organizers
       SET display_name = ?1, role = ?2, active = ?3, updated_at = ?4
       WHERE id = ?5`,
    )
    .bind(
      input.displayName ?? current.display_name,
      input.role ?? current.role,
      input.active !== undefined ? (input.active ? 1 : 0) : current.active,
      now,
      id,
    )
    .run();
  return settings(db);
}

async function createEvent(
  request: Request,
  db: D1Database,
  organizer: OrganizerIdentity,
): Promise<Response> {
  const input = operationsEventCreateSchema.parse(await readJson(request));
  const defaults = await getSettings(db);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO events
       (id, title, starts_at, host_player_id, location, game_notes, stakes_notes,
        capacity, money_tracking_enabled, default_buy_in_cents, notes, status,
        created_by_organizer_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'draft', ?12, ?13, ?13)`,
    )
    .bind(
      id,
      input.title,
      input.startsAt,
      input.hostPlayerId ?? null,
      input.location ?? defaults.default_location,
      input.gameNotes !== undefined ? input.gameNotes : defaults.default_game_notes,
      input.stakesNotes !== undefined ? input.stakesNotes : defaults.default_stakes_notes,
      input.capacity ?? null,
      input.moneyTrackingEnabled !== undefined
        ? input.moneyTrackingEnabled
          ? 1
          : 0
        : defaults.default_money_tracking_enabled,
      input.defaultBuyInCents ?? defaults.default_buy_in_cents,
      input.notes ?? null,
      organizer.id,
      now,
    )
    .run();
  await auditStatement(db, id, organizer, "event_created_from_defaults", {}, now).run();
  const event = await requireEvent(db, id);
  return json({ event: eventSummaryJson(event) }, { status: 201 });
}

async function eventDetail(db: D1Database, id: string): Promise<Response> {
  const [event, players] = await Promise.all([
    requireEvent(db, id),
    db
      .prepare(
        `SELECT ep.id, ep.player_id, p.display_name, ep.invitation_status,
                ep.rsvp_status, ep.attended, ep.checked_in_at
         FROM event_players ep
         JOIN players p ON p.id = ep.player_id
         WHERE ep.event_id = ?1
         ORDER BY
           CASE ep.rsvp_status WHEN 'yes' THEN 0 WHEN 'maybe' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
           p.display_name COLLATE NOCASE`,
      )
      .bind(id)
      .all<EventPlayerRow>(),
  ]);
  const roster = players.results.map(eventPlayerJson);
  const rsvp = summarizeRsvps(roster);
  return json({
    event: eventSummaryJson(event),
    players: roster,
    rsvp,
    inviteText: buildInviteText({
      title: event.title,
      startsAt: event.starts_at,
      hostName: event.host_name,
      location: event.location,
      gameNotes: event.game_notes,
      stakesNotes: event.stakes_notes,
      capacity: event.capacity,
    }),
  });
}

function validOperationsTransition(current: EventSummaryRow["status"], next: string): boolean {
  if (next === "cancelled") return ["draft", "open"].includes(current);
  if (next === "open") return current === "draft";
  if (next === "archived") return ["draft", "cancelled", "completed"].includes(current);
  return false;
}

async function patchEvent(
  request: Request,
  db: D1Database,
  id: string,
  organizer: OrganizerIdentity,
): Promise<Response> {
  const event = await requireEvent(db, id);
  const input = operationsEventPatchSchema.parse(await readJson(request));
  const locked = ["completed", "cancelled", "archived"].includes(event.status);
  if (locked && !input.correctionNote) {
    return apiError(409, "LOCKED_EVENT", "A correction note is required for a locked event.");
  }
  if (input.status && !validOperationsTransition(event.status, input.status)) {
    return apiError(409, "INVALID_TRANSITION", `Cannot move from ${event.status} to ${input.status}.`);
  }

  const capacity = input.capacity !== undefined ? input.capacity : event.capacity;
  const status = input.status ?? event.status;
  const notes = input.quickNote
    ? [event.notes, `[${new Date().toLocaleString("en-US")}] ${input.quickNote}`].filter(Boolean).join("\n")
    : event.notes;
  const now = new Date().toISOString();
  const details: Record<string, unknown> = {};
  if (input.capacity !== undefined) details.capacity = { from: event.capacity, to: input.capacity };
  if (input.status !== undefined) details.status = { from: event.status, to: input.status };
  if (input.quickNote !== undefined) details.quickNote = input.quickNote;
  if (input.correctionNote) details.correctionNote = input.correctionNote;

  await db.batch([
    db
      .prepare(
        `UPDATE events
         SET capacity = ?1, status = ?2, notes = ?3, updated_at = ?4
         WHERE id = ?5`,
      )
      .bind(capacity, status, notes, now, id),
    auditStatement(db, id, organizer, locked ? "operations_event_corrected" : "operations_event_updated", details, now),
  ]);
  return eventDetail(db, id);
}

export const onRequest: AppPagesFunction = async (context) => {
  const request = context.request;
  const method = request.method.toUpperCase();
  const path = new URL(request.url).pathname.replace(/^\/ops-api\/?/, "");
  const parts = path.split("/").filter(Boolean);

  try {
    if (method === "GET" && parts[0] === "dashboard" && parts.length === 1) {
      return dashboard(context.env.DB);
    }
    if (method === "GET" && parts[0] === "search" && parts.length === 1) {
      return search(request, context.env.DB);
    }
    if (parts[0] === "settings" && parts.length === 1) {
      if (method === "GET") return settings(context.env.DB);
      if (method === "PATCH") return patchSettings(request, context.env.DB, context.data.organizer);
    }
    if (method === "POST" && parts[0] === "organizers" && parts.length === 1) {
      return createOrganizer(request, context.env.DB, context.data.organizer);
    }
    if (method === "PATCH" && parts[0] === "organizers" && parts[1] && parts.length === 2) {
      return patchOrganizer(request, context.env.DB, parts[1], context.data.organizer);
    }
    if (parts[0] === "events" && parts.length === 1 && method === "POST") {
      return createEvent(request, context.env.DB, context.data.organizer);
    }
    if (parts[0] === "events" && parts[1] && parts.length === 2) {
      if (method === "GET") return eventDetail(context.env.DB, parts[1]);
      if (method === "PATCH") {
        return patchEvent(request, context.env.DB, parts[1], context.data.organizer);
      }
    }

    return apiError(404, "NOT_FOUND", "Operations API route not found.");
  } catch (error) {
    if (error instanceof ZodError) return validationError(error);
    if (error instanceof TypeError) return apiError(400, "BAD_REQUEST", error.message);
    if (error instanceof Response) {
      return apiError(error.status, "REQUEST_REJECTED", await error.text());
    }
    return apiError(500, "INTERNAL_ERROR", "The operations request could not be completed.");
  }
};
