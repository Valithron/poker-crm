import { ZodError } from "zod";
import {
  calculateLedger,
  ledgerEntryCreateSchema,
  ledgerEntryDeleteSchema,
  ledgerEntryPatchSchema,
  moneyCompleteSchema,
  moneyEventPatchSchema,
  type LedgerEntryType,
} from "../../shared/money";
import { apiError, json, readJson, validationError } from "../lib/http";
import type { AppPagesFunction, OrganizerIdentity } from "../lib/types";

interface MoneyEventRow {
  id: string;
  title: string;
  status: "draft" | "open" | "active" | "completed" | "cancelled" | "archived";
  money_tracking_enabled: number;
  default_buy_in_cents: number;
  stakes_notes: string | null;
}

interface MoneyPlayerRow {
  player_id: string;
  display_name: string;
  attended: number;
  rsvp_status: "pending" | "yes" | "maybe" | "no";
}

interface LedgerRow {
  id: string;
  event_id: string;
  player_id: string;
  player_name: string;
  entry_type: LedgerEntryType;
  amount_cents: number;
  note: string | null;
  organizer_name: string;
  created_at: string;
  updated_at: string;
}

interface PlayerHistoryEventRow extends MoneyEventRow {
  starts_at: string;
  location: string;
}

function isLocked(status: MoneyEventRow["status"]): boolean {
  return ["completed", "cancelled", "archived"].includes(status);
}

