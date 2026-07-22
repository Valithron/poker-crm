# BroTM Poker product reset

## Decision already made

The new application does not need to preserve the old attendance or earnings data. The rebuild starts with an empty production data model.

## What this foundation decides

- Hosting moves to Cloudflare Pages.
- The old application code is removed from the new branch rather than adapted.
- The old hosting workflow and runtime integration are removed.
- The first deployment is a static, secure, dependency-free shell.
- Product design comes before database design.

## What remains deliberately undecided

- The exact primary purpose of BroTM Poker.
- Whether the first release is organizer-only or includes player access.
- Authentication requirements.
- The permanent data model.
- Whether the backend uses D1, KV, Durable Objects, or no server-side data initially.
- Whether invitations are sent by email, text, shareable link, or handled outside the app.

## Product-definition sequence

1. Define the primary user.
2. Define the single job that makes the application worth opening.
3. Map the full poker-night lifecycle from planning through closeout.
4. Separate must-have workflows from statistics and convenience features.
5. Design the smallest data model that supports that workflow without duplication.
6. Select Cloudflare services only after the workflow is stable.
7. Build one complete vertical slice on a preview branch.

## Working principles

- One source of truth for every fact.
- No sentinel values for missing data.
- Money stored as integer cents when financial results return.
- Historical records preserved through archiving rather than destructive deletion.
- Authorization enforced server-side, never by hidden navigation or a browser whitelist.
- Mobile usability treated as a first-class requirement.
- Preview deployments reviewed before production merges.
