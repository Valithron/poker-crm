import { describe, expect, it } from "vitest";
import {
  buildPersonalizedInviteText,
  hashRsvpToken,
  invitationExpiresAt,
  isPlausibleRsvpToken,
  publicRsvpResponseSchema,
} from "../shared/rsvp";

describe("private RSVP invitation helpers", () => {
  it("omits the address when it is hidden until yes", () => {
    const text = buildPersonalizedInviteText({
      playerName: "Ryan",
      title: "Friday Poker Night",
      startsAt: "2026-07-24T19:00:00-06:00",
      hostName: "Sterling",
      location: "123 Private Street",
      locationVisibility: "after_yes",
      gameNotes: "Dealer's choice",
      stakesNotes: "$10 buy-in",
      rsvpUrl: "https://poker.skpfam.com/rsvp/example-token",
    });

    expect(text).not.toContain("123 Private Street");
    expect(text).toContain("address will appear after you RSVP yes");
    expect(text).toContain("/rsvp/example-token");
  });

  it("expires links 36 hours after the event starts", () => {
    expect(invitationExpiresAt("2026-07-24T19:00:00.000Z")).toBe("2026-07-26T07:00:00.000Z");
  });

  it("accepts only yes, maybe, or no responses", () => {
    expect(publicRsvpResponseSchema.parse({ rsvpStatus: "yes" })).toEqual({ rsvpStatus: "yes" });
    expect(() => publicRsvpResponseSchema.parse({ rsvpStatus: "pending" })).toThrow();
  });

  it("validates token shape and hashes deterministically", async () => {
    const token = "abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890_-";
    expect(isPlausibleRsvpToken(token)).toBe(true);
    expect(isPlausibleRsvpToken("too-short")).toBe(false);
    expect(await hashRsvpToken(token)).toBe(await hashRsvpToken(token));
  });
});
