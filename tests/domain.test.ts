import { describe, expect, it } from "vitest";
import {
  canTransition,
  countAttendance,
  deriveDisplayName,
  eventCreateSchema,
  playerCreateSchema,
} from "../shared/domain";

describe("event status transitions", () => {
  it("allows the planned organizer flow", () => {
    expect(canTransition("draft", "open")).toBe(true);
    expect(canTransition("open", "active")).toBe(true);
    expect(canTransition("active", "completed")).toBe(true);
  });

  it("rejects skipping directly from draft to completed", () => {
    expect(canTransition("draft", "completed")).toBe(false);
  });

  it("keeps completed events locked", () => {
    expect(canTransition("completed", "active")).toBe(false);
  });
});

describe("attendance derivation", () => {
  it("counts only attended rows", () => {
    expect(countAttendance([{ attended: true }, { attended: false }, { attended: 1 }])).toBe(2);
  });
});

describe("request validation", () => {
  it("normalizes a valid player", () => {
    const result = playerCreateSchema.parse({ firstName: " Sterling ", lastName: " Knight-Pinneo " });
    expect(result.firstName).toBe("Sterling");
    expect(deriveDisplayName(result)).toBe("Sterling Knight-Pinneo");
  });

  it("requires an offset-aware event timestamp", () => {
    expect(() =>
      eventCreateSchema.parse({ title: "Poker Night", startsAt: "2026-08-01T19:00", location: "" }),
    ).toThrow();
    expect(
      eventCreateSchema.parse({
        title: "Poker Night",
        startsAt: "2026-08-01T19:00:00-06:00",
        location: "",
      }).startsAt,
    ).toBe("2026-08-01T19:00:00-06:00");
  });
});
