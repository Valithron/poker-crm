export interface OrganizerIdentity {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "organizer";
}

export interface Env {
  DB: D1Database;
  TEAM_DOMAIN?: string;
  POLICY_AUD?: string;
  ENVIRONMENT?: string;
  AUTH_MODE?: "public" | "access";
  DEV_ORGANIZER_EMAIL?: string;
  DELIVERY_MODE?: "log" | "live";
  PUBLIC_APP_ORIGIN?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  RSVP_TOKEN_ENCRYPTION_KEY?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  CRON_SECRET?: string;
  CF_PAGES_COMMIT_SHA?: string;
}

export interface FunctionData extends Record<string, unknown> {
  organizer: OrganizerIdentity;
}

export type AppPagesFunction = PagesFunction<Env, string, FunctionData>;
