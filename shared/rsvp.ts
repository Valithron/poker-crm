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
  brandAssetUrl?: string;
  unsubscribeUrl?: string | null;
  preheader?: string;
}

export function invitationExpiresAt(startsAt: string): string {
  const starts = new Date(startsAt);
  return new Date(starts.getTime() + 36 * 60 * 60 * 1000).toISOString();
}

function formattedInviteTime(startsAt: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(startsAt));
}

export function buildPersonalizedInviteText(input: PersonalizedInviteInput, locale = "en-US"): string {
  const when = formattedInviteTime(input.startsAt, locale);
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

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function absoluteLink(url: string | null | undefined, label: string): string {
  if (!url) return "";
  return `<a href="${escapeAttribute(url)}" style="color:#075b3b;text-decoration:underline;">${escapeHtml(label)}</a>`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 12px 8px 0;color:#6c746e;font-size:13px;line-height:20px;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
    <td style="padding:8px 0;color:#1d2a22;font-size:15px;line-height:20px;font-weight:600;">${escapeHtml(value)}</td>
  </tr>`;
}

function emailText(
  input: PersonalizedInviteInput,
  intro: string,
  unsubscribeLine: string,
  locale: string,
): string {
  const lines = [
    intro,
    "",
    buildPersonalizedInviteText(input, locale),
    "",
    `View Invitation & RSVP: ${input.rsvpUrl}`,
  ];
  if (input.calendarUrl) lines.push(`Add to calendar: ${input.calendarUrl}`);
  if (input.directionsUrl) lines.push(`Get directions: ${input.directionsUrl}`);
  lines.push("", "This RSVP link is unique to you. Please do not forward it.", unsubscribeLine);
  return lines.join("\n");
}

function emailHtml(
  input: PersonalizedInviteInput,
  heading: string,
  intro: string,
  locale: string,
  changedFields: string[] = [],
): string {
  const when = formattedInviteTime(input.startsAt, locale);
  const logoUrl = input.brandAssetUrl ? escapeAttribute(input.brandAssetUrl) : "";
  const preheader = escapeHtml(input.preheader ?? intro);
  const location = input.locationVisibility === "always" && input.location
    ? detailRow("Location", input.location)
    : input.locationVisibility === "after_yes"
      ? detailRow("Location", "Shown after you RSVP yes")
      : "";
  const changes = changedFields.length
    ? `<tr><td colspan="2" style="padding:0 0 18px;color:#075b3b;font-size:14px;line-height:21px;"><strong>Updated details:</strong> ${escapeHtml(changedFields.join(", "))}</td></tr>`
    : "";
  const calendar = input.calendarUrl
    ? `<a href="${escapeAttribute(input.calendarUrl)}" style="color:#075b3b;text-decoration:underline;">Add to calendar</a>`
    : "";
  const directions = input.directionsUrl
    ? `<a href="${escapeAttribute(input.directionsUrl)}" style="color:#075b3b;text-decoration:underline;">Get directions</a>`
    : "";
  const links = [calendar, directions].filter(Boolean).join("&nbsp;&nbsp;·&nbsp;&nbsp;");
  const unsubscribe = input.unsubscribeUrl
    ? `<a href="${escapeAttribute(input.unsubscribeUrl)}" style="color:#d7b267;text-decoration:underline;">Unsubscribe from BroTime Poker emails</a>`
    : "Need to change future invitations? Contact the event organizer.";
  const footerHeaders = input.unsubscribeUrl
    ? `<p style="margin:10px 0 0;font-size:12px;line-height:18px;color:#e8eadf;">${unsubscribe}</p>`
    : `<p style="margin:10px 0 0;font-size:12px;line-height:18px;color:#e8eadf;">${unsubscribe}</p>`;
  const image = logoUrl
    ? `<img src="${logoUrl}" width="84" height="84" alt="BroTime Poker spade logo" style="display:block;width:84px;height:84px;margin:0 auto 10px;border:0;outline:none;text-decoration:none;">`
    : "";
  const unsubscribeLine = input.unsubscribeUrl
    ? `Unsubscribe: ${input.unsubscribeUrl}`
    : "To change future invitations, contact the event organizer.";

  return `<!doctype html>
<html lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(heading)}</title>
  <style>
    @media only screen and (max-width:620px) {
      .email-shell { width:100% !important; }
      .email-pad { padding-left:20px !important; padding-right:20px !important; }
      .email-heading { font-size:25px !important; line-height:32px !important; }
      .email-button { width:100% !important; }
      .email-button a { display:block !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#063c29;color:#1d2a22;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none!important;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0;padding:0;background-color:#063c29;">
    <tr>
      <td align="center" style="padding:24px 10px;">
        <table role="presentation" class="email-shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">
          <tr>
            <td align="center" style="padding:28px 20px 24px;background-color:#075b3b;border:1px solid #d7b267;border-bottom:0;">
              ${image}
              <div style="color:#fffdf6;font-size:12px;line-height:16px;letter-spacing:3px;font-weight:bold;">BROTIME</div>
              <div style="margin-top:3px;color:#d7b267;font-size:20px;line-height:26px;font-family:Georgia,'Times New Roman',serif;font-weight:bold;">Poker Night</div>
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:34px 42px 30px;background-color:#fffdf6;border:1px solid #d7b267;border-top:4px solid #d7b267;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="padding:0 0 10px;color:#8b6b28;font-size:12px;line-height:16px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;">BroTime Poker Night</td></tr>
                <tr><td class="email-heading" style="padding:0 0 12px;color:#075b3b;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:37px;font-weight:bold;">${escapeHtml(heading)}</td></tr>
                <tr><td style="padding:0 0 24px;color:#455249;font-size:16px;line-height:25px;">${escapeHtml(intro)}</td></tr>
                ${changes}
                <tr><td style="padding:0 0 6px;color:#1d2a22;font-size:17px;line-height:24px;font-weight:bold;">Hi ${escapeHtml(input.playerName)},</td></tr>
                <tr><td style="padding:0 0 20px;color:#455249;font-size:15px;line-height:23px;">You’re invited to <strong style="color:#075b3b;">${escapeHtml(input.title)}</strong>.</td></tr>
                <tr><td style="padding:18px 18px 12px;border:1px solid #ead9ad;background-color:#fffaf0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    ${detailRow("When", when)}
                    ${input.hostName ? detailRow("Host", input.hostName) : ""}
                    ${location}
                    ${input.gameNotes ? detailRow("Game", input.gameNotes) : ""}
                    ${input.stakesNotes ? detailRow("Stakes", input.stakesNotes) : ""}
                  </table>
                </td></tr>
                <tr><td align="center" style="padding:28px 0 14px;">
                  <table role="presentation" class="email-button" cellpadding="0" cellspacing="0" border="0">
                    <tr><td align="center" bgcolor="#075b3b" style="border-radius:4px;background-color:#075b3b;box-shadow:inset 0 -2px 0 #063c29;">
                      <a href="${escapeAttribute(input.rsvpUrl)}" style="display:inline-block;padding:15px 24px;color:#fffdf6;font-size:16px;line-height:20px;font-weight:bold;text-decoration:none;">View Invitation &amp; RSVP</a>
                    </td></tr>
                  </table>
                </td></tr>
                <tr><td align="center" style="padding:0 0 22px;color:#6c746e;font-size:12px;line-height:18px;word-break:break-all;">Or open this private link:<br><a href="${escapeAttribute(input.rsvpUrl)}" style="color:#075b3b;text-decoration:underline;">${escapeHtml(input.rsvpUrl)}</a></td></tr>
                ${links ? `<tr><td align="center" style="padding:0 0 24px;color:#075b3b;font-size:14px;line-height:20px;">${links}</td></tr>` : ""}
                <tr><td style="padding:17px 0 0;border-top:1px solid #ead9ad;color:#6c746e;font-size:12px;line-height:19px;">This RSVP link is unique to you. Please do not forward it.</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 24px 22px;background-color:#075b3b;border:1px solid #d7b267;border-top:0;">
              <div style="color:#fffdf6;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:24px;font-weight:bold;">BroTime</div>
              <div style="margin-top:5px;color:#c9d4c9;font-size:12px;line-height:18px;">You’re receiving this because you were invited to a BroTime Poker Night event.</div>
              ${footerHeaders}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

interface EmailBuildResult {
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

function buildEventEmail(
  input: PersonalizedInviteInput,
  variant: "invite" | "reminder" | "update",
  changedFields: string[] = [],
  locale = "en-US",
): EmailBuildResult {
  const unsubscribeLine = input.unsubscribeUrl
    ? `Unsubscribe: ${input.unsubscribeUrl}`
    : "To change future invitations, contact the event organizer.";
  const config = variant === "reminder"
    ? {
        subject: `Reminder: ${input.title}`,
        heading: "A quick RSVP reminder",
        intro: "The poker night is coming up. Let the host know if you can make it.",
      }
    : variant === "update"
      ? {
          subject: `Update: ${input.title}`,
          heading: "Poker night details changed",
          intro: "The host updated this poker night. Review the details and update your RSVP if needed.",
        }
      : {
          subject: `BroTM Poker: ${input.title} - RSVP`,
          heading: "You’re invited",
          intro: "A seat may be waiting for you at the table.",
        };
  const text = variant === "update" && changedFields.length
    ? emailText(input, `${config.intro}\nUpdated details: ${changedFields.join(", ")}.`, unsubscribeLine, locale)
    : emailText(input, config.intro, unsubscribeLine, locale);
  const headers = input.unsubscribeUrl
    ? {
        "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : undefined;
  return {
    subject: config.subject,
    text: text.trim(),
    html: emailHtml(input, config.heading, config.intro, locale, changedFields),
    headers,
  };
}

export function buildPersonalizedInviteEmail(input: PersonalizedInviteInput, locale = "en-US"): EmailBuildResult {
  return buildEventEmail(input, "invite", [], locale);
}

export function buildPersonalizedReminderEmail(input: PersonalizedInviteInput, locale = "en-US"): EmailBuildResult {
  return buildEventEmail(input, "reminder", [], locale);
}

export function buildPersonalizedUpdateEmail(
  input: PersonalizedInviteInput,
  changedFields: string[],
  locale = "en-US",
): EmailBuildResult {
  return buildEventEmail(input, "update", changedFields, locale);
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
