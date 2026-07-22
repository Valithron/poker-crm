import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { PublicRsvpStatus, RsvpLocationVisibility } from "../shared/rsvp";
import { api } from "./api";

interface PublicRsvpDetail {
  player: { id: string; displayName: string };
  event: {
    id: string;
    title: string;
    startsAt: string;
    hostName: string | null;
    location: string | null;
    locationHiddenUntilYes: boolean;
    gameNotes: string | null;
    stakesNotes: string | null;
    status: "draft" | "open" | "active" | "completed" | "cancelled" | "archived";
  };
  rsvpStatus: "pending" | PublicRsvpStatus;
  canRespond: boolean;
  expiresAt: string;
  lastResponseAt: string | null;
  stateMessage: string;
}

interface AdminInviteState {
  exists: boolean;
  active: boolean;
  expired: boolean;
  revoked: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  lastResponseAt: string | null;
  responseCount: number;
  createdAt: string | null;
}

interface AdminRsvpPlayer {
  eventPlayerId: string;
  playerId: string;
  displayName: string;
  invitationStatus: "invited" | "not_invited";
  rsvpStatus: "pending" | PublicRsvpStatus;
  invite: AdminInviteState;
}

interface AdminRsvpDetail {
  event: {
    id: string;
    title: string;
    startsAt: string;
    hostName: string | null;
    location: string;
    gameNotes: string | null;
    stakesNotes: string | null;
    status: "draft" | "open" | "active" | "completed" | "cancelled" | "archived";
    locationVisibility: RsvpLocationVisibility;
  };
  players: AdminRsvpPlayer[];
}

