import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { DeliveryChannel, DeliveryStatus } from "../shared/delivery";
import type { PublicRsvpStatus, RsvpLocationVisibility } from "../shared/rsvp";
import { api } from "./api";
import { BrandMark } from "./BrandMark";

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
  contact: { email: string | null; phone: string | null };
  invite: AdminInviteState;
  latestDelivery: Record<DeliveryChannel, LatestDelivery | null>;
}

interface LatestDelivery {
  status: DeliveryStatus;
  provider: string | null;
  at: string | null;
  errorMessage: string | null;
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

interface AdminDelivery {
  id: string;
  playerId: string;
  playerName: string;
  channel: DeliveryChannel;
  destination: string;
  provider: string;
  status: DeliveryStatus;
  providerMessageId: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  batchId: string | null;
  attempt: number;
  providerStatus: string | null;
  providerStatusAt: string | null;
}

interface AdminDeliveryBatch {
  id: string;
  policy: "requested_channels" | "preferred_with_fallback";
  source: "manual" | "scheduled";
  status: "sending" | "completed" | "partial" | "failed";
  summary: { requested: number; sent: number; failed: number; skipped: number };
  createdAt: string;
  completedAt: string | null;
}

interface SendInvitesResponse {
  batchId: string;
  summary: { requested: number; sent: number; failed: number; skipped: number };
  results: Array<{
    deliveryId: string | null;
    playerId: string;
    playerName: string;
    channel: DeliveryChannel;
    destination: string | null;
    provider: string | null;
    status: "sent" | "failed" | "skipped";
    errorMessage: string | null;
  }>;
}

interface PendingSend {
  playerIds?: string[];
  targetLabel: string;
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
          <div className="public-rsvp-brand"><BrandMark /><strong>BroTM Poker</strong></div>
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
        <div className="public-rsvp-brand"><BrandMark /><strong>BroTM Poker</strong></div>
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
  const [searchParams] = useSearchParams();
  const [detail, setDetail] = useState<AdminRsvpDetail>();
  const [deliveries, setDeliveries] = useState<AdminDelivery[]>([]);
  const [batches, setBatches] = useState<AdminDeliveryBatch[]>([]);
  const [generated, setGenerated] = useState<Record<string, GeneratedInvite>>({});
  const [error, setError] = useState<unknown>();
  const [message, setMessage] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [pendingSend, setPendingSend] = useState<PendingSend>();
  const confirmSendButton = useRef<HTMLButtonElement>(null);
  const didAutoOpenInvite = useRef(false);

  const load = async () => {
    try {
      const [nextDetail, deliveryResponse] = await Promise.all([
        api<AdminRsvpDetail>(`/rsvp-admin-api/events/${id}`),
        api<{ deliveries: AdminDelivery[]; batches: AdminDeliveryBatch[] }>(`/rsvp-admin-api/events/${id}/deliveries`),
      ]);
      setDetail(nextDetail);
      setDeliveries(deliveryResponse.deliveries);
      setBatches(deliveryResponse.batches);
      setError(undefined);
    } catch (caught) {
      setError(caught);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    if (!detail || didAutoOpenInvite.current || searchParams.get("invite") !== "1") return;
    didAutoOpenInvite.current = true;
    if (detail.event.status === "open" || detail.event.status === "active") {
      const invited = detail.players.filter((player) => player.invitationStatus === "invited");
      if (invited.length) setPendingSend({ targetLabel: `${invited.length} rostered players` });
    }
  }, [detail, searchParams]);

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

  function requestSendInvites(playerIds?: string[]) {
    const target = playerIds?.length === 1
      ? "this player"
      : `${playerIds?.length ?? invitedPlayers.length} rostered players`;
    setPendingSend({ playerIds, targetLabel: target });
  }

