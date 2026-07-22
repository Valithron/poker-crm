# BroTM Poker v2 security requirements

- Cloudflare Access must gate the organizer application.
- Pages Functions must validate the signed Access JWT for API requests.
- Verified identity must resolve to an active organizer record.
- Browser-provided identity values are never trusted.
- D1 is accessible only from server-side Functions.
- All SQL uses prepared statements.
- All mutation payloads are validated.
- Contact data and money records are organizer-only.
- Audit records accompany event reopening and material corrections.
- Secrets, audience tags, database IDs, and personal emails are not committed.
- Preview deployments must not use production D1 data.
