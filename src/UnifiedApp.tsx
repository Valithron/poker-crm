import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import {
  APP_VERSION,
  REQUIRED_SCHEMA_VERSION,
  eventIdFromPath,
  type HealthReport,
} from "../shared/app-shell";
import { App } from "./App";
import { api, ApiError } from "./api";
import { MoneyEventPage, PlayerMoneyPage } from "./Money";
import { OperationsApp } from "./Operations";
import { RsvpAdminPage } from "./Rsvp";
import type { Organizer } from "./types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function ViewRouter() {
  const location = useLocation();

  if (location.pathname === "/ops" || location.pathname.startsWith("/ops/")) {
    return <OperationsApp />;
  }

  return (
    <Routes>
      <Route path="/money/events/:id" element={<MoneyEventPage />} />
      <Route path="/money/players/:id" element={<PlayerMoneyPage />} />
      <Route path="/rsvp/events/:id" element={<RsvpAdminPage />} />
      <Route path="*" element={<App />} />
    </Routes>
  );
}

function NavItem({ to, children, active }: { to: string; children: ReactNode; active?: boolean }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) => (active || isActive ? "active" : undefined)}
    >
      {children}
    </NavLink>
  );
}

export function UnifiedApp() {
  const location = useLocation();
  const [organizer, setOrganizer] = useState<Organizer>();
  const [sessionError, setSessionError] = useState<unknown>();
  const [health, setHealth] = useState<HealthReport>();
  const eventId = eventIdFromPath(location.pathname);

  useEffect(() => {
    api<{ organizer: Organizer }>("/api/session")
      .then((response) => setOrganizer(response.organizer))
      .catch(setSessionError);

    fetch("/api/health", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        const report = (await response.json()) as HealthReport;
        setHealth(report);
      })
      .catch(() => {
        setHealth({
          ok: false,
          appVersion: APP_VERSION,
          commit: null,
          schemaVersion: 0,
          requiredSchemaVersion: REQUIRED_SCHEMA_VERSION,
          missingTables: [],
          missingColumns: [],
          message: "The deployment health check could not be reached.",
        });
      });
  }, []);

  if (sessionError) {
    const accessMessage =
      sessionError instanceof ApiError && sessionError.status === 403
        ? "Your Access identity is valid, but it is not enabled as an organizer."
        : errorMessage(sessionError);
    return (
      <main className="auth-state">
        <div className="brand-lockup"><span aria-hidden="true">♠</span><strong>BroTM Poker</strong></div>
        <h1>Organizer access required</h1>
        <p>{accessMessage}</p>
      </main>
    );
  }

  if (!organizer) return <main className="auth-state">Verifying organizer access…</main>;

  const settingsActive = location.pathname.startsWith("/ops/settings");
  const searchActive = location.pathname.startsWith("/ops/search");

  return (
    <div className="unified-shell">
      <a className="skip-link" href="#unified-main">Skip to content</a>
      <header className="unified-topbar">
        <Link className="brand-lockup" to="/">
          <span aria-hidden="true">♠</span>
          <strong>BroTM Poker</strong>
        </Link>
        <div className="unified-topbar-actions">
          <Link className="button button-primary unified-plan-button" to="/ops/events/new">Plan night</Link>
          <div className="organizer-chip"><span>{organizer.displayName}</span><small>{organizer.role}</small></div>
        </div>
      </header>

      <nav className="primary-nav unified-nav" aria-label="Main navigation">
        <NavItem to="/">Dashboard</NavItem>
        <NavItem to="/events">Nights</NavItem>
        <NavItem to="/players">Players</NavItem>
        <NavItem to="/history">History</NavItem>
        <NavItem to="/ops/search" active={searchActive}>Search</NavItem>
        <NavItem to="/ops/settings" active={settingsActive}>Settings</NavItem>
      </nav>

      {health && !health.ok ? (
        <aside className="deployment-warning" role="alert">
          <strong>Deployment needs attention.</strong>
          <span>{health.message}</span>
          <code>Schema {health.schemaVersion}/{health.requiredSchemaVersion}</code>
        </aside>
      ) : null}

      {eventId ? (
        <nav className="event-workspace-nav" aria-label="Poker night sections">
          <Link className={location.pathname === `/events/${eventId}` ? "active" : ""} to={`/events/${eventId}`}>Details & live</Link>
          <Link className={location.pathname === `/ops/events/${eventId}` ? "active" : ""} to={`/ops/events/${eventId}`}>Invites & RSVP</Link>
          <Link className={location.pathname === `/rsvp/events/${eventId}` ? "active" : ""} to={`/rsvp/events/${eventId}`}>RSVP links</Link>
          <Link className={location.pathname === `/money/events/${eventId}` ? "active" : ""} to={`/money/events/${eventId}`}>Money</Link>
        </nav>
      ) : null}

      <div id="unified-main" className="unified-main" role="main">
        <ViewRouter />
      </div>

      <footer className="unified-footer">
        <span>BroTM Poker v{health?.appVersion ?? APP_VERSION}</span>
        <span>{health?.commit ? `Build ${health.commit.slice(0, 7)}` : "Production organizer app"}</span>
        <span className={health?.ok ? "health-ready" : "health-warning"}>{health?.ok ? "Database ready" : "Health warning"}</span>
      </footer>
    </div>
  );
}
