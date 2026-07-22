import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "./api";
import type { LedgerEntryType } from "../shared/money";

interface MoneyEvent {
  id: string;
  title: string;
  status: "draft" | "open" | "active" | "completed" | "cancelled" | "archived";
  moneyTrackingEnabled: boolean;
  defaultBuyInCents: number;
  stakesNotes: string | null;
}

interface MoneyPlayer {
  playerId: string;
  displayName: string;
  attended: boolean;
  rsvpStatus: "pending" | "yes" | "maybe" | "no";
  cashInCents: number;
  cashOutCents: number;
  netCents: number;
  rebuyCount: number;
  hasCashOut: boolean;
}

interface LedgerEntry {
  id: string;
  eventId: string;
  playerId: string;
  playerName: string;
  entryType: LedgerEntryType;
  amountCents: number;
  note: string | null;
  organizerName: string;
  createdAt: string;
  updatedAt: string;
}

interface MoneyDetail {
  event: MoneyEvent;
  players: MoneyPlayer[];
  entries: LedgerEntry[];
  totals: {
    cashInCents: number;
    cashOutCents: number;
    differenceCents: number;
    missingCashOutCount: number;
    balanced: boolean;
  };
  issues: string[];
  closeoutReady: boolean;
}

interface PlayerMoneyHistory {
  player: { id: string; displayName: string };
  history: Array<{
    eventId: string;
    title: string;
    startsAt: string;
    location: string;
    stakesNotes: string | null;
    cashInCents: number;
    cashOutCents: number;
    netCents: number;
    rebuyCount: number;
  }>;
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

function centsFromInput(value: string): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
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

function MoneyShell({ children }: { children: ReactNode }) {
  return (
    <div className="money-shell">
      <header className="money-topbar">
        <Link className="brand-lockup" to="/">
          <span aria-hidden="true">♠</span>
          <strong>BroTM Poker</strong>
        </Link>
        <span>Cash ledger</span>
      </header>
      <main className="money-page">{children}</main>
    </div>
  );
}

function Loading() {
  return <div className="state-card">Loading cash ledger…</div>;
}

function ErrorPanel({ error }: { error: unknown }) {
  return (
    <div className="state-card state-error" role="alert">
      <strong>Could not load the cash ledger.</strong>
      <span>{errorMessage(error)}</span>
    </div>
  );
}

function NetAmount({ cents }: { cents: number }) {
  const className = cents > 0 ? "net-positive" : cents < 0 ? "net-negative" : "net-zero";
  return <strong className={className}>{money(cents)}</strong>;
}

function entryLabel(type: LedgerEntryType): string {
  const labels: Record<LedgerEntryType, string> = {
    buy_in: "Buy-in",
    rebuy: "Rebuy",
    cash_out: "Cash-out",
    adjustment: "Adjustment",
  };
  return labels[type];
}

function LedgerEntryEditor({
  entry,
  disabled,
  onSave,
  onDelete,
}: {
  entry: LedgerEntry;
  disabled: boolean;
  onSave: (entryId: string, body: { entryType: LedgerEntryType; amountCents: number; note: string | null }) => void;
  onDelete: (entry: LedgerEntry) => void;
}) {
  const [entryType, setEntryType] = useState<LedgerEntryType>(entry.entryType);
  const [amount, setAmount] = useState((entry.amountCents / 100).toFixed(2));
  const [note, setNote] = useState(entry.note ?? "");

  useEffect(() => {
    setEntryType(entry.entryType);
    setAmount((entry.amountCents / 100).toFixed(2));
    setNote(entry.note ?? "");
  }, [entry]);

  const changed =
    entryType !== entry.entryType ||
    centsFromInput(amount) !== entry.amountCents ||
    note !== (entry.note ?? "");

  return (
    <article className="ledger-entry-card">
      <div className="ledger-entry-heading">
        <div>
          <strong>{entry.playerName}</strong>
          <small>
            {entryLabel(entry.entryType)} · {dateTime(entry.createdAt)} · {entry.organizerName}
          </small>
        </div>
        <NetAmount
          cents={
            entry.entryType === "cash_out" || (entry.entryType === "adjustment" && entry.amountCents < 0)
              ? Math.abs(entry.amountCents)
              : -Math.abs(entry.amountCents)
          }
        />
      </div>
      <div className="ledger-edit-grid">
        <label>
          Type
          <select
            value={entryType}
            disabled={disabled}
            onChange={(change) => setEntryType(change.target.value as LedgerEntryType)}
          >
            <option value="buy_in">Buy-in</option>
            <option value="rebuy">Rebuy</option>
            <option value="cash_out">Cash-out</option>
            <option value="adjustment">Adjustment</option>
          </select>
        </label>
        <label>
          Amount
          <input
            type="number"
            step="0.01"
            value={amount}
            disabled={disabled}
            onChange={(change) => setAmount(change.target.value)}
          />
        </label>
        <label className="ledger-note-field">
          Note
          <input
            value={note}
            maxLength={500}
            disabled={disabled}
            onChange={(change) => setNote(change.target.value)}
            placeholder={entryType === "adjustment" ? "Required explanation" : "Optional note"}
          />
        </label>
      </div>
      <div className="ledger-entry-actions">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || !changed || centsFromInput(amount) === null}
          onClick={() => {
            const amountCents = centsFromInput(amount);
            if (amountCents === null) return;
            onSave(entry.id, { entryType, amountCents, note: note || null });
          }}
        >
          Save entry
        </Button>
        <Button type="button" variant="danger" disabled={disabled} onClick={() => onDelete(entry)}>
          Delete
        </Button>
      </div>
    </article>
  );
}

