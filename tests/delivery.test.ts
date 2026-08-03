import { describe, expect, it } from "vitest";
import { providerName, sendDelivery } from "../functions/lib/delivery";
import type { Env } from "../functions/lib/types";
import { sendInvitesSchema, type DeliveryMessage } from "../shared/delivery";
import {
  buildPersonalizedInviteEmail,
  buildPersonalizedInviteSms,
} from "../shared/rsvp";

const invite = {
  playerName: "Ryan",
  title: "Friday Poker Night",
  startsAt: "2026-07-24T19:00:00-06:00",
  hostName: "Sterling",
  location: "123 Private Street",
  locationVisibility: "always" as const,
  gameNotes: "Dealer's choice",
  stakesNotes: "$10 buy-in",
  rsvpUrl: "https://poker.skpfam.com/rsvp/example-token",
  brandAssetUrl: "https://poker.skpfam.com/apple-touch-icon.png?v=2",
};

describe("invite delivery contracts", () => {
  it("uses the development sink without provider credentials", async () => {
    const env = { DELIVERY_MODE: "log" } as Env;
    const message: DeliveryMessage = {
      channel: "email",
      destination: "dev@example.com",
      subject: "Test invite",
      text: "Test invite body",
      idempotencyKey: "delivery-test",
    };
    expect(providerName("email", env)).toBe("development");
    await expect(sendDelivery(env, message)).resolves.toMatchObject({ provider: "development" });
  });

  it("accepts one or both delivery channels without duplicates", () => {
    expect(sendInvitesSchema.parse({ channels: ["email"] })).toEqual({
      channels: ["email"],
      policy: "requested_channels",
    });
    expect(sendInvitesSchema.parse({ channels: ["email", "sms"] })).toEqual({
      channels: ["email", "sms"],
      policy: "requested_channels",
    });
    expect(() => sendInvitesSchema.parse({ channels: ["email", "email"] })).toThrow();
  });

  it("supports preferred-channel fallback requests", () => {
    expect(sendInvitesSchema.parse({ channels: ["email", "sms"], policy: "preferred_with_fallback" }).policy).toBe(
      "preferred_with_fallback",
    );
  });

  it("builds an HTML and plain-text email with the RSVP link", () => {
    const message = buildPersonalizedInviteEmail(invite);
    expect(message.subject).toContain("Friday Poker Night");
    expect(message.text).toContain(invite.rsvpUrl);
    expect(message.html).toContain(`href="${invite.rsvpUrl}"`);
    expect(message.html).toContain("max-width:600px");
    expect(message.html).toContain("role=\"presentation\"");
    expect(message.html).toContain("apple-touch-icon");
    expect(message.html).toContain("BroTime Poker Night");
    expect(message.html).toContain("You’re receiving this because you were invited");
  });

  it("includes calendar and directions links when supplied", () => {
    const message = buildPersonalizedInviteEmail({
      ...invite,
      calendarUrl: "https://poker.skpfam.com/rsvp-api/example-token/calendar.ics",
      directionsUrl: "https://www.google.com/maps/search/?api=1&query=123%20Main%20Street",
    });
    expect(message.text).toContain("calendar.ics");
    expect(message.html).toContain("Get directions");
  });

  it("escapes player and event content in the HTML email", () => {
    const message = buildPersonalizedInviteEmail({
      ...invite,
      playerName: "A <Player>",
      title: "Friday & Saturday",
    });
    expect(message.html).toContain("A &lt;Player&gt;");
    expect(message.html).toContain("Friday &amp; Saturday");
    expect(message.html).not.toContain("A <Player>");
  });

  it("supports future unsubscribe links and one-click headers", () => {
    const message = buildPersonalizedInviteEmail({
      ...invite,
      unsubscribeUrl: "https://poker.skpfam.com/unsubscribe/example",
    });
    expect(message.html).toContain("Unsubscribe from BroTime Poker emails");
    expect(message.text).toContain("Unsubscribe: https://poker.skpfam.com/unsubscribe/example");
    expect(message.headers).toEqual({
      "List-Unsubscribe": "<https://poker.skpfam.com/unsubscribe/example>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("keeps SMS concise while preserving the RSVP link", () => {
    const message = buildPersonalizedInviteSms({
      ...invite,
      gameNotes: "A very long game note ".repeat(100),
      stakesNotes: "A very long stakes note ".repeat(100),
    });
    expect(message).toContain(invite.rsvpUrl);
    expect(message.length).toBeLessThanOrEqual(480);
  });
});
