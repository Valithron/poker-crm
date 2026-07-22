import { z } from "zod";

export const ledgerEntryTypes = ["buy_in", "rebuy", "cash_out", "adjustment"] as const;
export type LedgerEntryType = (typeof ledgerEntryTypes)[number];

const cents = z.number().int().min(-100_000_000).max(100_000_000);

export const moneyEventPatchSchema = z
  .object({
    moneyTrackingEnabled: z.boolean().optional(),
    defaultBuyInCents: z.number().int().min(0).max(10_000_000).optional(),
    stakesNotes: z.string().trim().max(500).nullable().optional(),
    correctionNote: z.string().trim().min(3).max(500).optional(),
  })
  .refine(
    (value) =>
      value.moneyTrackingEnabled !== undefined ||
      value.defaultBuyInCents !== undefined ||
      value.stakesNotes !== undefined,
    "At least one money setting is required",
  );

export const ledgerEntryCreateSchema = z
  .object({
    playerId: z.string().uuid(),
    entryType: z.enum(ledgerEntryTypes),
    amountCents: cents,
    note: z.string().trim().max(500).nullable().optional(),
    correctionNote: z.string().trim().min(3).max(500).optional(),
  })
  .superRefine((value, context) => validateEntry(value, context));

export const ledgerEntryPatchSchema = z
  .object({
    entryType: z.enum(ledgerEntryTypes).optional(),
    amountCents: cents.optional(),
    note: z.string().trim().max(500).nullable().optional(),
    correctionNote: z.string().trim().min(3).max(500).optional(),
  })
  .refine(
    (value) => value.entryType !== undefined || value.amountCents !== undefined || value.note !== undefined,
    "At least one ledger field is required",
  );

export const ledgerEntryDeleteSchema = z.object({
  correctionNote: z.string().trim().min(3).max(500).optional(),
});

export const moneyCompleteSchema = z.object({
  correctionNote: z.string().trim().min(3).max(500).optional(),
});

function validateEntry(
  value: { entryType: LedgerEntryType; amountCents: number; note?: string | null },
  context: z.RefinementCtx,
): void {
  if ((value.entryType === "buy_in" || value.entryType === "rebuy") && value.amountCents <= 0) {
    context.addIssue({
      code: "custom",
      path: ["amountCents"],
      message: "Buy-ins and rebuys must be greater than zero.",
    });
  }
  if (value.entryType === "cash_out" && value.amountCents < 0) {
    context.addIssue({
      code: "custom",
      path: ["amountCents"],
      message: "Cash-out cannot be negative.",
    });
  }
  if (value.entryType === "adjustment") {
    if (value.amountCents === 0) {
      context.addIssue({
        code: "custom",
        path: ["amountCents"],
        message: "An adjustment cannot be zero.",
      });
    }
    if (!value.note?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "Adjustments require an explanation.",
      });
    }
  }
}

export interface LedgerCalculationEntry {
  playerId: string;
  entryType: LedgerEntryType;
  amountCents: number;
}

export interface PlayerLedgerSummary {
  playerId: string;
  cashInCents: number;
  cashOutCents: number;
  netCents: number;
  rebuyCount: number;
  hasCashOut: boolean;
}

export interface LedgerTotals {
  cashInCents: number;
  cashOutCents: number;
  differenceCents: number;
  playerSummaries: PlayerLedgerSummary[];
}

export function calculateLedger(entries: LedgerCalculationEntry[]): LedgerTotals {
  const players = new Map<string, PlayerLedgerSummary>();
  let cashInCents = 0;
  let cashOutCents = 0;

  for (const entry of entries) {
    const summary = players.get(entry.playerId) ?? {
      playerId: entry.playerId,
      cashInCents: 0,
      cashOutCents: 0,
      netCents: 0,
      rebuyCount: 0,
      hasCashOut: false,
    };

    if (entry.entryType === "buy_in" || entry.entryType === "rebuy") {
      cashInCents += entry.amountCents;
      summary.cashInCents += entry.amountCents;
      if (entry.entryType === "rebuy") summary.rebuyCount += 1;
    } else if (entry.entryType === "cash_out") {
      cashOutCents += entry.amountCents;
      summary.cashOutCents += entry.amountCents;
      summary.hasCashOut = true;
    } else if (entry.amountCents > 0) {
      cashInCents += entry.amountCents;
      summary.cashInCents += entry.amountCents;
    } else {
      const absolute = Math.abs(entry.amountCents);
      cashOutCents += absolute;
      summary.cashOutCents += absolute;
    }

    summary.netCents = summary.cashOutCents - summary.cashInCents;
    players.set(entry.playerId, summary);
  }

  return {
    cashInCents,
    cashOutCents,
    differenceCents: cashInCents - cashOutCents,
    playerSummaries: [...players.values()],
  };
}
