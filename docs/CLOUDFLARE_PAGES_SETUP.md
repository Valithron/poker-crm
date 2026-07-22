# Cloudflare Pages setup

This repository is prepared for Cloudflare Pages with a dependency-free build.

## Build settings

| Setting | Value |
| --- | --- |
| Project name | `brotm-poker` |
| Production branch | `main` after this pull request is merged |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | Leave blank |
| Environment variables | None required |

## Connect the repository

1. Open the Cloudflare dashboard.
2. Go to **Workers & Pages**.
3. Select **Create application**.
4. Select **Pages**, then **Import an existing Git repository**.
5. Authorize the Cloudflare Workers & Pages GitHub app.
6. Limit repository access to `Valithron/poker-crm` unless broader access is intentional.
7. Select `Valithron/poker-crm`.
8. Enter the build settings above and deploy.

Cloudflare will assign a `*.pages.dev` address. Git-connected Pages projects also create branch and pull-request preview deployments.

## Safe branch-first setup

This migration is intentionally delivered through a draft pull request.

To verify the branch before merging:

1. Create the Pages project with `agent/cloudflare-pages-foundation` as the temporary production branch.
2. Use the build settings above.
3. Review the generated Pages URL.
4. After the pull request is merged, open the Pages project.
5. Go to **Settings > Builds > Branch control**.
6. Change the production branch to `main`.

Alternatively, merge the pull request first and create the Pages project directly from `main`.

## Cutover checklist

- Confirm the Pages deployment succeeds.
- Confirm `/`, `/styles.css`, and `/app.js` load from the Pages URL.
- Confirm the response headers include the policies in `public/_headers`.
- Attach a custom domain only after the Pages URL is verified.
- Remove or disable the old hosting project after DNS and custom-domain verification.

## Repository deployment model

Cloudflare Git integration owns deployment. No GitHub deployment workflow or provider token is required in this repository. GitHub Actions only validates the source and build output.
