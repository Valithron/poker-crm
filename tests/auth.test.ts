import { describe, expect, it } from "vitest";
import { resolveOrganizer } from "../functions/lib/auth";
import type { Env } from "../functions/lib/types";

function testDatabase() {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => ({
          id: "organizer-id",
          email: "dev@example.com",
          display_name: "Dev Organizer",
          role: "admin" as const,
        }),
      }),
    }),
  } as unknown as D1Database;
}

describe("organizer test access", () => {
  it("resolves the configured organizer without an Access token in public mode", async () => {
    const env = {
      DB: testDatabase(),
      AUTH_MODE: "public",
      DEV_ORGANIZER_EMAIL: "dev@example.com",
    } as Env;

    await expect(resolveOrganizer(new Request("https://example.test/api/session"), env)).resolves.toMatchObject({
      id: "organizer-id",
      email: "dev@example.com",
      role: "admin",
    });
  });

  it("does not silently fall back to public access when access mode is selected", async () => {
    const env = {
      DB: testDatabase(),
      AUTH_MODE: "access",
      DEV_ORGANIZER_EMAIL: "dev@example.com",
    } as Env;

    await expect(resolveOrganizer(new Request("https://example.test/api/session"), env)).rejects.toThrow(
      "Authentication required",
    );
  });
});
