# Cash ledger rollout

The cash ledger requires D1 migration `0002_cash_ledger.sql` before the feature branch is merged into production.

## What the migration adds

- event-level money tracking toggle
- default buy-in amount stored in integer cents
- stakes and money notes
- immutable ledger-entry identifiers
- buy-in, rebuy, cash-out, and adjustment entry types
- organizer and timestamp attribution
- indexes for event and player money history
- a database trigger that prevents unresolved money-tracked events from being completed

## Apply locally

The repository expects the ignored `wrangler.local.jsonc` admin configuration created during initial setup.

```bash
npm run db:migrate:local
```

## Apply to production

Confirm the Cloudflare API token and account ID are exported in the terminal, then run:

```bash
npm run db:migrate:remote
```

Wrangler should report `0002_cash_ledger.sql` as applied to the remote `brotm-poker` database.

## Verification query

```bash
npx wrangler d1 execute brotm-poker --remote --config wrangler.local.jsonc --command "SELECT name FROM sqlite_master WHERE type IN ('table','trigger') AND name IN ('ledger_entries','prevent_unresolved_money_closeout') ORDER BY name;"
```

Expected names:

- `ledger_entries`
- `prevent_unresolved_money_closeout`

## Production smoke test

1. Open an active event and use the **Money ledger** shortcut.
2. Enable money tracking and set a default buy-in.
3. Record a buy-in for every attending player.
4. Record cash-outs, including `$0` for a player who busted.
5. Confirm cash in equals cash out.
6. Complete the event from the ledger or the normal event page.
7. Open a completed event, enter a correction reason, and edit one ledger entry.
8. Confirm the event audit history records the correction.
9. Open a player and confirm **Money history** shows completed tracked events and derived net results.
