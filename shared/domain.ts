import { z } from "zod";

export const eventStatuses = [
  "draft",
  "open",
  "active",
  "completed",
  "cancelled",
  "archived",
] as const;
export type EventStatus = (typeof eventStatuses)[number];

export const rsvpStatuses = ["pending", "yes", "maybe", "no"] as const;
export type RsvpStatus = (typeof rsvpStatuses)[number];

export const invitationStatuses = ["invited", "not_invited"] as const;
export type InvitationStatus = (typeof invitationStatuses)[number];

const optionalEmail = z.string().trim().email().max(200).optional().or(z.literal(""));
const correctionNote = z.string().trim().min(3).max(500).optional();

export const playerCreateSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).default(""),
  displayName: z.string().trim().min(1).max(120).optional(),
  email: optionalEmail,
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const playerPatchSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().max(80).optional(),
    displayName: z.string().trim().max(120).optional(),
    email: optionalEmail,
    phone: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(1000).optional(),
    status: z.enum(["active", "archived"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const eventCreateSchema = z.object({
  title: z.string().trim().min(1).max(120).default("Poker Night"),
  startsAt: z.string().datetime({ offset: true }),
  hostPlayerId: z.string().uuid().nullable().optional(),
  location: z.string().trim().max(240).default(""),
  gameNotes: z.string().trim().max(1200).optional(),
  notes: z.string().trim().max(1200).optional(),
});

export const eventPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    startsAt: z.string().datetime({ offset: true }).optional(),
    hostPlayerId: z.string().uuid().nullable().optional(),
    location: z.string().trim().max(240).optional(),
    gameNotes: z.string().trim().max(1200).nullable().optional(),
    notes: z.string().trim().max(1200).nullable().optional(),
    status: z.enum(eventStatuses).optional(),
    correctionNote,
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== "correctionNote"),
    "At least one event field is required",
  );

export const eventPlayerCreateSchema = z.object({
  playerId: z.string().uuid(),
  invitationStatus: z.enum(invitationStatuses).default("invited"),
  rsvpStatus: z.enum(rsvpStatuses).default("pending"),
  correctionNote,
});

export const eventPlayerPatchSchema = z
  .object({
    invitationStatus: z.enum(invitationStatuses).optional(),
    rsvpStatus: z.enum(rsvpStatuses).optional(),
    attended: z.boolean().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    correctionNote,
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== "correctionNote"),
    "At least one roster field is required",
  );

export const eventPlayerDeleteSchema = z.object({
  correctionNote,
});

export const eventReopenSchema = z.object({
  correctionNote: z.string().trim().min(3).max(500),
});

const allowedTransitions: Record<EventStatus, readonly EventStatus[]> = {
  draft: ["open", "cancelled"],
  open: ["active", "cancelled"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: ["archived"],
  archived: [],
};

export function canTransition(from: EventStatus, to: EventStatus): boolean {
  const allowed: readonly EventStatus[] = allowedTransitions[from];
  return from === to || allowed.includes(to);
}

export function countAttendance(rows: Array<{ attended: boolean | number }>): number {
  return rows.reduce((total, row) => total + (Boolean(row.attended) ? 1 : 0), 0);
}

export function deriveDisplayName(input: {
  firstName: string;
  lastName?: string;
  displayName?: string;
}): string {
  return input.displayName?.trim() || `${input.firstName} ${input.lastName ?? ""}`.trim();
}
