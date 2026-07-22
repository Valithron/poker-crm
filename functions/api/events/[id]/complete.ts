import { calculateLedger, type LedgerEntryType } from "../../../../shared/money";
import { apiError, json } from "../../../lib/http";
import type { AppPagesFunction } from "../../../lib/types";

interface EventRow {
  id: string;
  title: string;
  starts_at: string;
  host_player_id: string | null;
  host_name: string | null;
  location: string;
  game_notes: string | null;
  notes: string | null;
  status: "draft" | "open" | "active" | "completed" | "cancelled" | "archived";
  money_tracking_enabled: number;
  default_buy_in_cents: number;
  stakes_notes: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  attendance_count: number;
  player_count: number;
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

export const onRequestPost: AppPagesFunction = async (context) => {
  const id = String(context.params.id ?? "");
  const event = await getEvent(context.env.DB, id);
  if (!event) return apiError(404, "NOT_FOUND", "Event not found.");
  if (event.status !== "active") {
    return apiError(409, "INVALID_TRANSITION", "Start Live Night before completing the event.");
  }

  let moneyDetails: Record<string, unknown> = { moneyTrackingEnabled: false };
  if (event.money_tracking_enabled) {
    const [entryRows, missingRows] = await Promise.all([
      context.env.DB
        .prepare(
          `SELECT player_id, entry_type, amount_cents
           FROM ledger_entries
           WHERE event_id = ?1`,
        )
        .bind(id)
        .all<{ player_id: string; entry_type: LedgerEntryType; amount_cents: number }>(),
      context.env.DB
        .prepare(
          `SELECT p.display_name
           FROM event_players ep
           JOIN players p ON p.id = ep.player_id
           WHERE ep.event_id = ?1
             AND ep.attended = 1
             AND NOT EXISTS (
               SELECT 1
               FROM ledger_entries le
               WHERE le.event_id = ep.event_id
                 AND le.player_id = ep.player_id
                 AND le.entry_type = 'cash_out'
             )
           ORDER BY p.display_name COLLATE NOCASE`,
        )
        .bind(id)
        .all<{ display_name: string }>(),
    ]);
    const totals = calculateLedger(
      entryRows.results.map((entry) => ({
        playerId: entry.player_id,
        entryType: entry.entry_type,
        amountCents: Number(entry.amount_cents),
      })),
    );
    const issues: string[] = [];
    if (missingRows.results.length) {
      issues.push(`Missing cash-outs: ${missingRows.results.map((row) => row.display_name).join(", ")}.`);
    }
    if (totals.differenceCents !== 0) {
      issues.push(
        `Cash in and cash out differ by ${new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(totals.differenceCents / 100)}.`,
      );
    }
    if (issues.length) {
      return apiError(409, "UNRESOLVED_CLOSEOUT", issues.join(" "), { closeout: issues });
    }
    moneyDetails = {
      moneyTrackingEnabled: true,
      cashInCents: totals.cashInCents,
      cashOutCents: totals.cashOutCents,
      differenceCents: totals.differenceCents,
    };
  }

  const now = new Date().toISOString();
  await context.env.DB.batch([
    context.env.DB
      .prepare(
        `UPDATE events
         SET status = 'completed', completed_at = ?1, updated_at = ?1
         WHERE id = ?2 AND status = 'active'`,
      )
      .bind(now, id),
    context.env.DB
      .prepare(
        `INSERT INTO event_audit_log
         (id, event_id, organizer_id, action, details_json, created_at)
         VALUES (?1, ?2, ?3, 'event_completed', ?4, ?5)`,
      )
      .bind(
        crypto.randomUUID(),
        id,
        context.data.organizer.id,
        JSON.stringify({ attendanceCount: Number(event.attendance_count ?? 0), ...moneyDetails }),
        now,
      ),
  ]);

  const completed = await getEvent(context.env.DB, id);
  return json({ event: eventJson(completed as EventRow) });
};
