export interface OrganizerIdentity {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "organizer";
}

export interface Env {
  DB: D1Database;
  TEAM_DOMAIN: string;
  POLICY_AUD: string;
  ENVIRONMENT?: string;
  DEV_ORGANIZER_EMAIL?: string;
}

export interface FunctionData {
  organizer: OrganizerIdentity;
}

export type AppPagesFunction = PagesFunction<Env, string, FunctionData>;
