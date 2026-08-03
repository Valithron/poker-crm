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
  calendarUrl?: string;
  directionsUrl?: string | null;
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
  if (input.calendarUrl) lines.push(`Add to calendar: ${input.calendarUrl}`);
  if (input.directionsUrl) lines.push(`Get directions: ${input.directionsUrl}`);
  return lines.join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formattedInviteTime(startsAt: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(startsAt));
}

export function buildPersonalizedInviteEmail(
  input: PersonalizedInviteInput,
  locale = "en-US",
): { subject: string; text: string; html: string } {
  const text = buildPersonalizedInviteText(input, locale);
  const lines = text.split("\n");
  const escapedLines = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  const subject = `BroTM Poker: ${input.title} — RSVP`;
  const html = [
    escapedLines,
    `<p><a href="${escapeHtml(input.rsvpUrl)}">RSVP yes, maybe, or no</a></p>`,
    input.calendarUrl ? `<p><a href="${escapeHtml(input.calendarUrl)}">Add to calendar</a></p>` : "",
    input.directionsUrl ? `<p><a href="${escapeHtml(input.directionsUrl)}">Get directions</a></p>` : "",
  ].join("");
  return { subject, text, html };
}

export function buildPersonalizedReminderEmail(
  input: PersonalizedInviteInput,
  locale = "en-US",
): { subject: string; text: string; html: string } {
  const invite = buildPersonalizedInviteEmail(input, locale);
  return {
    subject: `Reminder: ${invite.subject}`,
    text: `Friendly reminder: please let the host know if you can make it.\n\n${invite.text}`,
    html: `<p>Friendly reminder: please let the host know if you can make it.</p>${invite.html}`,
  };
}

export function buildPersonalizedUpdateEmail(
  input: PersonalizedInviteInput,
  changedFields: string[],
  locale = "en-US",
): { subject: string; text: string; html: string } {
  const invite = buildPersonalizedInviteEmail(input, locale);
  const changes = changedFields.length
    ? `Updated details: ${changedFields.join(", ")}.`
    : "The poker night details were updated.";
  return {
    subject: `Update: ${input.title}`,
    text: `${changes}\n\n${invite.text}`,
    html: `<p>${escapeHtml(changes)}</p>${invite.html}`,
  };
}

function escapeIcs(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll(/\r?\n/gu, "\\n");
}

function icsDate(value: string): string {
  return new Date(value).toISOString().replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
}

export function buildCalendarFile(input: {
  uid: string;
  title: string;
  startsAt: string;
  location?: string | null;
  description?: string | null;
  url: string;
  cancelled?: boolean;
}): string {
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(startsAt.getTime() + 4 * 60 * 60 * 1000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BroTM Poker//RSVP//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcs(input.uid)}`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(startsAt.toISOString())}`,
    `DTEND:${icsDate(endsAt.toISOString())}`,
    `SUMMARY:${escapeIcs(input.title)}`,
    `URL:${escapeIcs(input.url)}`,
    `STATUS:${input.cancelled ? "CANCELLED" : "CONFIRMED"}`,
  ];
  if (input.location) lines.push(`LOCATION:${escapeIcs(input.location)}`);
  if (input.description) lines.push(`DESCRIPTION:${escapeIcs(input.description)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function buildPersonalizedInviteSms(input: PersonalizedInviteInput, locale = "en-US"): string {
  const lines = [`BroTM Poker: ${input.title}`, formattedInviteTime(input.startsAt, locale)];
  if (input.hostName) lines.push(`Host: ${input.hostName}`);
  if (input.locationVisibility === "always" && input.location) lines.push(`Location: ${input.location}`);
  if (input.locationVisibility === "after_yes") lines.push("Address appears after a Yes RSVP.");
  lines.push(`RSVP: ${input.rsvpUrl}`);
  const message = lines.join(" | ");
  return message.length <= 480 ? message : `${message.slice(0, 477)}...`;
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
