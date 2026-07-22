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
  EventPlayer,
  Organizer,
  Player,
  PokerEvent,
} from "./types";
import type { EventStatus, RsvpStatus } from "../shared/domain";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
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

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="state-card">{children}</div>;
}

function StatusBadge({ status }: { status: EventStatus }) {
  return <span className={`status-badge status-${status}`}>{status.replace("_", " ")}</span>;
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
  const [error, setError] = useState<unknown>();
  const [saving, setSaving] = useState(false);

  const load = () =>
    api<{ players: Player[] }>("/api/players")
      .then((response) => setPlayers(response.players))
      .catch(setError);

  useEffect(load, []);

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
          firstName: fields.get("firstName"),
          lastName: fields.get("lastName"),
          displayName: fields.get("displayName") || undefined,
          email: fields.get("email") || undefined,
          phone: fields.get("phone") || undefined,
          notes: fields.get("notes") || undefined,
        }),
      });
      form.reset();
      await load();
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
            <h2>Active directory</h2>
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
                  <span>
                    <strong>{player.displayName}</strong>
                    <small>{player.email || player.phone || "No contact details"}</small>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState>Add the first player to begin building the roster.</EmptyState>
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

  useEffect(() => {
    api<{ player: Player; history: PokerEvent[] }>(`/api/players/${id}`)
      .then(setData)
      .catch(setError);
  }, [id]);

  if (error) return <ErrorPanel error={error} />;
  if (!data) return <Loading label="Loading player" />;

  return (
    <>
      <PageHeader eyebrow="Player" title={data.player.displayName} />
      <div className="two-column-layout">
        <section className="panel detail-list">
          <h2>Contact</h2>
          <dl>
            <div>
              <dt>Email</dt>
              <dd>{data.player.email || "Not recorded"}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{data.player.phone || "Not recorded"}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{data.player.notes || "No notes"}</dd>
            </div>
          </dl>
        </section>
        <section className="panel">
          <h2>Completed nights</h2>
          <div className="card-list">
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
      const startsAt = new Date(String(fields.get("startsAt"))).toISOString();
      const response = await api<{ event: PokerEvent }>("/api/events", {
        method: "POST",
        body: JSON.stringify({
          title: fields.get("title"),
          startsAt,
          hostPlayerId: fields.get("hostPlayerId") || null,
          location: fields.get("location"),
          gameNotes: fields.get("gameNotes") || undefined,
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
            Location
            <input name="location" maxLength={240} />
          </label>
          <label>
            Game and house-rule notes <span className="field-hint">optional</span>
            <textarea name="gameNotes" rows={4} maxLength={1200} />
          </label>
          <Button disabled={saving}>{saving ? "Creating…" : "Create draft"}</Button>
        </form>
      </section>
    </>
  );
}

function EventDetailPage() {
  const { id = "" } = useParams();
  const [event, setEvent] = useState<PokerEvent>();
  const [eventPlayers, setEventPlayers] = useState<EventPlayer[]>([]);
  const [directory, setDirectory] = useState<Player[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [error, setError] = useState<unknown>();
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [detail, players] = await Promise.all([
        api<{ event: PokerEvent; players: EventPlayer[] }>(`/api/events/${id}`),
        api<{ players: Player[] }>("/api/players"),
      ]);
      setEvent(detail.event);
      setEventPlayers(detail.players);
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

  async function addPlayer() {
    if (!selectedPlayerId) return;
    setSaving(true);
    try {
      await api(`/api/events/${id}/players`, {
        method: "POST",
        body: JSON.stringify({ playerId: selectedPlayerId }),
      });
      setSelectedPlayerId("");
      await load();
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function updatePlayer(playerId: string, body: { rsvpStatus?: RsvpStatus; attended?: boolean }) {
    setSaving(true);
    try {
      const response = await api<{ event: PokerEvent; players: EventPlayer[] }>(
        `/api/events/${id}/players/${playerId}`,
        { method: "PATCH", body: JSON.stringify(body) },
      );
      setEvent(response.event);
      setEventPlayers(response.players);
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function transition(status: EventStatus) {
    setSaving(true);
    try {
      const response = await api<{ event: PokerEvent }>(`/api/events/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setEvent(response.event);
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function complete() {
    if (!window.confirm("Complete and lock this poker night?")) return;
    setSaving(true);
    try {
      const response = await api<{ event: PokerEvent }>(`/api/events/${id}/complete`, {
        method: "POST",
      });
      setEvent(response.event);
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  if (error && !event) return <ErrorPanel error={error} />;
  if (!event) return <Loading label="Loading poker night" />;
  const locked = ["completed", "cancelled", "archived"].includes(event.status);

  return (
    <>
      <PageHeader
        eyebrow="Poker night"
        title={event.title}
        actions={<StatusBadge status={event.status} />}
      />
      {error ? <ErrorPanel error={error} /> : null}

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

      {!locked ? (
        <section className="workflow-bar" aria-label="Event workflow actions">
          {event.status === "draft" ? (
            <Button onClick={() => transition("open")} disabled={saving}>
              Open invitations
            </Button>
          ) : null}
          {event.status === "open" ? (
            <Button onClick={() => transition("active")} disabled={saving}>
              Start Live Night
            </Button>
          ) : null}
          {event.status === "active" ? (
            <Button onClick={complete} disabled={saving}>
              Complete event
            </Button>
          ) : null}
        </section>
      ) : null}

      <div className="two-column-layout event-layout">
        <section className="panel">
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">Roster</p>
              <h2>Players</h2>
            </div>
            <span>{eventPlayers.length}</span>
          </div>

          {!locked ? (
            <div className="inline-form">
              <select
                aria-label="Player to add"
                value={selectedPlayerId}
                onChange={(change) => setSelectedPlayerId(change.target.value)}
              >
                <option value="">Select player</option>
                {availablePlayers.map((player) => (
                  <option value={player.id} key={player.id}>
                    {player.displayName}
                  </option>
                ))}
              </select>
              <Button onClick={addPlayer} disabled={!selectedPlayerId || saving}>
                Add
              </Button>
            </div>
          ) : null}

          <div className="live-roster">
            {eventPlayers.length ? (
              eventPlayers.map((player) => (
                <article className={`live-player ${player.attended ? "is-attending" : ""}`} key={player.id}>
                  <div className="live-player-name">
                    <span className="avatar" aria-hidden="true">
                      {player.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <strong>{player.displayName}</strong>
                  </div>
                  <label>
                    <span>RSVP</span>
                    <select
                      value={player.rsvpStatus}
                      disabled={locked || saving}
                      onChange={(change) =>
                        updatePlayer(player.playerId, { rsvpStatus: change.target.value as RsvpStatus })
                      }
                    >
                      <option value="pending">Pending</option>
                      <option value="yes">Yes</option>
                      <option value="maybe">Maybe</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                  <Button
                    variant={player.attended ? "secondary" : "primary"}
                    disabled={locked || saving}
                    onClick={() => updatePlayer(player.playerId, { attended: !player.attended })}
                  >
                    {player.attended ? "Checked in" : "Check in"}
                  </Button>
                </article>
              ))
            ) : (
              <EmptyState>Add players to build the event roster.</EmptyState>
            )}
          </div>
        </section>

        <aside className="panel detail-list">
          <h2>Event notes</h2>
          <dl>
            <div>
              <dt>Game</dt>
              <dd>{event.gameNotes || "No game notes"}</dd>
            </div>
            <div>
              <dt>Rostered</dt>
              <dd>{event.playerCount}</dd>
            </div>
            <div>
              <dt>Attended</dt>
              <dd>{event.attendanceCount}</dd>
            </div>
          </dl>
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
