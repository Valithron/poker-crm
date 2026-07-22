import { describe, expect, it } from "vitest";
import {
  calculateLedger,
  ledgerEntryCreateSchema,
  moneyEventPatchSchema,
} from "../shared/money";

describe("cash ledger calculations", () => {
  it("balances buy-ins and cash-outs while deriving player net", () => {
    const totals = calculateLedger([
      { playerId: "a", entryType: "buy_in", amountCents: 2000 },
      { playerId: "a", entryType: "rebuy", amountCents: 2000 },
      { playerId: "a", entryType: "cash_out", amountCents: 5500 },
      { playerId: "b", entryType: "buy_in", amountCents: 2000 },
      { playerId: "b", entryType: "cash_out", amountCents: 500 },
    ]);

    expect(totals.cashInCents).toBe(6000);
    expect(totals.cashOutCents).toBe(6000);
    expect(totals.differenceCents).toBe(0);
    expect(totals.playerSummaries.find((player) => player.playerId === "a")?.netCents).toBe(1500);
    expect(totals.playerSummaries.find((player) => player.playerId === "b")?.netCents).toBe(-1500);
    expect(totals.playerSummaries.find((player) => player.playerId === "a")?.rebuyCount).toBe(1);
  });

  it("treats positive adjustments as cash in and negative adjustments as cash out", () => {
    const totals = calculateLedger([
      { playerId: "a", entryType: "adjustment", amountCents: 300 },
      { playerId: "b", entryType: "adjustment", amountCents: -300 },
    ]);

    expect(totals.cashInCents).toBe(300);
    expect(totals.cashOutCents).toBe(300);
    expect(totals.playerSummaries.find((player) => player.playerId === "a")?.netCents).toBe(-300);
    expect(totals.playerSummaries.find((player) => player.playerId === "b")?.netCents).toBe(300);
  });

  it("counts a zero-dollar cash-out as recorded", () => {
    const totals = calculateLedger([
      { playerId: "a", entryType: "buy_in", amountCents: 2000 },
      { playerId: "a", entryType: "cash_out", amountCents: 0 },
    ]);

    expect(totals.playerSummaries[0]?.hasCashOut).toBe(true);
  });
});

describe("cash ledger validation", () => {
  it("requires adjustment notes", () => {
    expect(() =>
      ledgerEntryCreateSchema.parse({
        playerId: "f6f657f6-a73a-4ca3-9f82-e7cf192be428",
        entryType: "adjustment",
        amountCents: 100,
      }),
    ).toThrow();
  });

  it("allows a zero-dollar cash-out but not a zero-dollar buy-in", () => {
    expect(
      ledgerEntryCreateSchema.parse({
        playerId: "f6f657f6-a73a-4ca3-9f82-e7cf192be428",
        entryType: "cash_out",
        amountCents: 0,
      }).amountCents,
    ).toBe(0);
    expect(() =>
      ledgerEntryCreateSchema.parse({
        playerId: "f6f657f6-a73a-4ca3-9f82-e7cf192be428",
        entryType: "buy_in",
        amountCents: 0,
      }),
    ).toThrow();
  });

  it("requires at least one event money setting", () => {
    expect(() => moneyEventPatchSchema.parse({ correctionNote: "Fixing history" })).toThrow();
    expect(moneyEventPatchSchema.parse({ moneyTrackingEnabled: true }).moneyTrackingEnabled).toBe(true);
  });
});
