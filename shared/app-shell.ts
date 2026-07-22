export const APP_VERSION = "2.3.0";
export const REQUIRED_SCHEMA_VERSION = 4;

export interface HealthReport {
  ok: boolean;
  appVersion: string;
  commit: string | null;
  schemaVersion: number;
  requiredSchemaVersion: number;
  missingTables: string[];
  missingColumns: string[];
  message: string;
}

export function eventIdFromPath(pathname: string): string | null {
  const match = pathname.match(
    /^\/(?:events|ops\/events|money\/events|rsvp\/events)\/([0-9a-f-]+)(?:\/|$)/iu,
  );
  return match?.[1] ?? null;
}

export function healthMessage(
  schemaVersion: number,
  missingTables: string[],
  missingColumns: string[],
): string {
  if (!missingTables.length && !missingColumns.length && schemaVersion >= REQUIRED_SCHEMA_VERSION) {
    return "Application and database schema are ready.";
  }

  const details = [
    missingTables.length ? `missing tables: ${missingTables.join(", ")}` : "",
    missingColumns.length ? `missing columns: ${missingColumns.join(", ")}` : "",
    schemaVersion < REQUIRED_SCHEMA_VERSION
      ? `database migration ${REQUIRED_SCHEMA_VERSION} has not been recorded`
      : "",
  ].filter(Boolean);

  return `Deployment is incomplete: ${details.join("; ")}. Run the remote D1 migrations before using the site.`;
}
