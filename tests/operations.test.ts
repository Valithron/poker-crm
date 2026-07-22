import { describe, expect, it } from "vitest";
import {
  buildInviteText,
  operationsEventCreateSchema,
  operationsSettingsPatchSchema,
  organizerPatchSchema,
  summarizeRsvps,
} from "../shared/operations";

describe("RSVP summaries", () => {
  it("counts only invited players in RSVP totals", () => {
    expect(
      summarizeRsvps([
        { invitationStatus: "invited", rsvpStatus: "yes", attended: true },
        { invitationStatus: "invited", rsvpStatus: "maybe" },
        { invitationStatus: "invited", rsvpStatus: "pending" },
        { invitationStatus: "not_invited", rsvpStatus: "yes", attended: true },
      ]),
    ).toEqual({
      invited: 3,
      yes: 1,
      maybe: 1,
      no: 0,
      pending: 1,
      attended: 2,
      expected: 2,
    });
  });
});

describe("invite text", () => {
  it("includes the operational event details and RSVP instruction", () => {
    const text = buildInviteText({
      title: "Friday Poker",
      startsAt: "2026-08-01T19:00:00-06:00",
      hostName: "Sterling",
      location: "Home",
      gameNotes: "Texas Hold'em",
      stakesNotes: "$10 buy-in",
      capacity: 8,
    });
    expect(text).toContain("Friday Poker");
    expect(text).toContain("Host: Sterling");
    expect(text).toContain("Location: Home");
    expect(text).toContain("Capacity: 8 players");
    expect(text).toContain("Reply with yes, maybe, or no.");
  });
});

describe("operations validation", () => {
  it("accepts shared organizer defaults", () => {
    expect(
      operationsSettingsPatchSchema.parse({
        defaultLocation: "Cimarron Hills",
        defaultMoneyTrackingEnabled: true,
        defaultBuyInCents: 1000,
      }).defaultBuyInCents,
    ).toBe(1000);
  });

  it("requires at least one organizer update", () => {
    expect(() => organizerPatchSchema.parse({})).toThrow();
  });

  it("validates event capacity", () => {
    expect(() =>
      operationsEventCreateSchema.parse({
        title: "Poker Night",
        startsAt: "2026-08-01T19:00:00-06:00",
        capacity: 0,
      }),
    ).toThrow();
  });
});
