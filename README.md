# BroTM Poker

A clean Cloudflare Pages foundation for the next version of the private BroTM Poker application.

The previous Firebase-hosted CRM prototype has been intentionally retired from this branch. Historical attendance and earnings data are not migration requirements.

## Local validation

```bash
npm install
npm run check
```

The build writes the deployable site to `dist/`.

## Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: leave blank
- Environment variables: none

See [`docs/CLOUDFLARE_PAGES_SETUP.md`](docs/CLOUDFLARE_PAGES_SETUP.md) for the dashboard setup and cutover procedure.

See [`docs/PRODUCT_RESET.md`](docs/PRODUCT_RESET.md) for the boundary between this hosting migration and the upcoming product redesign.
