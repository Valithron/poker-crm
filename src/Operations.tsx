import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { api } from "./api";
import type { Organizer } from "./types";

type EventStatus = "draft" | "open" | "active" | "completed" | "cancelled" | "archived";

interface OperationsSettings {
  defaultLocation: string;
  defaultGameNotes: string | null;
  defaultStakesNotes: string | null;
  defaultMoneyTrackingEnabled: boolean;
  defaultBuyInCents: number;
  updatedAt: string;
  updatedByName: string | null;
}

interface OperationsOrganizer {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "organizer";
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface OperationsEvent {
  id: string;
  title: string;
  startsAt: string;
  hostPlayerId: string | null;
  hostName: string | null;
  location: string;
  gameNotes: string | null;
  stakesNotes: string | null;
  notes: string | null;
  capacity: number | null;
  moneyTrackingEnabled: boolean;
  defaultBuyInCents: number;
  status: EventStatus;
  playerCount: number;
  attendanceCount: number;
  rsvp: {
    invited: number;
    yes: number;
    maybe: number;
    no: number;
    pending: number;
    expected: number;
  };
  cashInCents: number;
  cashOutCents: number;
  differenceCents: number;
  missingCashOuts: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface OperationsPlayer {
  id: string;
  playerId: string;
  displayName: string;
  invitationStatus: "invited" | "not_invited";
  rsvpStatus: "pending" | "yes" | "maybe" | "no";
  attended: boolean;
  checkedInAt: string | null;
}

interface DashboardResponse {
  settings: OperationsSettings;
  activePlayerCount: number;
  currentEvents: OperationsEvent[];
  nextEvent: OperationsEvent | null;
  incompleteCloseouts: OperationsEvent[];
  recentEvents: OperationsEvent[];
}

interface SettingsResponse {
  settings: OperationsSettings;
  organizers: OperationsOrganizer[];
  activePlayers: Array<{ id: string; displayName: string }>;
}

interface EventResponse {
  event: OperationsEvent;
  players: OperationsPlayer[];
  rsvp: OperationsEvent["rsvp"] & { attended: number };
  inviteText: string;
}

interface SearchResponse {
  players: Array<{
    id: string;
    displayName: string;
    email: string | null;
    phone: string | null;
    status: "active" | "archived";
  }>;
  events: Array<{
    id: string;
    title: string;
    startsAt: string;
    location: string;
    status: EventStatus;
    hostName: string | null;
  }>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function centsFromInput(value: string): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

function formValue(fields: FormData, name: string): string {
  return String(fields.get(name) ?? "");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function Status({ status }: { status: EventStatus }) {
  return <span className={`status-badge status-${status}`}>{status}</span>;
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

function StateCard({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`state-card ${error ? "state-error" : ""}`}>{children}</div>;
}

function PageTitle({ eyebrow, title, actions }: { eyebrow: string; title: string; actions?: ReactNode }) {
  return (
    <div className="page-header operations-page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

function OperationsShell({ children }: { children: ReactNode }) {
  const [organizer, setOrganizer] = useState<Organizer>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    api<{ organizer: Organizer }>("/api/session")
      .then((response) => setOrganizer(response.organizer))
      .catch(setError);
  }, []);

  if (error) return <main className="auth-state"><StateCard error>{errorMessage(error)}</StateCard></main>;
  if (!organizer) return <main className="auth-state">Verifying organizer access…</main>;

  return (
    <div className="app-shell operations-shell">
      <header className="topbar">
        <Link className="brand-lockup" to="/ops">
          <span aria-hidden="true">♠</span>
          <strong>BroTM Operations</strong>
        </Link>
        <div className="organizer-chip">
          <span>{organizer.displayName}</span>
          <small>{organizer.role}</small>
        </div>
      </header>
      <nav className="primary-nav" aria-label="Operations navigation">
        <NavLink to="/ops" end>Overview</NavLink>
        <NavLink to="/ops/search">Search</NavLink>
        <NavLink to="/ops/events/new">Plan night</NavLink>
        <NavLink to="/ops/settings">Settings</NavLink>
        <Link to="/">Main app</Link>
      </nav>
      <main className="page-container operations-container">{children}</main>
    </div>
  );
}

function RsvpGrid({ event }: { event: OperationsEvent }) {
  return (
    <div className="operations-stat-grid" aria-label="RSVP summary">
      <div><span>Yes</span><strong>{event.rsvp.yes}</strong></div>
      <div><span>Maybe</span><strong>{event.rsvp.maybe}</strong></div>
      <div><span>Pending</span><strong>{event.rsvp.pending}</strong></div>
      <div><span>No</span><strong>{event.rsvp.no}</strong></div>
      <div><span>Expected</span><strong>{event.rsvp.expected}</strong></div>
      <div><span>Capacity</span><strong>{event.capacity ?? "Open"}</strong></div>
    </div>
  );
}

function OperationsEventCard({ event }: { event: OperationsEvent }) {
  const overCapacity = event.capacity !== null && event.rsvp.expected > event.capacity;
  return (
    <Link className="event-card operations-event-card" to={`/ops/events/${event.id}`}>
      <div className="event-card-topline">
        <strong>{event.title}</strong>
        <Status status={event.status} />
      </div>
      <span>{formatDate(event.startsAt)}</span>
      <span>{event.location || "Location not set"}</span>
      <div className="event-card-metrics">
        <span>{event.rsvp.expected} expected</span>
        <span className={overCapacity ? "warning-text" : ""}>
          {event.capacity ? `${event.capacity} capacity` : "No capacity limit"}
        </span>
      </div>
    </Link>
  );
}

function OperationsDashboardPage() {
  const [data, setData] = useState<DashboardResponse>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    api<DashboardResponse>("/ops-api/dashboard").then(setData).catch(setError);
  }, []);

  if (error) return <StateCard error>{errorMessage(error)}</StateCard>;
  if (!data) return <StateCard>Loading organizer overview…</StateCard>;

  return (
    <>
      <PageTitle
        eyebrow="Organizer operations"
        title="Run the whole night from one place."
        actions={<Link className="button button-primary" to="/ops/events/new">Plan a night</Link>}
      />

      <section className="metric-grid operations-metrics">
        <article className="metric-card"><span>Active players</span><strong>{data.activePlayerCount}</strong></article>
        <article className="metric-card"><span>Open nights</span><strong>{data.currentEvents.length}</strong></article>
        <article className="metric-card"><span>Closeouts needing attention</span><strong>{data.incompleteCloseouts.length}</strong></article>
      </section>

      <section className="content-section">
        <div className="section-heading-row">
          <div><p className="eyebrow">Current workflow</p><h2>Next or active night</h2></div>
        </div>
        {data.nextEvent ? (
          <div className="operations-feature-card panel">
            <div className="operations-feature-copy">
              <Status status={data.nextEvent.status} />
              <h2>{data.nextEvent.title}</h2>
              <p>{formatDate(data.nextEvent.startsAt)}</p>
              <p>{data.nextEvent.location || data.settings.defaultLocation || "Location not set"}</p>
              <div className="page-actions">
                <Link className="button button-primary" to={`/ops/events/${data.nextEvent.id}`}>Invite summary</Link>
                <Link className="button button-secondary" to={`/events/${data.nextEvent.id}`}>Roster and attendance</Link>
                {data.nextEvent.moneyTrackingEnabled ? (
                  <Link className="button button-secondary" to={`/money/events/${data.nextEvent.id}`}>Money ledger</Link>
                ) : null}
              </div>
            </div>
            <RsvpGrid event={data.nextEvent} />
          </div>
        ) : (
          <StateCard>No night is planned. Create one using the saved defaults.</StateCard>
        )}
      </section>

      {data.incompleteCloseouts.length ? (
        <section className="content-section">
          <div className="section-heading-row">
            <div><p className="eyebrow">Needs attention</p><h2>Incomplete closeouts</h2></div>
          </div>
          <div className="card-list event-grid">
            {data.incompleteCloseouts.map((event) => (
              <article className="panel closeout-card" key={event.id}>
                <div className="event-card-topline"><strong>{event.title}</strong><Status status={event.status} /></div>
                <p>{event.missingCashOuts} missing cash-outs</p>
                <p>Difference: {formatMoney(event.differenceCents)}</p>
                <div className="page-actions">
                  <Link className="button button-primary" to={`/money/events/${event.id}`}>Resolve ledger</Link>
                  <Link className="button button-secondary" to={`/events/${event.id}`}>Attendance</Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="content-section">
        <div className="section-heading-row">
          <div><p className="eyebrow">All current nights</p><h2>Planning queue</h2></div>
        </div>
        {data.currentEvents.length ? (
          <div className="card-list event-grid">
            {data.currentEvents.map((event) => <OperationsEventCard event={event} key={event.id} />)}
          </div>
        ) : (
          <StateCard>No draft, open, or active events.</StateCard>
        )}
      </section>
    </>
  );
}

function OperationsNewEventPage() {
  const [data, setData] = useState<SettingsResponse>();
  const [error, setError] = useState<unknown>();
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api<SettingsResponse>("/ops-api/settings").then(setData).catch(setError);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const defaultBuyInCents = centsFromInput(formValue(fields, "defaultBuyIn"));
    if (defaultBuyInCents === null || defaultBuyInCents < 0) {
      setError(new Error("Enter a valid default buy-in."));
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const response = await api<{ event: OperationsEvent }>("/ops-api/events", {
        method: "POST",
        body: JSON.stringify({
          title: formValue(fields, "title"),
          startsAt: new Date(formValue(fields, "startsAt")).toISOString(),
          hostPlayerId: formValue(fields, "hostPlayerId") || null,
          location: formValue(fields, "location"),
          gameNotes: formValue(fields, "gameNotes") || null,
          stakesNotes: formValue(fields, "stakesNotes") || null,
          notes: formValue(fields, "notes") || null,
          capacity: formValue(fields, "capacity") ? Number(formValue(fields, "capacity")) : null,
          moneyTrackingEnabled: fields.get("moneyTrackingEnabled") === "on",
          defaultBuyInCents,
        }),
      });
      navigate(`/ops/events/${response.event.id}`);
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  if (error && !data) return <StateCard error>{errorMessage(error)}</StateCard>;
  if (!data) return <StateCard>Loading saved defaults…</StateCard>;

  return (
    <>
      <PageTitle eyebrow="Night builder" title="Plan from saved defaults" />
      {error ? <StateCard error>{errorMessage(error)}</StateCard> : null}
      <section className="panel narrow-panel">
        <form className="form-grid operations-form" onSubmit={submit}>
          <label>Event title<input name="title" defaultValue="Poker Night" required maxLength={120} /></label>
          <label>Date and start time<input name="startsAt" type="datetime-local" required /></label>
          <label>
            Host
            <select name="hostPlayerId" defaultValue="">
              <option value="">No host selected</option>
              {data.activePlayers.map((player) => <option value={player.id} key={player.id}>{player.displayName}</option>)}
            </select>
          </label>
          <label>Capacity<input name="capacity" type="number" min={1} max={200} inputMode="numeric" /></label>
          <label className="form-grid-wide">Location<input name="location" defaultValue={data.settings.defaultLocation} maxLength={240} /></label>
          <label className="form-grid-wide">Game and house rules<textarea name="gameNotes" rows={4} defaultValue={data.settings.defaultGameNotes ?? ""} maxLength={1200} /></label>
          <label className="form-grid-wide">Stakes notes<textarea name="stakesNotes" rows={3} defaultValue={data.settings.defaultStakesNotes ?? ""} maxLength={500} /></label>
          <label>Default buy-in<input name="defaultBuyIn" inputMode="decimal" defaultValue={(data.settings.defaultBuyInCents / 100).toFixed(2)} /></label>
          <label className="checkbox-field"><input name="moneyTrackingEnabled" type="checkbox" defaultChecked={data.settings.defaultMoneyTrackingEnabled} /> Track money for this night</label>
          <label className="form-grid-wide">Organizer notes<textarea name="notes" rows={3} maxLength={1200} /></label>
          <Button className="form-grid-action" disabled={saving}>{saving ? "Creating…" : "Create draft"}</Button>
        </form>
      </section>
    </>
  );
}

function OperationsEventPage() {
  const { id = "" } = useParams();
  const [detail, setDetail] = useState<EventResponse>();
  const [error, setError] = useState<unknown>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [correctionNote, setCorrectionNote] = useState("");

  const load = async () => {
    try {
      setDetail(await api<EventResponse>(`/ops-api/events/${id}`));
      setError(undefined);
    } catch (caught) {
      setError(caught);
    }
  };

  useEffect(() => { void load(); }, [id]);

  async function patch(body: Record<string, unknown>, success: string) {
    setSaving(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const locked = detail ? ["completed", "cancelled", "archived"].includes(detail.event.status) : false;
      const response = await api<EventResponse>(`/ops-api/events/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...body, ...(locked ? { correctionNote: correctionNote.trim() } : {}) }),
      });
      setDetail(response);
      setMessage(success);
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function copyInvite() {
    if (!detail) return;
    try {
      await navigator.clipboard.writeText(detail.inviteText);
      setMessage("Invite text copied.");
    } catch {
      setError(new Error("The browser could not copy the invite text. Select it manually."));
    }
  }

  if (error && !detail) return <StateCard error>{errorMessage(error)}</StateCard>;
  if (!detail) return <StateCard>Loading invitation summary…</StateCard>;
  const event = detail.event;
  const locked = ["completed", "cancelled", "archived"].includes(event.status);
  const capacityRemaining = event.capacity === null ? null : event.capacity - event.rsvp.expected;

  return (
    <>
      <PageTitle
        eyebrow="Night builder"
        title={event.title}
        actions={
          <>
            <Status status={event.status} />
            <Link className="button button-secondary" to={`/events/${event.id}`}>Edit roster</Link>
          </>
        }
      />
      {error ? <StateCard error>{errorMessage(error)}</StateCard> : null}
      {message ? <StateCard>{message}</StateCard> : null}

      <section className="operations-feature-card panel">
        <div className="operations-feature-copy">
          <p>{formatDate(event.startsAt)}</p>
          <p>{event.hostName ? `Hosted by ${event.hostName}` : "No host selected"}</p>
          <p>{event.location || "Location not set"}</p>
          <div className="page-actions">
            <Link className="button button-primary" to={`/events/${event.id}`}>Roster and attendance</Link>
            {event.moneyTrackingEnabled ? <Link className="button button-secondary" to={`/money/events/${event.id}`}>Money ledger</Link> : null}
          </div>
        </div>
        <RsvpGrid event={event} />
      </section>

      <div className="two-column-layout operations-event-layout">
        <section className="panel invite-panel">
          <div className="section-heading-row">
            <div><p className="eyebrow">Copy and send</p><h2>Invite text</h2></div>
            <Button type="button" onClick={() => void copyInvite()}>Copy invite</Button>
          </div>
          <textarea className="invite-text" readOnly value={detail.inviteText} rows={10} />
          <div className="capacity-callout">
            {capacityRemaining === null ? "No capacity limit is set." : capacityRemaining >= 0 ? `${capacityRemaining} expected seats remain.` : `${Math.abs(capacityRemaining)} expected players over capacity.`}
          </div>
        </section>

        <aside className="panel">
          <p className="eyebrow">RSVP rollup</p>
          <h2>Invitation status</h2>
          <div className="rsvp-list">
            {detail.players.length ? detail.players.map((player) => (
              <div key={player.id}>
                <strong>{player.displayName}</strong>
                <span>{player.invitationStatus === "not_invited" ? "Not invited" : player.rsvpStatus}</span>
              </div>
            )) : <StateCard>No players are on the roster.</StateCard>}
          </div>
        </aside>
      </div>

      <section className="panel content-section">
        <div className="section-heading-row">
          <div><p className="eyebrow">Operations</p><h2>Capacity, notes, and lifecycle</h2></div>
        </div>
        {locked ? (
          <label className="correction-note-field">
            Correction reason required
            <textarea value={correctionNote} onChange={(change) => setCorrectionNote(change.target.value)} rows={2} maxLength={500} />
          </label>
        ) : null}
        <div className="operations-control-grid">
          <form onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            const fields = new FormData(submitEvent.currentTarget);
            void patch({ capacity: formValue(fields, "capacity") ? Number(formValue(fields, "capacity")) : null }, "Capacity updated.");
          }}>
            <label>Capacity<input name="capacity" type="number" min={1} max={200} defaultValue={event.capacity ?? ""} /></label>
            <Button disabled={saving || (locked && correctionNote.trim().length < 3)}>Save capacity</Button>
          </form>
          <form onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            const fields = new FormData(submitEvent.currentTarget);
            const quickNote = formValue(fields, "quickNote");
            if (quickNote) void patch({ quickNote }, "Event note added.");
            submitEvent.currentTarget.reset();
          }}>
            <label>Quick organizer note<textarea name="quickNote" rows={2} maxLength={500} required /></label>
            <Button disabled={saving || (locked && correctionNote.trim().length < 3)}>Add note</Button>
          </form>
        </div>
        <div className="page-actions operations-danger-row">
          {event.status === "draft" ? <Button disabled={saving} onClick={() => void patch({ status: "open" }, "Invitations opened.")}>Open invitations</Button> : null}
          {["draft", "open"].includes(event.status) ? <Button variant="danger" disabled={saving} onClick={() => void patch({ status: "cancelled" }, "Event cancelled.")}>Cancel event</Button> : null}
          {["draft", "cancelled", "completed"].includes(event.status) ? <Button variant="secondary" disabled={saving || (locked && correctionNote.trim().length < 3)} onClick={() => void patch({ status: "archived" }, "Event archived.")}>Archive event</Button> : null}
        </div>
      </section>
    </>
  );
}

function OperationsSearchPage() {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [results, setResults] = useState<SearchResponse>({ players: [], events: [] });
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(undefined);
    try {
      setResults(await api<SearchResponse>(`/ops-api/search?q=${encodeURIComponent(query.trim())}&scope=${scope}`));
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageTitle eyebrow="Find records" title="Search players and nights" />
      {error ? <StateCard error>{errorMessage(error)}</StateCard> : null}
      <section className="panel">
        <form className="search-form" onSubmit={submit}>
          <input value={query} onChange={(change) => setQuery(change.target.value)} placeholder="Name, email, phone, event, location, or host" />
          <select value={scope} onChange={(change) => setScope(change.target.value)}>
            <option value="all">Everything</option>
            <option value="players">Players</option>
            <option value="events">Events</option>
          </select>
          <Button disabled={loading || !query.trim()}>{loading ? "Searching…" : "Search"}</Button>
        </form>
      </section>

      <div className="two-column-layout content-section">
        <section className="panel">
          <div className="section-heading-row"><h2>Players</h2><span>{results.players.length}</span></div>
          <div className="person-list">
            {results.players.map((player) => (
              <Link className="person-row" to={`/players/${player.id}`} key={player.id}>
                <span className="avatar">{player.displayName.slice(0, 1).toUpperCase()}</span>
                <span><strong>{player.displayName}</strong><small>{player.email || player.phone || player.status}</small></span>
              </Link>
            ))}
            {!results.players.length ? <StateCard>No matching players.</StateCard> : null}
          </div>
        </section>
        <section className="panel">
          <div className="section-heading-row"><h2>Events</h2><span>{results.events.length}</span></div>
          <div className="card-list">
            {results.events.map((event) => (
              <Link className="event-card" to={`/ops/events/${event.id}`} key={event.id}>
                <div className="event-card-topline"><strong>{event.title}</strong><Status status={event.status} /></div>
                <span>{formatDate(event.startsAt)}</span>
                <span>{event.location || event.hostName || "No location or host"}</span>
              </Link>
            ))}
            {!results.events.length ? <StateCard>No matching events.</StateCard> : null}
          </div>
        </section>
      </div>
    </>
  );
}

function OrganizerRow({ organizer, current, onSave }: { organizer: OperationsOrganizer; current: Organizer; onSave: (id: string, body: Record<string, unknown>) => Promise<void> }) {
  const [displayName, setDisplayName] = useState(organizer.displayName);
  const [role, setRole] = useState(organizer.role);
  const [active, setActive] = useState(organizer.active);
  const disabled = current.role !== "admin" || organizer.id === current.id;

  useEffect(() => {
    setDisplayName(organizer.displayName);
    setRole(organizer.role);
    setActive(organizer.active);
  }, [organizer]);

  return (
    <article className="organizer-row">
      <div><strong>{organizer.email}</strong><small>{organizer.id === current.id ? "Current organizer" : organizer.active ? "Active" : "Inactive"}</small></div>
      <input value={displayName} onChange={(change) => setDisplayName(change.target.value)} disabled={current.role !== "admin"} />
      <select value={role} onChange={(change) => setRole(change.target.value as OperationsOrganizer["role"])} disabled={disabled}>
        <option value="organizer">Organizer</option>
        <option value="admin">Admin</option>
      </select>
      <label className="checkbox-field"><input type="checkbox" checked={active} onChange={(change) => setActive(change.target.checked)} disabled={disabled} /> Active</label>
      <Button variant="secondary" disabled={current.role !== "admin"} onClick={() => void onSave(organizer.id, { displayName, role, active })}>Save</Button>
    </article>
  );
}

function OperationsSettingsPage() {
  const [data, setData] = useState<SettingsResponse>();
  const [current, setCurrent] = useState<Organizer>();
  const [error, setError] = useState<unknown>();
  const [message, setMessage] = useState<string>();
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [settingsResponse, session] = await Promise.all([
        api<SettingsResponse>("/ops-api/settings"),
        api<{ organizer: Organizer }>("/api/session"),
      ]);
      setData(settingsResponse);
      setCurrent(session.organizer);
      setError(undefined);
    } catch (caught) {
      setError(caught);
    }
  };

  useEffect(() => { void load(); }, []);

  async function saveDefaults(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const cents = centsFromInput(formValue(fields, "defaultBuyIn"));
    if (cents === null || cents < 0) {
      setError(new Error("Enter a valid default buy-in."));
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      setData(await api<SettingsResponse>("/ops-api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          defaultLocation: formValue(fields, "defaultLocation"),
          defaultGameNotes: formValue(fields, "defaultGameNotes") || null,
          defaultStakesNotes: formValue(fields, "defaultStakesNotes") || null,
          defaultMoneyTrackingEnabled: fields.get("defaultMoneyTrackingEnabled") === "on",
          defaultBuyInCents: cents,
        }),
      }));
      setMessage("Organizer defaults saved.");
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function addOrganizer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setSaving(true);
    setError(undefined);
    try {
      setData(await api<SettingsResponse>("/ops-api/organizers", {
        method: "POST",
        body: JSON.stringify({
          email: formValue(fields, "email"),
          displayName: formValue(fields, "displayName"),
          role: formValue(fields, "role"),
        }),
      }));
      form.reset();
      setMessage("Organizer record added. Their email must also be allowed by Cloudflare Access.");
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function saveOrganizer(id: string, body: Record<string, unknown>) {
    setSaving(true);
    setError(undefined);
    try {
      setData(await api<SettingsResponse>(`/ops-api/organizers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }));
      setMessage("Organizer updated.");
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  if (error && (!data || !current)) return <StateCard error>{errorMessage(error)}</StateCard>;
  if (!data || !current) return <StateCard>Loading settings…</StateCard>;

  return (
    <>
      <PageTitle eyebrow="Configuration" title="Organizer settings" />
      {error ? <StateCard error>{errorMessage(error)}</StateCard> : null}
      {message ? <StateCard>{message}</StateCard> : null}

      <section className="panel">
        <div className="section-heading-row">
          <div><p className="eyebrow">Night defaults</p><h2>Pre-fill new poker nights</h2></div>
          <span>{data.settings.updatedByName ? `Updated by ${data.settings.updatedByName}` : "Not customized"}</span>
        </div>
        <form className="form-grid operations-form" onSubmit={saveDefaults}>
          <label className="form-grid-wide">Default location<input name="defaultLocation" defaultValue={data.settings.defaultLocation} maxLength={240} /></label>
          <label className="form-grid-wide">Default game and house rules<textarea name="defaultGameNotes" rows={4} defaultValue={data.settings.defaultGameNotes ?? ""} maxLength={1200} /></label>
          <label className="form-grid-wide">Default stakes notes<textarea name="defaultStakesNotes" rows={3} defaultValue={data.settings.defaultStakesNotes ?? ""} maxLength={500} /></label>
          <label>Default buy-in<input name="defaultBuyIn" inputMode="decimal" defaultValue={(data.settings.defaultBuyInCents / 100).toFixed(2)} /></label>
          <label className="checkbox-field"><input name="defaultMoneyTrackingEnabled" type="checkbox" defaultChecked={data.settings.defaultMoneyTrackingEnabled} /> Track money by default</label>
          <Button className="form-grid-action" disabled={saving}>{saving ? "Saving…" : "Save defaults"}</Button>
        </form>
      </section>

      <section className="panel content-section">
        <div className="section-heading-row">
          <div><p className="eyebrow">Access records</p><h2>Organizers</h2></div>
          <span>{current.role === "admin" ? "Admin controls enabled" : "Read only"}</span>
        </div>
        {current.role === "admin" ? (
          <form className="organizer-create-form" onSubmit={addOrganizer}>
            <input name="email" type="email" placeholder="Email" required maxLength={200} />
            <input name="displayName" placeholder="Display name" required maxLength={120} />
            <select name="role" defaultValue="organizer"><option value="organizer">Organizer</option><option value="admin">Admin</option></select>
            <Button disabled={saving}>Add organizer</Button>
          </form>
        ) : null}
        <div className="organizer-list">
          {data.organizers.map((organizer) => (
            <OrganizerRow organizer={organizer} current={current} onSave={saveOrganizer} key={organizer.id} />
          ))}
        </div>
        <p className="settings-footnote">An organizer must exist here and be allowed by the Cloudflare Access policy. This screen does not change the Cloudflare policy.</p>
      </section>
    </>
  );
}

function OperationsNotFound() {
  return <StateCard>That operations page does not exist. <Link to="/ops">Return to the overview.</Link></StateCard>;
}

export function OperationsApp() {
  return (
    <OperationsShell>
      <Routes>
        <Route path="/ops" element={<OperationsDashboardPage />} />
        <Route path="/ops/search" element={<OperationsSearchPage />} />
        <Route path="/ops/events/new" element={<OperationsNewEventPage />} />
        <Route path="/ops/events/:id" element={<OperationsEventPage />} />
        <Route path="/ops/settings" element={<OperationsSettingsPage />} />
        <Route path="*" element={<OperationsNotFound />} />
      </Routes>
    </OperationsShell>
  );
}

export function OperationsShortcut() {
  const location = useLocation();
  const eventMatch = location.pathname.match(/^\/events\/([0-9a-f-]+)$/i);
  const target = eventMatch ? `/ops/events/${eventMatch[1]}` : "/ops";
  const label = eventMatch ? "Invite summary" : "Operations";

  if (location.pathname.startsWith("/ops") || location.pathname.startsWith("/money")) return null;
  return <Link className="operations-shortcut" to={target}>{label}</Link>;
}