  async function sendInvites(playerIds?: string[]) {
    setPendingSend(undefined);
    setSaving(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const response = await api<SendInvitesResponse>(`/rsvp-admin-api/events/${id}/send-invites`, {
        method: "POST",
        body: JSON.stringify({
          channels: ["email"],
          requestId: crypto.randomUUID(),
          ...(playerIds ? { playerIds } : {}),
        }),
      });
      const { summary } = response;
      setMessage(
        `Batch ${response.batchId.slice(0, 8)} processed: ${summary.sent} sent, ${summary.failed} failed, ${summary.skipped} skipped.`,
      );
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

  async function retryDelivery(delivery: AdminDelivery) {
    if (delivery.status !== "failed") return;
    setSaving(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const response = await api<SendInvitesResponse>(`/rsvp-admin-api/deliveries/${delivery.id}/retry`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setMessage(`Retry processed: ${response.summary.sent} sent, ${response.summary.failed} failed, ${response.summary.skipped} skipped.`);
      await load();
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (pendingSend) confirmSendButton.current?.focus();
  }, [pendingSend]);

  if (error && !detail) return <div className="state-card state-error">{errorMessage(error)}</div>;
  if (!detail) return <div className="state-card">Loading RSVP links…</div>;

  const locked = ["completed", "cancelled", "archived"].includes(detail.event.status);
  const sendable = detail.event.status === "open" || detail.event.status === "active";
  const contactSummary = {
    email: invitedPlayers.filter((player) => Boolean(player.contact.email)).length,
    missing: invitedPlayers.filter((player) => !player.contact.email).length,
    excluded: (detail?.players.length ?? 0) - invitedPlayers.length,
  };

  return (
    <div className="rsvp-admin-page">
      {pendingSend ? (
        <div
          className="invite-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingSend(undefined);
          }}
        >
          <section
            className="invite-dialog panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-dialog-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") setPendingSend(undefined);
            }}
          >
            <div>
              <p className="eyebrow">Review invitation</p>
              <h2 id="invite-dialog-title">Send email invitations?</h2>
              <p>
                This will send email to {pendingSend.targetLabel}. Each recipient gets a fresh RSVP link; any previous link for that player will stop working.
              </p>
            </div>
            <div className="invite-dialog-summary">
              <span><strong>{pendingSend.playerIds?.length ?? invitedPlayers.length}</strong> selected</span>
              <span><strong>{pendingSend.playerIds ? pendingSend.playerIds.filter((playerId) => invitedPlayers.some((player) => player.playerId === playerId && player.contact.email)).length : contactSummary.email}</strong> email-ready</span>
              <span className={contactSummary.missing ? "is-warning" : ""}><strong>{pendingSend.playerIds ? pendingSend.playerIds.filter((playerId) => invitedPlayers.some((player) => player.playerId === playerId && !player.contact.email)).length : contactSummary.missing}</strong> skipped without email</span>
            </div>
            <div className="invite-dialog-actions">
              <button className="button button-secondary" type="button" onClick={() => setPendingSend(undefined)}>
                Cancel
              </button>
              <button
                ref={confirmSendButton}
                className="button button-primary"
                type="button"
                onClick={() => void sendInvites(pendingSend.playerIds)}
              >
                Send invitations
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <div className="page-header">
        <div>
          <p className="eyebrow">Private self-service RSVP</p>
          <h1>{detail.event.title}</h1>
          <p className="rsvp-admin-subtitle">Generate personalized links without giving players organizer access.</p>
        </div>
        <div className="page-actions">
          <Link className="button button-secondary" to={`/events/${id}`}>Event setup</Link>
          <button className="button button-primary" type="button" disabled={saving || locked || !invitedPlayers.length} onClick={() => void generateAll()}>
            Generate all and copy
          </button>
          <button className="button button-primary" type="button" disabled={saving || !sendable || !invitedPlayers.length} onClick={() => requestSendInvites()}>
            Invite roster by email
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
      {!locked && !sendable ? (
        <div className="state-card">Open the event before sending invitations. Draft events can still have links generated for testing.</div>
      ) : null}

      <section className="panel rsvp-preflight-panel">
        <div>
          <p className="eyebrow">Send preflight</p>
          <h2>Ready to invite</h2>
          <p>Sending rotates each invited player’s RSVP link. Missing contacts are skipped without stopping the batch.</p>
        </div>
        <div className="rsvp-preflight-stats">
          <span><strong>{invitedPlayers.length}</strong> eligible</span>
          <span><strong>{contactSummary.email}</strong> with email</span>
          <span className={contactSummary.missing ? "is-warning" : ""}><strong>{contactSummary.missing}</strong> missing email</span>
          <span><strong>{contactSummary.excluded}</strong> excluded</span>
        </div>
      </section>

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
                  <small>Email: {player.contact.email || "not saved"}</small>
                  <small>Phone: {player.contact.phone || "not saved"}</small>
                  <small>Email is the active invitation method in this release.</small>
                </div>
                <div className="rsvp-admin-metadata">
                  <span className={`rsvp-link-status ${player.invite.active ? "is-active" : ""}`}>{inviteStatus(player)}</span>
                  <small>Last response: {formatShortDate(player.invite.lastResponseAt)}</small>
                  {player.invite.expiresAt ? <small>Expires: {formatShortDate(player.invite.expiresAt)}</small> : null}
                  <small>Email: {deliverySummary(player.latestDelivery.email)}</small>
                  <small>Text: {deliverySummary(player.latestDelivery.sms)}</small>
                </div>
                <div className="rsvp-admin-actions">
                  <button className="button button-primary" type="button" disabled={saving || !sendable || !player.contact.email} onClick={() => requestSendInvites([player.playerId])}>
                    Send email
                  </button>
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

      <section className="panel">
        <div className="section-heading-row">
          <div><p className="eyebrow">Batch history</p><h2>Send summaries</h2></div>
          <span>{batches.length}</span>
        </div>
        {batches.length ? (
          <div className="rsvp-delivery-history">
            {batches.map((batch) => (
              <article className="rsvp-delivery-row" key={batch.id}>
                <div>
                  <strong>{batch.source === "scheduled" ? "Scheduled reminder" : "Organizer send"}</strong>
                  <span>{batch.policy === "preferred_with_fallback" ? "Preferred channel with fallback" : "Requested channels"}</span>
                </div>
                <div>
                  <span className={`rsvp-delivery-status is-${batch.status}`}>{batch.status}</span>
                  <small>{batch.summary.sent} sent · {batch.summary.failed} failed · {batch.summary.skipped} skipped</small>
                  <small>{formatShortDate(batch.completedAt || batch.createdAt)}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="state-card">No send batches yet.</div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading-row">
          <div><p className="eyebrow">Delivery history</p><h2>Recent invitation attempts</h2></div>
          <span>{deliveries.length}</span>
        </div>
        {deliveries.length ? (
          <div className="rsvp-delivery-history">
            {deliveries.map((delivery) => (
              <article className="rsvp-delivery-row" key={delivery.id}>
                <div>
                  <strong>{delivery.playerName}</strong>
                  <span>{delivery.channel === "email" ? "Email" : "Text"} · {delivery.destination}</span>
                </div>
                <div>
                  <span className={`rsvp-delivery-status is-${delivery.status}`}>{delivery.status}</span>
                  <small>{delivery.provider} · {formatShortDate(delivery.completedAt || delivery.createdAt)}</small>
                  {delivery.errorMessage ? <small className="state-error-text">{delivery.errorMessage}</small> : null}
                  <small>Attempt {delivery.attempt}</small>
                  {delivery.providerStatus ? <small>Provider: {delivery.providerStatus}</small> : null}
                  {delivery.status === "failed" ? <button className="button button-secondary" type="button" disabled={saving || !sendable} onClick={() => void retryDelivery(delivery)}>Retry</button> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="state-card">No delivery attempts yet.</div>
        )}
      </section>
    </div>
  );
}

function deliverySummary(delivery: LatestDelivery | null): string {
  if (!delivery) return "not sent";
  if (delivery.status === "sent") return `${delivery.provider ?? "provider"} · ${formatShortDate(delivery.at)}`;
  return `${delivery.status}${delivery.errorMessage ? ` · ${delivery.errorMessage}` : ""}`;
}
