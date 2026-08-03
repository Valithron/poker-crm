import { describe, expect, it } from "vitest";
import { reminderTime } from "../functions/lib/scheduled-delivery";
import { decryptRsvpToken, encryptRsvpToken } from "../functions/lib/token-vault";
import { createRsvpToken } from "../shared/rsvp";

describe("scheduled reminder timing", () => {
  it("schedules the response reminder 24 hours before the event", () => {
    expect(reminderTime("2026-08-08T19:00:00-06:00", "twenty_four_hours")).toBe("2026-08-08T01:00:00.000Z");
  });

  it("round-trips an RSVP token for automated messages without changing it", async () => {
    const token = createRsvpToken();
    const ciphertext = await encryptRsvpToken(token, "test-secret");
    expect(ciphertext).not.toContain(token);
    await expect(decryptRsvpToken(ciphertext, "test-secret")).resolves.toBe(token);
    await expect(decryptRsvpToken(ciphertext, "wrong-secret")).resolves.toBeNull();
  });
});
