import { ZodError } from "zod";
import {
  hashRsvpToken,
  isPlausibleRsvpToken,
  publicRsvpResponseSchema,
  type RsvpLocationVisibility,
} from "../../shared/rsvp";
import { apiError, json, readJson, validationError } from "../lib/http";
import type { AppPagesFunction } from "../lib/types";

const PUBLIC_RSVP_ORGANIZER_ID = "public-rsvp-service";
const RESPONSE_COOLDOWN_MS = 5_000;

interface PublicInviteRow {
  invite_id: string;
  event_player_id: string;
  player_id: string;
  player_name: string;
  rsvp_status: "pending" | "yes" | "maybe" | "no";
  expires_at: string;
  revoked_at: string | null;
  last_response_at: string | null;
  response_count: number;
  event_id: string;
  title: string;
  starts_at: string;
  host_name: string | null;
  location: string;
  game_notes: string | null;
  stakes_notes: string | null;
  event_status: "draft" | "open" | "active" | "completed" | "cancelled" | "archived";
  rsvp_location_visibility: RsvpLocationVisibility;
}

async function findInvite(db: D1Database, token: string): Promise<PublicInviteRow | null> {
  if (!isPlausibleRsvpToken(token)) return null;
  const tokenHash = await hashRsvpToken(token);
  return db
    .prepare(
      `SELECT ei.id AS invite_id, ei.event_player_id, ep.player_id,
              p.display_name AS player_name, ep.rsvp_status,
              ei.expires_at, ei.revoked_at, ei.last_response_at, ei.response_count,
              e.id AS event_id, e.title, e.starts_at,
              host.display_name AS host_name, e.location, e.game_notes,
              e.stakes_notes, e.status AS event_status,
              e.rsvp_location_visibility
       FROM event_invites ei
       JOIN event_players ep ON ep.id = ei.event_player_id
       JOIN players p ON p.id = ep.player_id
       JOIN events e ON e.id = ep.event_id
       LEFT JOIN players host ON host.id = e.host_player_id
       WHERE ei.token_hash = ?1`,
    )
    .bind(tokenHash)
    .first<PublicInviteRow>();
}

function isExpired(invite: PublicInviteRow): boolean {
  return new Date(invite.expires_at).getTime() <= Date.now();
}

function publicJson(invite: PublicInviteRow) {
  const expired = isExpired(invite);
  const revoked = Boolean(invite.revoked_at);
  const eventAllowsResponse = invite.event_status === "open" || invite.event_status === "active";
  const canRespond = !expired && !revoked && eventAllowsResponse;
  const locationVisible =
    invite.rsvp_location_visibility === "always" || invite.rsvp_status === "yes";

  let stateMessage = "Choose yes, maybe, or no.";
  if (invite.event_status === "draft") stateMessage = "Invitations are not open yet.";
  if (invite.event_status === "completed") stateMessage = "This poker night is complete. Your recorded RSVP is shown below.";
  if (invite.event_status === "cancelled") stateMessage = "This poker night was cancelled.";
  if (invite.event_status === "archived") stateMessage = "This invitation is no longer active.";
  if (expired) stateMessage = "This invitation link has expired.";
  if (revoked) stateMessage = "This invitation link has been revoked.";

  return {
    player: {
      id: invite.player_id,
      displayName: invite.player_name,
    },
    event: {
      id: invite.event_id,
      title: invite.title,
      startsAt: invite.starts_at,
      hostName: invite.host_name,
      location: locationVisible ? invite.location : null,
      locationHiddenUntilYes: !locationVisible && invite.rsvp_location_visibility === "after_yes",
      gameNotes: invite.game_notes,
      stakesNotes: invite.stakes_notes,
      status: invite.event_status,
    },
    rsvpStatus: invite.rsvp_status,
    canRespond,
    expiresAt: invite.expires_at,
    lastResponseAt: invite.last_response_at,
    stateMessage,
  };
}

function invalidInvite(): Response {
  return apiError(404, "INVALID_INVITE", "This invitation link is invalid or no longer active.");
}

async function getPublicInvite(db: D1Database, token: string): Promise<Response> {
  const invite = await findInvite(db, token);
  if (!invite || invite.revoked_at || isExpired(invite)) return invalidInvite();
  return json(publicJson(invite));
}

async function respond(request: Request, db: D1Database, token: string): Promise<Response> {
  const invite = await findInvite(db, token);
  if (!invite || invite.revoked_at || isExpired(invite)) return invalidInvite();
  if (invite.event_status !== "open" && invite.event_status !== "active") {
    return apiError(409, "RSVP_LOCKED", "Responses are closed for this poker night.");
  }

  if (
    invite.last_response_at &&
    Date.now() - new Date(invite.last_response_at).getTime() < RESPONSE_COOLDOWN_MS
  ) {
    return apiError(429, "RATE_LIMITED", "Wait a few seconds before changing this response again.");
  }

  const input = publicRsvpResponseSchema.parse(await readJson(request));
  const now = new Date().toISOString();
  const previousStatus = invite.rsvp_status;
  await db.batch([
    db
      .prepare(
        `UPDATE event_players
         SET rsvp_status = ?1, updated_at = ?2
         WHERE id = ?3`,
      )
      .bind(input.rsvpStatus, now, invite.event_player_id),
    db
      .prepare(
        `UPDATE event_invites
         SET last_response_at = ?1,
             response_count = response_count + 1,
             updated_at = ?1
         WHERE id = ?2`,
      )
      .bind(now, invite.invite_id),
    db
      .prepare(
        `INSERT INTO event_audit_log
         (id, event_id, organizer_id, action, details_json, created_at)
         VALUES (?1, ?2, ?3, 'public_rsvp_updated', ?4, ?5)`,
      )
      .bind(
        crypto.randomUUID(),
        invite.event_id,
        PUBLIC_RSVP_ORGANIZER_ID,
        JSON.stringify({
          source: "self_service_rsvp",
          playerId: invite.player_id,
          playerName: invite.player_name,
          from: previousStatus,
          to: input.rsvpStatus,
        }),
        now,
      ),
  ]);

  const updated = await findInvite(db, token);
  if (!updated) return invalidInvite();
  return json(publicJson(updated));
}

export const onRequest: AppPagesFunction = async (context) => {
  const request = context.request;
  const method = request.method.toUpperCase();
  const path = new URL(request.url).pathname.replace(/^\/rsvp-api\/?/u, "");
  const parts = path.split("/").filter(Boolean);
  const token = parts[0];

  try {
    if (!token || parts.length !== 1) return invalidInvite();
    if (method === "GET") return getPublicInvite(context.env.DB, token);
    if (method === "POST") return respond(request, context.env.DB, token);
    return apiError(405, "METHOD_NOT_ALLOWED", "This RSVP action is not supported.");
  } catch (error) {
    if (error instanceof ZodError) return validationError(error);
    if (error instanceof TypeError) return apiError(400, "BAD_REQUEST", error.message);
    return apiError(500, "INTERNAL_ERROR", "The RSVP request could not be completed.");
  }
};
