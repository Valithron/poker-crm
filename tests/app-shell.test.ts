import { describe, expect, it } from "vitest";
import {
  REQUIRED_SCHEMA_VERSION,
  eventIdFromPath,
  healthMessage,
} from "../shared/app-shell";

describe("event workspace routing", () => {
  it("finds the event id across unified event surfaces", () => {
    const id = "8d2f4b93-7dd5-4a3f-9a2d-91d1554e5b20";
    expect(eventIdFromPath(`/events/${id}`)).toBe(id);
    expect(eventIdFromPath(`/ops/events/${id}`)).toBe(id);
    expect(eventIdFromPath(`/money/events/${id}`)).toBe(id);
  });

  it("does not treat list and settings pages as event workspaces", () => {
    expect(eventIdFromPath("/events")).toBeNull();
    expect(eventIdFromPath("/ops/settings")).toBeNull();
    expect(eventIdFromPath("/money/players/player-id")).toBeNull();
  });
});

describe("deployment health messaging", () => {
  it("reports a ready schema", () => {
    expect(healthMessage(REQUIRED_SCHEMA_VERSION, [], [])).toBe(
      "Application and database schema are ready.",
    );
  });

  it("names missing schema requirements", () => {
    const message = healthMessage(2, ["app_settings"], ["events.capacity"]);
    expect(message).toContain("app_settings");
    expect(message).toContain("events.capacity");
    expect(message).toContain(`migration ${REQUIRED_SCHEMA_VERSION}`);
  });
});
