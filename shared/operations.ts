import { z } from "zod";

export const organizerRoles = ["admin", "organizer"] as const;
export type OrganizerRole = (typeof organizerRoles)[number];

const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();

export const operationsSettingsPatchSchema = z
  .object({
    defaultLocation: z.string().trim().max(240).optional(),
    defaultGameNotes: nullableText(1200),
    defaultStakesNotes: nullableText(500),
    defaultMoneyTrackingEnabled: z.boolean().optional(),
    defaultBuyInCents: z.number().int().min(0).max(10_000_000).optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    "At least one default setting is required",
  );

export const organizerCreateSchema = z.object({
  email: z.string().trim().email().max(200),
  displayName: z.string().trim().min(1).max(120),
  role: z.enum(organizerRoles).default("organizer"),
});

export const organizerPatchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    role: z.enum(organizerRoles).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (value) => value.displayName !== undefined || value.role !== undefined || value.active !== undefined,
    "At least one organizer field is required",
  );

export const operationsEventCreateSchema = z.object({
  title: z.string().trim().min(1).max(120).default("Poker Night"),
  startsAt: z.string().datetime({ offset: true }),
  hostPlayerId: z.string().uuid().nullable().optional(),
  location: z.string().trim().max(240).optional(),
  gameNotes: nullableText(1200),
  stakesNotes: nullableText(500),
  notes: nullableText(1200),
  capacity: z.number().int().min(1).max(200).nullable().optional(),
  moneyTrackingEnabled: z.boolean().optional(),
  defaultBuyInCents: z.number().int().min(0).max(10_000_000).optional(),
});

export const operationsEventPatchSchema = z
  .object({
    capacity: z.number().int().min(1).max(200).nullable().optional(),
    status: z.enum(["open", "cancelled", "archived"]).optional(),
    quickNote: z.string().trim().min(1).max(500).optional(),
    correctionNote: z.string().trim().min(3).max(500).optional(),
  })
  .refine(
    (value) => value.capacity !== undefined || value.status !== undefined || value.quickNote !== undefined,
    "At least one event operation is required",
  );

export interface RsvpLike {
  invitationStatus: "invited" | "not_invited";
  rsvpStatus: "pending" | "yes" | "maybe" | "no";
  attended?: boolean;
}

export interface RsvpSummary {
  invited: number;
  yes: number;
  maybe: number;
  no: number;
  pending: number;
  attended: number;
  expected: number;
}

export function summarizeRsvps(rows: RsvpLike[]): RsvpSummary {
  const invitedRows = rows.filter((row) => row.invitationStatus === "invited");
  return {
    invited: invitedRows.length,
    yes: invitedRows.filter((row) => row.rsvpStatus === "yes").length,
    maybe: invitedRows.filter((row) => row.rsvpStatus === "maybe").length,
    no: invitedRows.filter((row) => row.rsvpStatus === "no").length,
    pending: invitedRows.filter((row) => row.rsvpStatus === "pending").length,
    attended: rows.filter((row) => row.attended).length,
    expected: invitedRows.filter((row) => row.rsvpStatus === "yes" || row.rsvpStatus === "maybe").length,
  };
}

export interface InviteTextInput {
  title: string;
  startsAt: string;
  hostName?: string | null;
  location?: string | null;
  gameNotes?: string | null;
  stakesNotes?: string | null;
  capacity?: number | null;
}

export function buildInviteText(input: InviteTextInput, locale = "en-US"): string {
  const when = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(input.startsAt));
  const lines = [input.title, when];
  if (input.hostName) lines.push(`Host: ${input.hostName}`);
  if (input.location) lines.push(`Location: ${input.location}`);
  if (input.gameNotes) lines.push(`Game: ${input.gameNotes}`);
  if (input.stakesNotes) lines.push(`Stakes: ${input.stakesNotes}`);
  if (input.capacity) lines.push(`Capacity: ${input.capacity} players`);
  lines.push("Reply with yes, maybe, or no.");
  return lines.join("\n");
}
