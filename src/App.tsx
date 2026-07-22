import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { api, ApiError } from "./api";
import type {
  DashboardData,
  EventAuditEntry,
  EventPlayer,
  Organizer,
  Player,
  PokerEvent,
} from "./types";
import type {
  EventStatus,
  InvitationStatus,
  RsvpStatus,
} from "../shared/domain";

interface EventDetailResponse {
  event: PokerEvent;
  players: EventPlayer[];
  audits: EventAuditEntry[];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formValue(fields: FormData, name: string): string {
  return String(fields.get(name) ?? "");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function auditLabel(action: string): string {
  const labels: Record<string, string> = {
    event_completed: "Event completed",
    event_corrected: "Event details corrected",
    event_player_added_correction: "Player added to completed record",
    event_player_corrected: "Roster record corrected",
    event_player_removed_correction: "Player removed from completed record",
    event_reopened: "Event reopened",
  };
  return labels[action] ?? action.replaceAll("_", " ");
}

function auditNote(entry: EventAuditEntry): string | null {
  const note = entry.details.correctionNote;
  return typeof note === "string" ? note : null;
}

function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <button className={`button button-${variant}`} {...props}>
      {children}
    </button>
  );
}

function PageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

function Loading({ label = "Loading" }: { label?: string }) {
  return <div className="state-card">{label}…</div>;
}

function ErrorPanel({ error }: { error: unknown }) {
  const message = errorMessage(error);
  return (
    <div className="state-card state-error" role="alert">
      <strong>Could not load this view.</strong>
      <span>{message}</span>
    </div>
  );
}

function SuccessPanel({ children }: { children: ReactNode }) {
  return (
    <div className="state-card state-success" role="status">
      {children}
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="state-card">{children}</div>;
}

function StatusBadge({ status }: { status: EventStatus }) {
  return <span className={`status-badge status-${status}`}>{status.replace("_", " ")}</span>;
}

function PlayerStatusBadge({ status }: { status: Player["status"] }) {
  return <span className={`status-badge player-status-${status}`}>{status}</span>;
}

function EventCard({ event }: { event: PokerEvent }) {
  return (
    <Link className="event-card" to={`/events/${event.id}`}>
      <div className="event-card-topline">
        <strong>{event.title}</strong>
        <StatusBadge status={event.status} />
      </div>
      <span>{formatDate(event.startsAt)}</span>
      <span>{event.location || "Location not set"}</span>
      <div className="event-card-metrics">
        <span>{event.playerCount} rostered</span>
        <span>{event.attendanceCount} attended</span>
      </div>
    </Link>
  );
}

function DashboardPage() {
  const [data, setData] = useState<DashboardData>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    api<DashboardData>("/api/dashboard").then(setData).catch(setError);
  }, []);

  if (error) return <ErrorPanel error={error} />;
  if (!data) return <Loading label="Loading dashboard" />;

  return (
    <>
      <PageHeader
        eyebrow="Organizer dashboard"
        title="Keep the night moving."
        actions={
          <>
            <Link className="button button-secondary" to="/players">
              Add player
            </Link>
            <Link className="button button-primary" to="/events/new">
              Plan a night
            </Link>
          </>
        }
      />

      <section className="metric-grid" aria-label="Poker night summary">
        <article className="metric-card">
          <span>Active players</span>
          <strong>{data.activePlayerCount}</strong>
        </article>
        <article className="metric-card">
          <span>Current night</span>
          <strong>{data.nextEvent ? data.nextEvent.status : "None"}</strong>
        </article>
        <article className="metric-card">
          <span>Recent closeouts</span>
          <strong>{data.recentEvents.length}</strong>
        </article>
      </section>

      <section className="content-section">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Next up</p>
            <h2>Current poker night</h2>
          </div>
        </div>
        {data.nextEvent ? (
          <EventCard event={data.nextEvent} />
        ) : (
          <EmptyState>No night is planned yet. Create one when the table is ready.</EmptyState>
        )}
      </section>

      <section className="content-section">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">History</p>
            <h2>Recently completed</h2>
          </div>
          <Link to="/history">View all</Link>
        </div>
        <div className="card-list">
          {data.recentEvents.length ? (
            data.recentEvents.map((event) => <EventCard key={event.id} event={event} />)
          ) : (
            <EmptyState>Completed nights will appear here.</EmptyState>
          )}
        </div>
      </section>
    </>
  );
}