export function MoneyEventPage() {
  const { id = "" } = useParams();
  const [detail, setDetail] = useState<MoneyDetail>();
  const [error, setError] = useState<unknown>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [correctionNote, setCorrectionNote] = useState("");

  const load = async () => {
    try {
      const response = await api<MoneyDetail>(`/money-api/events/${id}`);
      setDetail(response);
      setError(undefined);
    } catch (caught) {
      setError(caught);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const summaries = useMemo(
    () => new Map((detail?.players ?? []).map((player) => [player.playerId, player])),
    [detail?.players],
  );

  if (error && !detail) {
    return (
      <MoneyShell>
        <ErrorPanel error={error} />
        <Link className="button button-secondary" to={`/events/${id}`}>
          Return to event
        </Link>
      </MoneyShell>
    );
  }
  if (!detail) return <MoneyShell><Loading /></MoneyShell>;

  const locked = ["completed", "cancelled", "archived"].includes(detail.event.status);
  const correctionReady = correctionNote.trim().length >= 3;
  const editDisabled = saving || (locked && !correctionReady);
  const correctionFields = locked ? { correctionNote: correctionNote.trim() } : {};

  async function run<T>(action: () => Promise<T>, success: string): Promise<void> {
    setSaving(true);
    setMessage(undefined);
    setError(undefined);
    try {
      const response = await action();
      if (response && typeof response === "object" && "event" in response) {
        setDetail(response as MoneyDetail);
      } else {
        await load();
      }
      setMessage(success);
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const defaultBuyInCents = centsFromInput(String(fields.get("defaultBuyIn") ?? ""));
    if (defaultBuyInCents === null || defaultBuyInCents < 0) {
      setError(new Error("Enter a valid default buy-in."));
      return;
    }
    await run(
      () =>
        api<MoneyDetail>(`/money-api/events/${id}`, {
          method: "PATCH",
          body: JSON.stringify({
            moneyTrackingEnabled: fields.get("moneyTrackingEnabled") === "on",
            defaultBuyInCents,
            stakesNotes: String(fields.get("stakesNotes") ?? "") || null,
            ...correctionFields,
          }),
        }),
      locked ? "Money settings correction saved and audited." : "Money settings saved.",
    );
  }

  async function createEntry(
    player: MoneyPlayer,
    entryType: LedgerEntryType,
    amountCents: number,
    note?: string | null,
  ) {
    await run(
      () =>
        api<MoneyDetail>(`/money-api/events/${id}/entries`, {
          method: "POST",
          body: JSON.stringify({
            playerId: player.playerId,
            entryType,
            amountCents,
            note: note ?? null,
            ...correctionFields,
          }),
        }),
      `${entryLabel(entryType)} recorded for ${player.displayName}.`,
    );
  }

  function promptAmount(label: string, initial: number): number | null {
    const value = window.prompt(`${label} amount in dollars`, (initial / 100).toFixed(2));
    if (value === null) return null;
    const cents = centsFromInput(value);
    if (cents === null) setError(new Error("Enter a valid dollar amount."));
    return cents;
  }

  async function quickBuyIn(player: MoneyPlayer, type: "buy_in" | "rebuy") {
    const amount = promptAmount(entryLabel(type), detail.event.defaultBuyInCents);
    if (amount === null) return;
    await createEntry(player, type, amount);
  }

  async function quickCashOut(player: MoneyPlayer) {
    const amount = promptAmount("Cash-out", player.cashOutCents);
    if (amount === null) return;
    await createEntry(player, "cash_out", amount);
  }

  async function quickAdjustment(player: MoneyPlayer) {
    const amount = promptAmount("Adjustment: positive adds to cash in; negative adds to cash out", 0);
    if (amount === null) return;
    const note = window.prompt("Required adjustment explanation");
    if (!note?.trim()) {
      setError(new Error("Adjustments require an explanation."));
      return;
    }
    await createEntry(player, "adjustment", amount, note.trim());
  }

  async function saveEntry(
    entryId: string,
    body: { entryType: LedgerEntryType; amountCents: number; note: string | null },
  ) {
    await run(
      () =>
        api<MoneyDetail>(`/money-api/events/${id}/entries/${entryId}`, {
          method: "PATCH",
          body: JSON.stringify({ ...body, ...correctionFields }),
        }),
      locked ? "Ledger correction saved and audited." : "Ledger entry updated.",
    );
  }

  async function deleteEntry(entry: LedgerEntry) {
    if (!window.confirm(`Delete the ${entryLabel(entry.entryType).toLowerCase()} for ${entry.playerName}?`)) {
      return;
    }
    await run(
      () =>
        api<MoneyDetail>(`/money-api/events/${id}/entries/${entry.id}`, {
          method: "DELETE",
          body: JSON.stringify(correctionFields),
        }),
      locked ? "Ledger removal saved and audited." : "Ledger entry deleted.",
    );
  }

  async function completeEvent() {
    if (!window.confirm("Complete and lock this balanced poker night?")) return;
    await run(
      () =>
        api<MoneyDetail>(`/money-api/events/${id}/complete`, {
          method: "POST",
          body: JSON.stringify({}),
        }),
      "Event completed with a balanced cash ledger.",
    );
  }

  return (
    <MoneyShell>
      <div className="money-page-header">
        <div>
          <p className="eyebrow">{detail.event.status} event</p>
          <h1>{detail.event.title}</h1>
          <p>{detail.event.stakesNotes || "No stakes notes recorded."}</p>
        </div>
        <Link className="button button-secondary" to={`/events/${id}`}>
          Event details
        </Link>
      </div>

      {error ? <ErrorPanel error={error} /> : null}
      {message ? <div className="state-card state-success">{message}</div> : null}

      {locked ? (
        <section className="panel money-correction-panel">
          <div>
            <p className="eyebrow">Locked money record</p>
            <h2>Correction reason required</h2>
            <p>All changes to a completed ledger are written to the event audit history.</p>
          </div>
          <label>
            Correction note
            <textarea
              rows={3}
              maxLength={500}
              value={correctionNote}
              onChange={(change) => setCorrectionNote(change.target.value)}
              placeholder="Example: Ryan's cash-out was entered as $45 instead of $54."
            />
          </label>
        </section>
      ) : null}

      <section className="panel">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Setup</p>
            <h2>Money tracking</h2>
          </div>
          <span>{detail.event.moneyTrackingEnabled ? "Enabled" : "Disabled"}</span>
        </div>
        <form className="money-settings-form" onSubmit={saveSettings} key={`${detail.event.id}-${detail.event.defaultBuyInCents}-${detail.event.moneyTrackingEnabled}-${detail.event.stakesNotes}`}>
          <label className="toggle-field">
            <input
              type="checkbox"
              name="moneyTrackingEnabled"
              defaultChecked={detail.event.moneyTrackingEnabled}
              disabled={editDisabled}
            />
            <span>Track money for this night</span>
          </label>
          <label>
            Default buy-in
            <input
              type="number"
              name="defaultBuyIn"
              min="0"
              step="0.01"
              defaultValue={(detail.event.defaultBuyInCents / 100).toFixed(2)}
              disabled={editDisabled}
            />
          </label>
          <label className="money-settings-wide">
            Stakes and money notes
            <textarea
              name="stakesNotes"
              rows={3}
              maxLength={500}
              defaultValue={detail.event.stakesNotes ?? ""}
              disabled={editDisabled}
            />
          </label>
          <Button disabled={editDisabled}>{saving ? "Saving…" : "Save money settings"}</Button>
        </form>
      </section>

      {detail.event.moneyTrackingEnabled ? (
        <>
          <section className="money-total-grid" aria-label="Cash closeout totals">
            <article className="metric-card">
              <span>Cash in</span>
              <strong>{money(detail.totals.cashInCents)}</strong>
            </article>
            <article className="metric-card">
              <span>Cash out</span>
              <strong>{money(detail.totals.cashOutCents)}</strong>
            </article>
            <article className={`metric-card ${detail.totals.balanced ? "is-balanced" : "is-unbalanced"}`}>
              <span>Difference</span>
              <strong>{money(detail.totals.differenceCents)}</strong>
            </article>
            <article className={`metric-card ${detail.totals.missingCashOutCount ? "is-unbalanced" : "is-balanced"}`}>
              <span>Missing cash-outs</span>
              <strong>{detail.totals.missingCashOutCount}</strong>
            </article>
          </section>

          <section className={`panel closeout-panel ${detail.closeoutReady ? "is-ready" : "has-issues"}`}>
            <div>
              <p className="eyebrow">Closeout</p>
              <h2>{detail.closeoutReady ? "Ready to close" : "Resolve before closing"}</h2>
            </div>
            {detail.issues.length ? (
              <ul>
                {detail.issues.map((issue) => <li key={issue}>{issue}</li>)}
              </ul>
            ) : (
              <p>Cash in matches cash out, and every attending player has a recorded cash-out.</p>
            )}
            {detail.event.status === "active" ? (
              <Button disabled={saving || !detail.closeoutReady} onClick={() => void completeEvent()}>
                Complete balanced event
              </Button>
            ) : null}
          </section>

          <section className="panel">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">Live Night</p>
                <h2>Players</h2>
              </div>
              <span>{detail.players.length}</span>
            </div>
            <div className="money-player-list">
              {detail.players.map((player) => (
                <article className={`money-player-card ${player.attended ? "is-attending" : ""}`} key={player.playerId}>
                  <div className="money-player-heading">
                    <div>
                      <strong>{player.displayName}</strong>
                      <small>
                        {player.attended ? "Checked in" : `RSVP: ${player.rsvpStatus}`} · {player.rebuyCount} rebuys
                      </small>
                    </div>
                    <NetAmount cents={player.netCents} />
                  </div>
                  <div className="money-player-totals">
                    <span>In {money(player.cashInCents)}</span>
                    <span>Out {player.hasCashOut ? money(player.cashOutCents) : "Not entered"}</span>
                  </div>
                  <div className="money-action-grid">
                    <Button disabled={editDisabled} onClick={() => void quickBuyIn(player, "buy_in")}>Buy in</Button>
                    <Button variant="secondary" disabled={editDisabled} onClick={() => void quickBuyIn(player, "rebuy")}>Rebuy</Button>
                    <Button variant="secondary" disabled={editDisabled} onClick={() => void quickCashOut(player)}>Cash out</Button>
                    <Button variant="secondary" disabled={editDisabled} onClick={() => void quickAdjustment(player)}>Adjustment</Button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">Transactions</p>
                <h2>Ledger entries</h2>
              </div>
              <span>{detail.entries.length}</span>
            </div>
            <p className="ledger-help">
              Positive adjustments add to cash in. Negative adjustments add their absolute value to cash out.
            </p>
            <div className="ledger-entry-list">
              {detail.entries.length ? (
                detail.entries.map((entry) => (
                  <LedgerEntryEditor
                    key={entry.id}
                    entry={entry}
                    disabled={editDisabled}
                    onSave={(entryId, body) => void saveEntry(entryId, body)}
                    onDelete={(selected) => void deleteEntry(selected)}
                  />
                ))
              ) : (
                <div className="state-card">No money has been recorded yet.</div>
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="state-card">
          Enable money tracking to record buy-ins, rebuys, cash-outs, adjustments, and closeout totals.
        </section>
      )}
    </MoneyShell>
  );
}

export function PlayerMoneyPage() {
  const { id = "" } = useParams();
  const [data, setData] = useState<PlayerMoneyHistory>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    api<PlayerMoneyHistory>(`/money-api/players/${id}`).then(setData).catch(setError);
  }, [id]);

  if (error) return <MoneyShell><ErrorPanel error={error} /></MoneyShell>;
  if (!data) return <MoneyShell><Loading /></MoneyShell>;

  const lifetimeNet = data.history.reduce((total, event) => total + event.netCents, 0);
  const totalBuyIns = data.history.reduce((total, event) => total + event.cashInCents, 0);
  const totalCashOuts = data.history.reduce((total, event) => total + event.cashOutCents, 0);

  return (
    <MoneyShell>
      <div className="money-page-header">
        <div>
          <p className="eyebrow">Player money history</p>
          <h1>{data.player.displayName}</h1>
        </div>
        <Link className="button button-secondary" to={`/players/${id}`}>Player details</Link>
      </div>
      <section className="money-total-grid">
        <article className="metric-card"><span>Total in</span><strong>{money(totalBuyIns)}</strong></article>
        <article className="metric-card"><span>Total out</span><strong>{money(totalCashOuts)}</strong></article>
        <article className="metric-card"><span>Derived net</span><NetAmount cents={lifetimeNet} /></article>
        <article className="metric-card"><span>Tracked nights</span><strong>{data.history.length}</strong></article>
      </section>
      <section className="panel">
        <div className="section-heading-row">
          <div><p className="eyebrow">Completed events</p><h2>Financial record</h2></div>
        </div>
        <div className="player-money-history">
          {data.history.length ? data.history.map((event) => (
            <Link to={`/money/events/${event.eventId}`} className="player-money-history-card" key={event.eventId}>
              <div><strong>{event.title}</strong><span>{dateTime(event.startsAt)} · {event.location || "No location"}</span></div>
              <div><span>In {money(event.cashInCents)}</span><span>Out {money(event.cashOutCents)}</span><NetAmount cents={event.netCents} /></div>
              <small>{event.rebuyCount} rebuys · {event.stakesNotes || "No stakes notes"}</small>
            </Link>
          )) : <div className="state-card">No completed money-tracked events yet.</div>}
        </div>
      </section>
    </MoneyShell>
  );
}

export function MoneyShortcut() {
  const location = useLocation();
  const eventMatch = location.pathname.match(/^\/events\/([0-9a-f-]+)$/i);
  const playerMatch = location.pathname.match(/^\/players\/([0-9a-f-]+)$/i);

  if (eventMatch) {
    return <Link className="money-shortcut" to={`/money/events/${eventMatch[1]}`}>$ Money ledger</Link>;
  }
  if (playerMatch) {
    return <Link className="money-shortcut" to={`/money/players/${playerMatch[1]}`}>$ Money history</Link>;
  }
  return null;
}
