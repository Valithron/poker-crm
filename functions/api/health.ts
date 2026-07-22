import {
  APP_VERSION,
  REQUIRED_SCHEMA_VERSION,
  healthMessage,
  type HealthReport,
} from "../../shared/app-shell";
import { json } from "../lib/http";
import type { AppPagesFunction } from "../lib/types";

const requiredTables = [
  "organizers",
  "players",
  "events",
  "event_players",
  "event_audit_log",
  "ledger_entries",
  "app_settings",
  "d1_migrations",
];

interface NameRow {
  name: string;
}

interface MigrationRow {
  version: number;
}

export const onRequestGet: AppPagesFunction = async (context) => {
  try {
    const tablesResult = await context.env.DB
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all<NameRow>();
    const tables = new Set(tablesResult.results.map((row) => row.name));
    const missingTables = requiredTables.filter((table) => !tables.has(table));

    const eventColumnsResult = tables.has("events")
      ? await context.env.DB.prepare("PRAGMA table_info(events)").all<NameRow>()
      : { results: [] as NameRow[] };
    const eventColumns = new Set(eventColumnsResult.results.map((row) => row.name));
    const missingColumns = eventColumns.has("capacity") ? [] : ["events.capacity"];

    const migrationRow = tables.has("d1_migrations")
      ? await context.env.DB
          .prepare("SELECT COALESCE(MAX(id), 0) AS version FROM d1_migrations")
          .first<MigrationRow>()
      : null;
    const schemaVersion = Number(migrationRow?.version ?? 0);
    const ok =
      missingTables.length === 0 &&
      missingColumns.length === 0 &&
      schemaVersion >= REQUIRED_SCHEMA_VERSION;

    const report: HealthReport = {
      ok,
      appVersion: APP_VERSION,
      commit: context.env.CF_PAGES_COMMIT_SHA ?? null,
      schemaVersion,
      requiredSchemaVersion: REQUIRED_SCHEMA_VERSION,
      missingTables,
      missingColumns,
      message: healthMessage(schemaVersion, missingTables, missingColumns),
    };

    return json(report, { status: ok ? 200 : 503 });
  } catch (error) {
    const report: HealthReport = {
      ok: false,
      appVersion: APP_VERSION,
      commit: context.env.CF_PAGES_COMMIT_SHA ?? null,
      schemaVersion: 0,
      requiredSchemaVersion: REQUIRED_SCHEMA_VERSION,
      missingTables: [],
      missingColumns: [],
      message: `The database health check failed: ${error instanceof Error ? error.message : "unknown error"}`,
    };
    return json(report, { status: 503 });
  }
};
