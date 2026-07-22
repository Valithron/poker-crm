import { z } from "zod";

export const publicRsvpStatuses = ["yes", "maybe", "no"] as const;
export type PublicRsvpStatus = (typeof publicRsvpStatuses)[number];

export const rsvpLocationVisibilities = ["always", "after_yes"] as const;
export type RsvpLocationVisibility = (typeof rsvpLocationVisibilities)[number];

export const publicRsvpResponseSchema = z.object({
  rsvpStatus: z.enum(publicRsvpStatuses),
});

export const rsvpAdminEventPatchSchema = z.object({
  locationVisibility: z.enum(rsvpLocationVisibilities),
});

export interface PersonalizedInviteInput {
  playerName: string;
  title: string;
  startsAt: string;
  hostName: string | null;
  location: string;
  locationVisibility: RsvpLocationVisibility;
  gameNotes: string | null;
  stakesNotes: string | null;
  rsvpUrl: string;
}

export function invitationExpiresAt(startsAt: string): string {
  const starts = new Date(startsAt);
  return new Date(starts.getTime() + 36 * 60 * 60 * 1000).toISOString();
}

export function buildPersonalizedInviteText(input: PersonalizedInviteInput, locale = "en-US"): string {
  const when = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(input.startsAt));
  const lines = [`${input.playerName}, you are invited to ${input.title}.`, when];
  if (input.hostName) lines.push(`Host: ${input.hostName}`);
  if (input.locationVisibility === "always" && input.location) {
    lines.push(`Location: ${input.location}`);
  } else if (input.locationVisibility === "after_yes") {
    lines.push("The address will appear after you RSVP yes.");
  }
  if (input.gameNotes) lines.push(`Game: ${input.gameNotes}`);
  if (input.stakesNotes) lines.push(`Stakes: ${input.stakesNotes}`);
  lines.push(`RSVP yes, maybe, or no: ${input.rsvpUrl}`);
  return lines.join("\n");
}

export function createRsvpToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export async function hashRsvpToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isPlausibleRsvpToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32,128}$/u.test(token);
}