function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>();
  const [filter, setFilter] = useState<"active" | "archived" | "all">("active");
  const [error, setError] = useState<unknown>();
  const [saving, setSaving] = useState(false);

  const load = async (status = filter) => {
    try {
      const response = await api<{ players: Player[] }>(`/api/players?status=${status}`);
      setPlayers(response.players);
      setError(undefined);
    } catch (caught) {
      setError(caught);
    }
  };

  useEffect(() => {
    void load(filter);
  }, [filter]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setSaving(true);
    setError(undefined);
    try {
      await api("/api/players", {
        method: "POST",
        body: JSON.stringify({
          firstName: formValue(fields, "firstName"),
          lastName: formValue(fields, "lastName"),
          displayName: formValue(fields, "displayName") || undefined,
          email: formValue(fields, "email") || undefined,
          phone: formValue(fields, "phone") || undefined,
          notes: formValue(fields, "notes") || undefined,
        }),
      });
      form.reset();
      setFilter("active");
      await load("active");
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Directory" title="Players" />
      {error ? <ErrorPanel error={error} /> : null}
      <div className="two-column-layout">
        <section className="panel">
          <h2>Add player</h2>
          <form className="form-stack" onSubmit={submit}>
            <label>
              First name
              <input name="firstName" required maxLength={80} />
            </label>
            <label>
              Last name
              <input name="lastName" maxLength={80} />
            </label>
            <label>
              Display name <span className="field-hint">optional</span>
              <input name="displayName" maxLength={120} />
            </label>
            <label>
              Email <span className="field-hint">optional</span>
              <input name="email" type="email" maxLength={200} />
            </label>
            <label>
              Phone <span className="field-hint">optional</span>
              <input name="phone" inputMode="tel" maxLength={40} />
            </label>
            <label>
              Organizer notes <span className="field-hint">optional</span>
              <textarea name="notes" rows={3} maxLength={1000} />
            </label>
            <Button disabled={saving}>{saving ? "Saving…" : "Add player"}</Button>
          </form>
        </section>

        <section className="panel">
          <div className="section-heading-row">
            <div>
              <h2>Directory</h2>
              <div className="filter-row" aria-label="Player status filter">
                {(["active", "archived", "all"] as const).map((status) => (
                  <Button
                    key={status}
                    type="button"
                    variant={filter === status ? "primary" : "secondary"}
                    onClick={() => setFilter(status)}
                  >
                    {status}
                  </Button>
                ))}
              </div>
            </div>
            <span>{players?.length ?? 0}</span>
          </div>
          {!players ? (
            <Loading label="Loading players" />
          ) : players.length ? (
            <div className="person-list">
              {players.map((player) => (
                <Link className="person-row" to={`/players/${player.id}`} key={player.id}>
                  <span className="avatar" aria-hidden="true">
                    {player.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="person-row-copy">
                    <span className="person-row-heading">
                      <strong>{player.displayName}</strong>
                      <PlayerStatusBadge status={player.status} />
                    </span>
                    <small>{player.email || player.phone || "No contact details"}</small>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState>No players match this filter.</EmptyState>
          )}
        </section>
      </div>
    </>
  );
}

function PlayerDetailPage() {
  const { id = "" } = useParams();
  const [data, setData] = useState<{ player: Player; history: PokerEvent[] }>();
  const [error, setError] = useState<unknown>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    try {
      const response = await api<{ player: Player; history: PokerEvent[] }>(`/api/players/${id}`);
      setData(response);
      setError(undefined);
    } catch (caught) {
      setError(caught);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    setSaved(false);
    setError(undefined);
    try {
      await api(`/api/players/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          firstName: formValue(fields, "firstName"),
          lastName: formValue(fields, "lastName"),
          displayName: formValue(fields, "displayName"),
          email: formValue(fields, "email"),
          phone: formValue(fields, "phone"),
          notes: formValue(fields, "notes"),
          status: formValue(fields, "status"),
        }),
      });
      await load();
      setSaved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  if (error && !data) return <ErrorPanel error={error} />;
  if (!data) return <Loading label="Loading player" />;

  return (
    <>
      <PageHeader
        eyebrow="Player"
        title={data.player.displayName}
        actions={<PlayerStatusBadge status={data.player.status} />}
      />
      {error ? <ErrorPanel error={error} /> : null}
      {saved ? <SuccessPanel>Player record updated.</SuccessPanel> : null}
      <div className="two-column-layout">
        <section className="panel">
          <h2>Edit player</h2>
          <form className="form-stack" key={data.player.updatedAt} onSubmit={submit}>
            <label>
              First name
              <input name="firstName" defaultValue={data.player.firstName} required maxLength={80} />
            </label>
            <label>
              Last name
              <input name="lastName" defaultValue={data.player.lastName} maxLength={80} />
            </label>
            <label>
              Display name
              <span className="field-hint">Leave blank to derive it from first and last name.</span>
              <input name="displayName" defaultValue={data.player.displayName} maxLength={120} />
            </label>
            <label>
              Email
              <input name="email" type="email" defaultValue={data.player.email ?? ""} maxLength={200} />
            </label>
            <label>
              Phone
              <input
                name="phone"
                inputMode="tel"
                defaultValue={data.player.phone ?? ""}
                maxLength={40}
              />
            </label>
            <label>
              Organizer notes
              <textarea name="notes" rows={5} defaultValue={data.player.notes ?? ""} maxLength={1000} />
            </label>
            <label>
              Directory status
              <select name="status" defaultValue={data.player.status}>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <Button disabled={saving}>{saving ? "Saving…" : "Save player"}</Button>
          </form>
        </section>
        <section className="panel">
          <h2>Completed nights</h2>
          <div className="card-list history-list">
            {data.history.length ? (
              data.history.map((event) => <EventCard event={event} key={event.id} />)
            ) : (
              <EmptyState>No completed attendance yet.</EmptyState>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function EventsPage() {
  const [events, setEvents] = useState<PokerEvent[]>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    api<{ events: PokerEvent[] }>("/api/events")
      .then((response) => setEvents(response.events))
      .catch(setError);
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Poker nights"
        title="Events"
        actions={
          <Link className="button button-primary" to="/events/new">
            Plan a night
          </Link>
        }
      />
      {error ? <ErrorPanel error={error} /> : null}
      {!events ? (
        <Loading label="Loading events" />
      ) : events.length ? (
        <div className="card-list event-grid">
          {events.map((event) => <EventCard event={event} key={event.id} />)}
        </div>
      ) : (
        <EmptyState>No poker nights have been created.</EmptyState>
      )}
    </>
  );
}

function NewEventPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState<unknown>();
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api<{ players: Player[] }>("/api/players")
      .then((response) => setPlayers(response.players))
      .catch(setError);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    setError(undefined);
    try {
      const startsAt = new Date(formValue(fields, "startsAt")).toISOString();
      const response = await api<{ event: PokerEvent }>("/api/events", {
        method: "POST",
        body: JSON.stringify({
          title: formValue(fields, "title"),
          startsAt,
          hostPlayerId: formValue(fields, "hostPlayerId") || null,
          location: formValue(fields, "location"),
          gameNotes: formValue(fields, "gameNotes") || undefined,
          notes: formValue(fields, "notes") || undefined,
        }),
      });
      navigate(`/events/${response.event.id}`);
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Plan" title="New poker night" />
      {error ? <ErrorPanel error={error} /> : null}
      <section className="panel narrow-panel">
        <form className="form-stack" onSubmit={submit}>
          <label>
            Event title
            <input name="title" defaultValue="Poker Night" required maxLength={120} />
          </label>
          <label>
            Date and start time
            <input name="startsAt" type="datetime-local" required />
          </label>
          <label>
            Host <span className="field-hint">optional</span>
            <select name="hostPlayerId" defaultValue="">
              <option value="">No host selected</option>
              {players.map((player) => (
                <option value={player.id} key={player.id}>
                  {player.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Location or address
            <input name="location" maxLength={240} />
          </label>
          <label>
            Game and house-rule notes <span className="field-hint">optional</span>
            <textarea name="gameNotes" rows={4} maxLength={1200} />
          </label>
          <label>
            General event notes <span className="field-hint">optional</span>
            <textarea name="notes" rows={4} maxLength={1200} />
          </label>
          <Button disabled={saving}>{saving ? "Creating…" : "Create draft"}</Button>
        </form>
      </section>
    </>
  );
}

function EventPlayerEditor({
  player,
  disabled,
  saving,
  onPatch,
  onRemove,
}: {
  player: EventPlayer;
  disabled: boolean;
  saving: boolean;
  onPatch: (body: {
    invitationStatus?: InvitationStatus;
    rsvpStatus?: RsvpStatus;
    attended?: boolean;
    notes?: string | null;
  }) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [notes, setNotes] = useState(player.notes ?? "");

  useEffect(() => {
    setNotes(player.notes ?? "");
  }, [player.notes]);

  return (
    <article className={`live-player roster-editor ${player.attended ? "is-attending" : ""}`}>
      <div className="live-player-name">
        <span className="avatar" aria-hidden="true">
          {player.displayName.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <strong>{player.displayName}</strong>
          <small>{player.attended ? "Attended" : "Not checked in"}</small>
        </div>
      </div>
      <div className="roster-field-grid">
        <label>
          <span>Invitation</span>
          <select
            value={player.invitationStatus}
            disabled={disabled || saving}
            onChange={(change) =>
              void onPatch({ invitationStatus: change.target.value as InvitationStatus })
            }
          >
            <option value="invited">Invited</option>
            <option value="not_invited">Not invited</option>
          </select>
        </label>
        <label>
          <span>RSVP</span>
          <select
            value={player.rsvpStatus}
            disabled={disabled || saving}
            onChange={(change) =>
              void onPatch({ rsvpStatus: change.target.value as RsvpStatus })
            }
          >
            <option value="pending">Pending</option>
            <option value="yes">Yes</option>
            <option value="maybe">Maybe</option>
            <option value="no">No</option>
          </select>
        </label>
      </div>
      <div className="roster-action-row">
        <Button
          type="button"
          variant={player.attended ? "secondary" : "primary"}
          disabled={disabled || saving}
          onClick={() => void onPatch({ attended: !player.attended })}
        >
          {player.attended ? "Undo check-in" : "Check in"}
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={disabled || saving}
          onClick={() => void onRemove()}
        >
          Remove
        </Button>
      </div>
      <label className="roster-note-field">
        <span>Event-specific player notes</span>
        <textarea
          rows={2}
          maxLength={500}
          value={notes}
          disabled={disabled || saving}
          onChange={(change) => setNotes(change.target.value)}
        />
      </label>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || saving || notes === (player.notes ?? "")}
        onClick={() => void onPatch({ notes: notes || null })}
      >
        Save player note
      </Button>
    </article>
  );
}

function EventDetailPage() {
  const { id = "" } = useParams();
  const [event, setEvent] = useState<PokerEvent>();
  const [eventPlayers, setEventPlayers] = useState<EventPlayer[]>([]);
  const [audits, setAudits] = useState<EventAuditEntry[]>([]);
  const [directory, setDirectory] = useState<Player[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [correctionMode, setCorrectionMode] = useState(false);
  const [correctionNote, setCorrectionNote] = useState("");
  const [error, setError] = useState<unknown>();
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string>();

  const applyDetail = (detail: EventDetailResponse) => {
    setEvent(detail.event);
    setEventPlayers(detail.players);
    setAudits(detail.audits);
  };

  const load = async () => {
    try {
      const [detail, players] = await Promise.all([
        api<EventDetailResponse>(`/api/events/${id}`),
        api<{ players: Player[] }>("/api/players?status=all"),
      ]);
      applyDetail(detail);
      setDirectory(players.players);
      setError(undefined);
    } catch (caught) {
      setError(caught);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const availablePlayers = useMemo(
    () => directory.filter((player) => !eventPlayers.some((entry) => entry.playerId === player.id)),
    [directory, eventPlayers],
  );

  if (error && !event) return <ErrorPanel error={error} />;
  if (!event) return <Loading label="Loading poker night" />;

  const locked = ["completed", "cancelled", "archived"].includes(event.status);
  const correctionReady = correctionNote.trim().length >= 3;
  const canEdit = !locked || (correctionMode && correctionReady);
  const editDisabled = saving || !canEdit;

  const correctionFields = locked ? { correctionNote: correctionNote.trim() } : {};

  async function saveEventDetails(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const fields = new FormData(formEvent.currentTarget);
    setSaving(true);
    setSavedMessage(undefined);
    setError(undefined);
    try {
      await api(`/api/events/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: formValue(fields, "title"),
          startsAt: new Date(formValue(fields, "startsAt")).toISOString(),
          hostPlayerId: formValue(fields, "hostPlayerId") || null,
          location: formValue(fields, "location"),
          gameNotes: formValue(fields, "gameNotes") || null,
          notes: formValue(fields, "notes") || null,
          ...correctionFields,
        }),
      });
      await load();
      setSavedMessage(locked ? "Completed event correction saved and audited." : "Event details saved.");
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function addPlayer() {
    if (!selectedPlayerId) return;
    setSaving(true);
    setSavedMessage(undefined);
    try {
      const response = await api<EventDetailResponse>(`/api/events/${id}/players`, {
        method: "POST",
        body: JSON.stringify({ playerId: selectedPlayerId, ...correctionFields }),
      });
      applyDetail(response);
      setSelectedPlayerId("");
      setSavedMessage(locked ? "Roster correction saved and audited." : "Player added.");
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function updatePlayer(
    playerId: string,
    body: {
      invitationStatus?: InvitationStatus;
      rsvpStatus?: RsvpStatus;
      attended?: boolean;
      notes?: string | null;
    },
  ) {
    setSaving(true);
    setSavedMessage(undefined);
    try {
      const response = await api<EventDetailResponse>(`/api/events/${id}/players/${playerId}`, {
        method: "PATCH",
        body: JSON.stringify({ ...body, ...correctionFields }),
      });
      applyDetail(response);
      setSavedMessage(locked ? "Roster correction saved and audited." : "Roster updated.");
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function removePlayer(player: EventPlayer) {
    const warning = player.attended
      ? `Remove ${player.displayName}? This also removes their recorded attendance.`
      : `Remove ${player.displayName} from this event?`;
    if (!window.confirm(warning)) return;
    setSaving(true);
    setSavedMessage(undefined);
    try {
      const response = await api<EventDetailResponse>(`/api/events/${id}/players/${player.playerId}`, {
        method: "DELETE",
        body: JSON.stringify(correctionFields),
      });
      applyDetail(response);
      setSavedMessage(locked ? "Roster correction saved and audited." : "Player removed.");
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function transition(status: EventStatus) {
    setSaving(true);
    setSavedMessage(undefined);
    try {
      const response = await api<{ event: PokerEvent }>(`/api/events/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setEvent(response.event);
      setSavedMessage(`Event moved to ${status}.`);
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function complete() {
    if (!window.confirm("Complete and lock this poker night?")) return;
    setSaving(true);
    setSavedMessage(undefined);
    try {
      await api<{ event: PokerEvent }>(`/api/events/${id}/complete`, { method: "POST" });
      await load();
      setSavedMessage("Event completed and locked.");
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function reopen() {
    if (!correctionReady) return;
    if (!window.confirm("Reopen this completed event as an active Live Night?")) return;
    setSaving(true);
    setSavedMessage(undefined);
    try {
      const response = await api<EventDetailResponse>(`/api/events/${id}/reopen`, {
        method: "POST",
        body: JSON.stringify({ correctionNote: correctionNote.trim() }),
      });
      applyDetail(response);
      setCorrectionMode(false);
      setCorrectionNote("");
      setSavedMessage("Event reopened. The action was added to the audit history.");
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Poker night"
        title={event.title}
        actions={<StatusBadge status={event.status} />}
      />
      {error ? <ErrorPanel error={error} /> : null}
      {savedMessage ? <SuccessPanel>{savedMessage}</SuccessPanel> : null}

      <section className="event-hero panel">
        <div>
          <span>Date</span>
          <strong>{formatDate(event.startsAt)}</strong>
        </div>
        <div>
          <span>Host</span>
          <strong>{event.hostName || "Not selected"}</strong>
        </div>
        <div>
          <span>Location</span>
          <strong>{event.location || "Not set"}</strong>
        </div>
        <div>
          <span>Attendance</span>
          <strong>{event.attendanceCount}</strong>
        </div>
      </section>

      {locked ? (
        <section className="panel correction-panel">
          <div>
            <p className="eyebrow">Locked record</p>
            <h2>Correct completed history deliberately</h2>
            <p>
              Corrections keep the event in its current status and write the reason to the permanent audit history.
            </p>
          </div>
          <Button
            type="button"
            variant={correctionMode ? "secondary" : "primary"}
            onClick={() => {
              setCorrectionMode((current) => !current);
              setSavedMessage(undefined);
            }}
          >
            {correctionMode ? "Cancel correction" : "Correct this event"}
          </Button>
          {correctionMode ? (
            <div className="correction-controls">
              <label>
                Required correction note
                <textarea
                  rows={3}
                  maxLength={500}
                  value={correctionNote}
                  onChange={(change) => setCorrectionNote(change.target.value)}
                  placeholder="Example: Forgot to mark Ryan as attending."
                />
              </label>
              <small>Enter at least three characters before editing controls unlock.</small>
              {event.status === "completed" ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!correctionReady || saving}
                  onClick={() => void reopen()}
                >
                  Reopen as Live Night
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : (
        <section className="workflow-bar" aria-label="Event workflow actions">
          {event.status === "draft" ? (
            <Button onClick={() => void transition("open")} disabled={saving}>
              Open invitations
            </Button>
          ) : null}
          {event.status === "open" ? (
            <Button onClick={() => void transition("active")} disabled={saving}>
              Start Live Night
            </Button>
          ) : null}
          {event.status === "active" ? (
            <Button onClick={() => void complete()} disabled={saving}>
              Complete event
            </Button>
          ) : null}
        </section>
      )}

      <section className="panel content-section">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Details</p>
            <h2>Edit event information</h2>
          </div>
          {locked && !correctionMode ? <span>Locked</span> : null}
        </div>
        <form className="form-grid" key={event.updatedAt} onSubmit={saveEventDetails}>
          <label>
            Event title
            <input
              name="title"
              defaultValue={event.title}
              required
              maxLength={120}
              disabled={editDisabled}
            />
          </label>
          <label>
            Date and start time
            <input
              name="startsAt"
              type="datetime-local"
              defaultValue={toLocalDateTime(event.startsAt)}
              required
              disabled={editDisabled}
            />
          </label>
          <label>
            Host
            <select name="hostPlayerId" defaultValue={event.hostPlayerId ?? ""} disabled={editDisabled}>
              <option value="">No host selected</option>
              {directory.map((player) => (
                <option value={player.id} key={player.id}>
                  {player.displayName}
                  {player.status === "archived" ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Location or address
            <input
              name="location"
              defaultValue={event.location}
              maxLength={240}
              disabled={editDisabled}
            />
          </label>
          <label className="form-grid-wide">
            Game and house-rule notes
            <textarea
              name="gameNotes"
              rows={4}
              defaultValue={event.gameNotes ?? ""}
              maxLength={1200}
              disabled={editDisabled}
            />
          </label>
          <label className="form-grid-wide">
            General event notes
            <textarea
              name="notes"
              rows={4}
              defaultValue={event.notes ?? ""}
              maxLength={1200}
              disabled={editDisabled}
            />
          </label>
          <Button className="form-grid-action" disabled={editDisabled}>
            {saving ? "Saving…" : "Save event details"}
          </Button>
        </form>
      </section>

      <div className="two-column-layout event-layout">
        <section className="panel">
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">Roster</p>
              <h2>Players and attendance</h2>
            </div>
            <span>{eventPlayers.length}</span>
          </div>

          <div className="inline-form">
            <select
              aria-label="Player to add"
              value={selectedPlayerId}
              disabled={editDisabled}
              onChange={(change) => setSelectedPlayerId(change.target.value)}
            >
              <option value="">Select player</option>
              {availablePlayers.map((player) => (
                <option value={player.id} key={player.id}>
                  {player.displayName}
                  {player.status === "archived" ? " (archived)" : ""}
                </option>
              ))}
            </select>
            <Button
              type="button"
              onClick={() => void addPlayer()}
              disabled={!selectedPlayerId || editDisabled}
            >
              Add
            </Button>
          </div>

          <div className="live-roster">
            {eventPlayers.length ? (
              eventPlayers.map((player) => (
                <EventPlayerEditor
                  key={player.id}
                  player={player}
                  disabled={editDisabled}
                  saving={saving}
                  onPatch={(body) => updatePlayer(player.playerId, body)}
                  onRemove={() => removePlayer(player)}
                />
              ))
            ) : (
              <EmptyState>Add players to build the event roster.</EmptyState>
            )}
          </div>
        </section>

        <aside className="panel audit-panel">
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">Permanent record</p>
              <h2>Audit history</h2>
            </div>
            <span>{audits.length}</span>
          </div>
          {audits.length ? (
            <ol className="audit-list">
              {audits.map((entry) => (
                <li key={entry.id}>
                  <strong>{auditLabel(entry.action)}</strong>
                  <span>
                    {formatDate(entry.createdAt)} by {entry.organizerName}
                  </span>
                  {auditNote(entry) ? <p>{auditNote(entry)}</p> : null}
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState>Completion and correction actions will appear here.</EmptyState>
          )}
        </aside>
      </div>
    </>
  );
}

function HistoryPage() {
  const [events, setEvents] = useState<PokerEvent[]>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    api<{ events: PokerEvent[] }>("/api/events?status=completed")
      .then((response) => setEvents(response.events))
      .catch(setError);
  }, []);

  return (
    <>
      <PageHeader eyebrow="Permanent record" title="History" />
      {error ? <ErrorPanel error={error} /> : null}
      {!events ? (
        <Loading label="Loading history" />
      ) : events.length ? (
        <div className="card-list event-grid">
          {events.map((event) => <EventCard event={event} key={event.id} />)}
        </div>
      ) : (
        <EmptyState>Complete the first poker night to begin history.</EmptyState>
      )}
    </>
  );
}

function NotFoundPage() {
  return (
    <EmptyState>
      This page does not exist. <Link to="/">Return to the dashboard.</Link>
    </EmptyState>
  );
}

export function App() {
  const [organizer, setOrganizer] = useState<Organizer>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    api<{ organizer: Organizer }>("/api/session")
      .then((response) => setOrganizer(response.organizer))
      .catch(setError);
  }, []);

  if (error) {
    const accessMessage =
      error instanceof ApiError && error.status === 403
        ? "Your Access identity is valid, but it is not enabled as an organizer."
        : errorMessage(error);
    return (
      <main className="auth-state">
        <div className="brand-lockup">
          <span aria-hidden="true">♠</span>
          <strong>BroTM Poker</strong>
        </div>
        <h1>Organizer access required</h1>
        <p>{accessMessage}</p>
      </main>
    );
  }

  if (!organizer) return <main className="auth-state">Verifying organizer access…</main>;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="topbar">
        <Link className="brand-lockup" to="/">
          <span aria-hidden="true">♠</span>
          <strong>BroTM Poker</strong>
        </Link>
        <div className="organizer-chip">
          <span>{organizer.displayName}</span>
          <small>{organizer.role}</small>
        </div>
      </header>
      <nav className="primary-nav" aria-label="Main navigation">
        <NavLink to="/" end>
          Dashboard
        </NavLink>
        <NavLink to="/players">Players</NavLink>
        <NavLink to="/events">Events</NavLink>
        <NavLink to="/history">History</NavLink>
      </nav>
      <main id="main-content" className="page-container">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/players/:id" element={<PlayerDetailPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/new" element={<NewEventPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}