interface GeneratedInvite {
  playerId: string;
  playerName: string;
  url: string;
  inviteText: string;
  expiresAt: string;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatShortDate(value: string | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

function RsvpChoice({
  status,
  current,
  disabled,
  onSelect,
}: {
  status: PublicRsvpStatus;
  current: PublicRsvpDetail["rsvpStatus"];
  disabled: boolean;
  onSelect: (status: PublicRsvpStatus) => void;
}) {
  const labels: Record<PublicRsvpStatus, string> = {
    yes: "Yes, I’m in",
    maybe: "Maybe",
    no: "No",
  };
  return (
    <button
      className={`rsvp-choice rsvp-choice-${status} ${current === status ? "is-selected" : ""}`}
      type="button"
      disabled={disabled}
      aria-pressed={current === status}
      onClick={() => onSelect(status)}
    >
      {labels[status]}
    </button>
  );
}

export function PublicRsvpPage() {
  const { token = "" } = useParams();
  const [detail, setDetail] = useState<PublicRsvpDetail>();
  const [error, setError] = useState<unknown>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();

  const load = async () => {
    try {
      setDetail(await api<PublicRsvpDetail>(`/rsvp-api/${encodeURIComponent(token)}`));
      setError(undefined);
    } catch (caught) {
      setError(caught);
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  async function respond(status: PublicRsvpStatus) {
    setSaving(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const next = await api<PublicRsvpDetail>(`/rsvp-api/${encodeURIComponent(token)}`, {
        method: "POST",
        body: JSON.stringify({ rsvpStatus: status }),
      });
      setDetail(next);
      setMessage(`Your response is now ${status}.`);
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  if (error && !detail) {
    return (
      <main className="public-rsvp-shell">
        <section className="public-rsvp-card public-rsvp-error" role="alert">
          <div className="public-rsvp-brand"><span aria-hidden="true">♠</span><strong>BroTM Poker</strong></div>
          <h1>Invitation unavailable</h1>
          <p>{errorMessage(error)}</p>
        </section>
      </main>
    );
  }

  if (!detail) {
    return <main className="public-rsvp-shell"><div className="public-rsvp-card">Loading invitation…</div></main>;
  }

  return (
    <main className="public-rsvp-shell">
      <section className="public-rsvp-card">
        <div className="public-rsvp-brand"><span aria-hidden="true">♠</span><strong>BroTM Poker</strong></div>
        <p className="eyebrow">Private invitation for {detail.player.displayName}</p>
        <h1>{detail.event.title}</h1>
        <div className="public-rsvp-details">
          <div><span>When</span><strong>{formatDate(detail.event.startsAt)}</strong></div>
          {detail.event.hostName ? <div><span>Host</span><strong>{detail.event.hostName}</strong></div> : null}
          <div>
            <span>Location</span>
            <strong>
              {detail.event.location ??
                (detail.event.locationHiddenUntilYes ? "Shown after you RSVP yes" : "Not provided")}
            </strong>
          </div>
          {detail.event.gameNotes ? <div><span>Game</span><strong>{detail.event.gameNotes}</strong></div> : null}
          {detail.event.stakesNotes ? <div><span>Stakes</span><strong>{detail.event.stakesNotes}</strong></div> : null}
        </div>

        <div className="public-rsvp-state">
          <span>Current response</span>
          <strong>{detail.rsvpStatus === "pending" ? "Not answered" : detail.rsvpStatus}</strong>
          <p>{detail.stateMessage}</p>
        </div>

        {error ? <div className="state-card state-error" role="alert">{errorMessage(error)}</div> : null}
        {message ? <div className="state-card state-success" role="status">{message}</div> : null}

        <div className="rsvp-choice-grid" aria-label="RSVP response">
          {(["yes", "maybe", "no"] as const).map((status) => (
            <RsvpChoice
              key={status}
              status={status}
              current={detail.rsvpStatus}
              disabled={saving || !detail.canRespond}
              onSelect={(next) => void respond(next)}
            />
          ))}
        </div>
        <p className="public-rsvp-footnote">
          This private link expires after the poker night. Do not forward it to another person.
        </p>
      </section>
    </main>
  );
}

function inviteStatus(player: AdminRsvpPlayer): string {
  if (!player.invite.exists) return "No link generated";
  if (player.invite.revoked) return "Revoked";
  if (player.invite.expired) return "Expired";
  if (player.invite.active) return "Active";
  return "Inactive";
}

export function RsvpAdminPage() {
  const { id = "" } = useParams();
  const [detail, setDetail] = useState<AdminRsvpDetail>();
  const [generated, setGenerated] = useState<Record<string, GeneratedInvite>>({});
  const [error, setError] = useState<unknown>();
  const [message, setMessage] = useState<string>();
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setDetail(await api<AdminRsvpDetail>(`/rsvp-admin-api/events/${id}`));
      setError(undefined);
    } catch (caught) {
      setError(caught);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const invitedPlayers = useMemo(
    () => detail?.players.filter((player) => player.invitationStatus === "invited") ?? [],
    [detail],
  );

  async function generateOne(player: AdminRsvpPlayer) {
    setSaving(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const response = await api<{ generated: GeneratedInvite }>(
        `/rsvp-admin-api/events/${id}/players/${player.playerId}/generate`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setGenerated((current) => ({ ...current, [player.playerId]: response.generated }));
      await copyText(response.generated.inviteText);
      setMessage(`A new private link for ${player.displayName} was generated and copied.`);
      await load();
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function generateAll() {
    setSaving(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const response = await api<{ generated: GeneratedInvite[] }>(
        `/rsvp-admin-api/events/${id}/generate-all`,
        { method: "POST", body: JSON.stringify({}) },
      );
      const next = Object.fromEntries(response.generated.map((invite) => [invite.playerId, invite]));
      setGenerated(next);
      await copyText(response.generated.map((invite) => invite.inviteText).join("\n\n---\n\n"));
      setMessage(`${response.generated.length} personalized invitations were generated and copied.`);
      await load();
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function revoke(player: AdminRsvpPlayer) {
    if (!window.confirm(`Revoke ${player.displayName}’s current RSVP link?`)) return;
    setSaving(true);
    setError(undefined);
    try {
      setDetail(
        await api<AdminRsvpDetail>(
          `/rsvp-admin-api/events/${id}/players/${player.playerId}/revoke`,
          { method: "POST", body: JSON.stringify({}) },
        ),
      );
      setGenerated((current) => {
        const next = { ...current };
        delete next[player.playerId];
        return next;
      });
      setMessage(`${player.displayName}’s RSVP link was revoked.`);
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function saveLocationVisibility(value: RsvpLocationVisibility) {
    setSaving(true);
    setError(undefined);
    try {
      setDetail(
        await api<AdminRsvpDetail>(`/rsvp-admin-api/events/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ locationVisibility: value }),
        }),
      );
      setGenerated({});
      setMessage("RSVP address visibility was updated. Regenerate links before sending invitations.");
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function recopy(player: AdminRsvpPlayer) {
    const invite = generated[player.playerId];
    if (!invite) return;
    try {
      await copyText(invite.inviteText);
      setMessage(`${player.displayName}’s invitation was copied again.`);
    } catch (caught) {
      setError(caught);
    }
  }

  if (error && !detail) return <div className="state-card state-error">{errorMessage(error)}</div>;
  if (!detail) return <div className="state-card">Loading RSVP links…</div>;

  const locked = ["completed", "cancelled", "archived"].includes(detail.event.status);

  return (
    <div className="rsvp-admin-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Private self-service RSVP</p>
          <h1>{detail.event.title}</h1>
          <p className="rsvp-admin-subtitle">Generate personalized links without giving players organizer access.</p>
        </div>
        <div className="page-actions">
          <Link className="button button-secondary" to={`/ops/events/${id}`}>Invite summary</Link>
          <button className="button button-primary" type="button" disabled={saving || locked || !invitedPlayers.length} onClick={() => void generateAll()}>
            Generate all and copy
          </button>
        </div>
      </div>

      {error ? <div className="state-card state-error" role="alert">{errorMessage(error)}</div> : null}
      {message ? <div className="state-card state-success" role="status">{message}</div> : null}

      <section className="panel rsvp-privacy-panel">
        <div>
          <p className="eyebrow">Address privacy</p>
          <h2>When should players see the location?</h2>
          <p>Changing this setting does not reveal existing token values. Regenerate invitation text after changing it.</p>
        </div>
        <select
          value={detail.event.locationVisibility}
          disabled={saving || locked}
          onChange={(change) => void saveLocationVisibility(change.target.value as RsvpLocationVisibility)}
        >
          <option value="always">Always show the address</option>
          <option value="after_yes">Show only after RSVP yes</option>
        </select>
      </section>

      {locked ? (
        <div className="state-card">This event is locked. Recorded responses remain visible, but links cannot be generated, regenerated, or revoked.</div>
      ) : null}

      <section className="panel">
        <div className="section-heading-row">
          <div><p className="eyebrow">Personalized invitations</p><h2>Invited players</h2></div>
          <span>{invitedPlayers.length}</span>
        </div>
        <p className="rsvp-token-note">
          Raw tokens are never stored. Generating a link replaces the player’s previous link, and the new invitation is available to copy during this browser session.
        </p>
        <div className="rsvp-admin-list">
          {invitedPlayers.map((player) => {
            const freshlyGenerated = generated[player.playerId];
            return (
              <article className="rsvp-admin-row" key={player.playerId}>
                <div className="rsvp-admin-player">
                  <strong>{player.displayName}</strong>
                  <span>RSVP: {player.rsvpStatus}</span>
                </div>
                <div className="rsvp-admin-metadata">
                  <span className={`rsvp-link-status ${player.invite.active ? "is-active" : ""}`}>{inviteStatus(player)}</span>
                  <small>Last response: {formatShortDate(player.invite.lastResponseAt)}</small>
                  {player.invite.expiresAt ? <small>Expires: {formatShortDate(player.invite.expiresAt)}</small> : null}
                </div>
                <div className="rsvp-admin-actions">
                  <button className="button button-primary" type="button" disabled={saving || locked} onClick={() => void generateOne(player)}>
                    {player.invite.exists ? "Regenerate and copy" : "Generate and copy"}
                  </button>
                  <button className="button button-secondary" type="button" disabled={!freshlyGenerated} onClick={() => void recopy(player)}>
                    Copy again
                  </button>
                  <button className="button button-danger" type="button" disabled={saving || locked || !player.invite.active} onClick={() => void revoke(player)}>
                    Revoke
                  </button>
                </div>
                {freshlyGenerated ? (
                  <div className="rsvp-generated-preview">
                    <strong>Fresh link generated</strong>
                    <code>{freshlyGenerated.url}</code>
                  </div>
                ) : null}
              </article>
            );
          })}
          {!invitedPlayers.length ? <div className="state-card">Mark players as invited on the event roster first.</div> : null}
        </div>
      </section>
    </div>
  );
}