function requireCorrection(event: MoneyEventRow, correctionNote?: string): string | undefined {
  if (!isLocked(event.status)) return undefined;
  if (!correctionNote) {
    throw new Response("A correction note is required to change money records on a locked event.", {
      status: 409,
    });
  }
  return correctionNote;
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

async function getEvent(db: D1Database, eventId: string): Promise<MoneyEventRow | null> {
  return db
    .prepare(
      `SELECT id, title, status, money_tracking_enabled, default_buy_in_cents, stakes_notes
       FROM events
       WHERE id = ?1`,
    )
    .bind(eventId)
    .first<MoneyEventRow>();
}

async function requireEvent(db: D1Database, eventId: string): Promise<MoneyEventRow> {
  const event = await getEvent(db, eventId);
  if (!event) throw new Response("Event not found.", { status: 404 });
  return event;
}

async function getPlayers(db: D1Database, eventId: string): Promise<MoneyPlayerRow[]> {
  const rows = await db
    .prepare(
      `SELECT ep.player_id, p.display_name, ep.attended, ep.rsvp_status
       FROM event_players ep
       JOIN players p ON p.id = ep.player_id
       WHERE ep.event_id = ?1
       ORDER BY ep.attended DESC, p.display_name COLLATE NOCASE`,
    )
    .bind(eventId)
    .all<MoneyPlayerRow>();
  return rows.results;
}

async function getEntries(db: D1Database, eventId: string): Promise<LedgerRow[]> {
  const rows = await db
    .prepare(
      `SELECT le.*, p.display_name AS player_name, o.display_name AS organizer_name
       FROM ledger_entries le
       JOIN players p ON p.id = le.player_id
       JOIN organizers o ON o.id = le.created_by_organizer_id
       WHERE le.event_id = ?1
       ORDER BY le.created_at DESC, le.id DESC`,
    )
    .bind(eventId)
    .all<LedgerRow>();
  return rows.results;
}

function detailJson(event: MoneyEventRow, players: MoneyPlayerRow[], entries: LedgerRow[]) {
  const totals = calculateLedger(
    entries.map((entry) => ({
      playerId: entry.player_id,
      entryType: entry.entry_type,
      amountCents: Number(entry.amount_cents),
    })),
  );
  const summaries = new Map(totals.playerSummaries.map((summary) => [summary.playerId, summary]));
  const playerJson = players.map((player) => {
    const summary = summaries.get(player.player_id);
    return {
      playerId: player.player_id,
      displayName: player.display_name,
      attended: Boolean(player.attended),
      rsvpStatus: player.rsvp_status,
      cashInCents: summary?.cashInCents ?? 0,
      cashOutCents: summary?.cashOutCents ?? 0,
      netCents: summary?.netCents ?? 0,
      rebuyCount: summary?.rebuyCount ?? 0,
      hasCashOut: summary?.hasCashOut ?? false,
    };
  });

  const missingCashOuts = playerJson.filter((player) => player.attended && !player.hasCashOut);
  const issues: string[] = [];
  if (event.money_tracking_enabled) {
    if (missingCashOuts.length) {
      issues.push(
        `${missingCashOuts.length} attending player${missingCashOuts.length === 1 ? " is" : "s are"} missing a cash-out.`,
      );
    }
    if (totals.differenceCents !== 0) {
      issues.push("Cash in and cash out do not balance.");
    }
  }

  return {
    event: {
      id: event.id,
      title: event.title,
      status: event.status,
      moneyTrackingEnabled: Boolean(event.money_tracking_enabled),
      defaultBuyInCents: Number(event.default_buy_in_cents),
      stakesNotes: event.stakes_notes,
    },
    players: playerJson,
    entries: entries.map((entry) => ({
      id: entry.id,
      eventId: entry.event_id,
      playerId: entry.player_id,
      playerName: entry.player_name,
      entryType: entry.entry_type,
      amountCents: Number(entry.amount_cents),
      note: entry.note,
      organizerName: entry.organizer_name,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
    })),
    totals: {
      cashInCents: totals.cashInCents,
      cashOutCents: totals.cashOutCents,
      differenceCents: totals.differenceCents,
      missingCashOutCount: missingCashOuts.length,
      balanced: totals.differenceCents === 0,
    },
    issues,
    closeoutReady: !event.money_tracking_enabled || issues.length === 0,
  };
}

async function eventDetail(db: D1Database, eventId: string): Promise<Response> {
  const [event, players, entries] = await Promise.all([
    requireEvent(db, eventId),
    getPlayers(db, eventId),
    getEntries(db, eventId),
  ]);
  return json(detailJson(event, players, entries));
}

async function patchMoneyEvent(
  request: Request,
  db: D1Database,
  eventId: string,
  organizer: OrganizerIdentity,
): Promise<Response> {
  const event = await requireEvent(db, eventId);
  const input = moneyEventPatchSchema.parse(await readJson(request));
  const correction = requireCorrection(event, input.correctionNote);

  if (input.moneyTrackingEnabled === false) {
    const count = await db
      .prepare("SELECT COUNT(*) AS count FROM ledger_entries WHERE event_id = ?1")
      .bind(eventId)
      .first<{ count: number }>();
    if (Number(count?.count ?? 0) > 0) {
      return apiError(409, "LEDGER_EXISTS", "Delete all ledger entries before turning money tracking off.");
    }
  }

  const before = {
    moneyTrackingEnabled: Boolean(event.money_tracking_enabled),
    defaultBuyInCents: Number(event.default_buy_in_cents),
    stakesNotes: event.stakes_notes,
  };
  const after = {
    moneyTrackingEnabled: input.moneyTrackingEnabled ?? before.moneyTrackingEnabled,
    defaultBuyInCents: input.defaultBuyInCents ?? before.defaultBuyInCents,
    stakesNotes: input.stakesNotes !== undefined ? input.stakesNotes : before.stakesNotes,
  };
  const now = new Date().toISOString();
  const update = db
    .prepare(
      `UPDATE events
       SET money_tracking_enabled = ?1,
           default_buy_in_cents = ?2,
           stakes_notes = NULLIF(?3, ''),
           updated_at = ?4
       WHERE id = ?5`,
    )
    .bind(
      after.moneyTrackingEnabled ? 1 : 0,
      after.defaultBuyInCents,
      after.stakesNotes ?? "",
      now,
      eventId,
    );

  if (correction) {
    await db.batch([
      update,
      auditStatement(
        db,
        eventId,
        organizer,
        "money_settings_corrected",
        { correctionNote: correction, before, after },
        now,
      ),
    ]);
  } else {
    await update.run();
  }
  return eventDetail(db, eventId);
}

async function createEntry(
  request: Request,
  db: D1Database,
  eventId: string,
  organizer: OrganizerIdentity,
): Promise<Response> {
  const event = await requireEvent(db, eventId);
  if (!event.money_tracking_enabled) {
    return apiError(409, "MONEY_DISABLED", "Enable money tracking before adding ledger entries.");
  }
  const input = ledgerEntryCreateSchema.parse(await readJson(request));
  const correction = requireCorrection(event, input.correctionNote);
  const rostered = await db
    .prepare("SELECT id FROM event_players WHERE event_id = ?1 AND player_id = ?2")
    .bind(eventId, input.playerId)
    .first<{ id: string }>();
  if (!rostered) return apiError(409, "NOT_ROSTERED", "Add the player to the event roster first.");

  const now = new Date().toISOString();
  const entryId = crypto.randomUUID();
  const insert = db
    .prepare(
      `INSERT INTO ledger_entries
       (id, event_id, player_id, entry_type, amount_cents, note,
        created_by_organizer_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, NULLIF(?6, ''), ?7, ?8, ?8)`,
    )
    .bind(
      entryId,
      eventId,
      input.playerId,
      input.entryType,
      input.amountCents,
      input.note ?? "",
      organizer.id,
      now,
    );

  if (correction) {
    await db.batch([
      insert,
      auditStatement(
        db,
        eventId,
        organizer,
        "ledger_entry_added_correction",
        {
          correctionNote: correction,
          entryId,
          playerId: input.playerId,
          entryType: input.entryType,
          amountCents: input.amountCents,
          note: input.note ?? null,
        },
        now,
      ),
    ]);
  } else {
    await insert.run();
  }
  return eventDetail(db, eventId);
}

async function patchEntry(
  request: Request,
  db: D1Database,
  eventId: string,
  entryId: string,
  organizer: OrganizerIdentity,
): Promise<Response> {
  const event = await requireEvent(db, eventId);
  const input = ledgerEntryPatchSchema.parse(await readJson(request));
  const correction = requireCorrection(event, input.correctionNote);
  const current = await db
    .prepare("SELECT * FROM ledger_entries WHERE id = ?1 AND event_id = ?2")
    .bind(entryId, eventId)
    .first<{
      id: string;
      player_id: string;
      entry_type: LedgerEntryType;
      amount_cents: number;
      note: string | null;
    }>();
  if (!current) return apiError(404, "NOT_FOUND", "Ledger entry not found.");

  const merged = ledgerEntryCreateSchema.parse({
    playerId: current.player_id,
    entryType: input.entryType ?? current.entry_type,
    amountCents: input.amountCents ?? Number(current.amount_cents),
    note: input.note !== undefined ? input.note : current.note,
    correctionNote: input.correctionNote,
  });
  const before = {
    entryType: current.entry_type,
    amountCents: Number(current.amount_cents),
    note: current.note,
  };
  const after = {
    entryType: merged.entryType,
    amountCents: merged.amountCents,
    note: merged.note ?? null,
  };
  const now = new Date().toISOString();
  const update = db
    .prepare(
      `UPDATE ledger_entries
       SET entry_type = ?1, amount_cents = ?2, note = NULLIF(?3, ''), updated_at = ?4
       WHERE id = ?5 AND event_id = ?6`,
    )
    .bind(after.entryType, after.amountCents, after.note ?? "", now, entryId, eventId);

  if (correction) {
    await db.batch([
      update,
      auditStatement(
        db,
        eventId,
        organizer,
        "ledger_entry_corrected",
        { correctionNote: correction, entryId, playerId: current.player_id, before, after },
        now,
      ),
    ]);
  } else {
    await update.run();
  }
  return eventDetail(db, eventId);
}

async function deleteEntry(
  request: Request,
  db: D1Database,
  eventId: string,
  entryId: string,
  organizer: OrganizerIdentity,
): Promise<Response> {
  const event = await requireEvent(db, eventId);
  const input = ledgerEntryDeleteSchema.parse(await readJson(request));
  const correction = requireCorrection(event, input.correctionNote);
  const current = await db
    .prepare("SELECT * FROM ledger_entries WHERE id = ?1 AND event_id = ?2")
    .bind(entryId, eventId)
    .first<{
      id: string;
      player_id: string;
      entry_type: LedgerEntryType;
      amount_cents: number;
      note: string | null;
    }>();
  if (!current) return apiError(404, "NOT_FOUND", "Ledger entry not found.");

  const remove = db
    .prepare("DELETE FROM ledger_entries WHERE id = ?1 AND event_id = ?2")
    .bind(entryId, eventId);
  if (correction) {
    const now = new Date().toISOString();
    await db.batch([
      remove,
      auditStatement(
        db,
        eventId,
        organizer,
        "ledger_entry_removed_correction",
        {
          correctionNote: correction,
          entryId,
          playerId: current.player_id,
          entryType: current.entry_type,
          amountCents: Number(current.amount_cents),
          note: current.note,
        },
        now,
      ),
    ]);
  } else {
    await remove.run();
  }
  return eventDetail(db, eventId);
}

async function completeMoneyEvent(
  request: Request,
  db: D1Database,
  eventId: string,
  organizer: OrganizerIdentity,
): Promise<Response> {
  const input = moneyCompleteSchema.parse(await readJson(request));
  const [event, players, entries] = await Promise.all([
    requireEvent(db, eventId),
    getPlayers(db, eventId),
    getEntries(db, eventId),
  ]);
  if (event.status !== "active") {
    return apiError(409, "INVALID_TRANSITION", "Start Live Night before completing the event.");
  }
  const detail = detailJson(event, players, entries);
  if (detail.event.moneyTrackingEnabled && detail.issues.length) {
    return apiError(409, "UNRESOLVED_CLOSEOUT", detail.issues.join(" "), {
      closeout: detail.issues,
    });
  }

  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `UPDATE events
         SET status = 'completed', completed_at = ?1, updated_at = ?1
         WHERE id = ?2 AND status = 'active'`,
      )
      .bind(now, eventId),
    auditStatement(
      db,
      eventId,
      organizer,
      "event_completed",
      {
        correctionNote: input.correctionNote,
        moneyTrackingEnabled: detail.event.moneyTrackingEnabled,
        cashInCents: detail.totals.cashInCents,
        cashOutCents: detail.totals.cashOutCents,
        differenceCents: detail.totals.differenceCents,
        attendanceCount: players.filter((player) => Boolean(player.attended)).length,
      },
      now,
    ),
  ]);
  return eventDetail(db, eventId);
}

async function playerMoneyHistory(db: D1Database, playerId: string): Promise<Response> {
  const player = await db
    .prepare("SELECT id, display_name FROM players WHERE id = ?1")
    .bind(playerId)
    .first<{ id: string; display_name: string }>();
  if (!player) return apiError(404, "NOT_FOUND", "Player not found.");

  const eventRows = await db
    .prepare(
      `SELECT e.id, e.title, e.status, e.money_tracking_enabled, e.default_buy_in_cents,
              e.stakes_notes, e.starts_at, e.location
       FROM events e
       JOIN event_players ep ON ep.event_id = e.id
       WHERE ep.player_id = ?1
         AND e.status = 'completed'
         AND e.money_tracking_enabled = 1
       ORDER BY e.starts_at DESC`,
    )
    .bind(playerId)
    .all<PlayerHistoryEventRow>();

  const history = await Promise.all(
    eventRows.results.map(async (event) => {
      const entries = await db
        .prepare(
          `SELECT player_id, entry_type, amount_cents
           FROM ledger_entries
           WHERE event_id = ?1 AND player_id = ?2`,
        )
        .bind(event.id, playerId)
        .all<{ player_id: string; entry_type: LedgerEntryType; amount_cents: number }>();
      const totals = calculateLedger(
        entries.results.map((entry) => ({
          playerId: entry.player_id,
          entryType: entry.entry_type,
          amountCents: Number(entry.amount_cents),
        })),
      );
      const summary = totals.playerSummaries[0];
      return {
        eventId: event.id,
        title: event.title,
        startsAt: event.starts_at,
        location: event.location,
        stakesNotes: event.stakes_notes,
        cashInCents: summary?.cashInCents ?? 0,
        cashOutCents: summary?.cashOutCents ?? 0,
        netCents: summary?.netCents ?? 0,
        rebuyCount: summary?.rebuyCount ?? 0,
      };
    }),
  );

  return json({ player: { id: player.id, displayName: player.display_name }, history });
}

export const onRequest: AppPagesFunction = async (context) => {
  const request = context.request;
  const method = request.method.toUpperCase();
  const path = new URL(request.url).pathname.replace(/^\/money-api\/?/, "");
  const parts = path.split("/").filter(Boolean);

  try {
    if (parts[0] === "events" && parts[1] && parts.length === 2) {
      if (method === "GET") return eventDetail(context.env.DB, parts[1]);
      if (method === "PATCH") {
        return patchMoneyEvent(request, context.env.DB, parts[1], context.data.organizer);
      }
    }
    if (method === "POST" && parts[0] === "events" && parts[2] === "entries" && parts.length === 3) {
      return createEntry(request, context.env.DB, parts[1], context.data.organizer);
    }
    if (parts[0] === "events" && parts[2] === "entries" && parts[3] && parts.length === 4) {
      if (method === "PATCH") {
        return patchEntry(request, context.env.DB, parts[1], parts[3], context.data.organizer);
      }
      if (method === "DELETE") {
        return deleteEntry(request, context.env.DB, parts[1], parts[3], context.data.organizer);
      }
    }
    if (method === "POST" && parts[0] === "events" && parts[2] === "complete" && parts.length === 3) {
      return completeMoneyEvent(request, context.env.DB, parts[1], context.data.organizer);
    }
    if (method === "GET" && parts[0] === "players" && parts[1] && parts.length === 2) {
      return playerMoneyHistory(context.env.DB, parts[1]);
    }

    return apiError(404, "NOT_FOUND", "Money API route not found.");
  } catch (error) {
    if (error instanceof ZodError) return validationError(error);
    if (error instanceof TypeError) return apiError(400, "BAD_REQUEST", error.message);
    if (error instanceof Response) {
      return apiError(error.status, "REQUEST_REJECTED", await error.text());
    }
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Money closeout is unresolved")) {
      return apiError(
        409,
        "UNRESOLVED_CLOSEOUT",
        "Record every attending player's cash-out and balance cash in against cash out before completing.",
      );
    }
    return apiError(500, "INTERNAL_ERROR", "The money request could not be completed.");
  }
};
