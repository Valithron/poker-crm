# BroTime Poker email template

The reusable renderer lives in [`shared/rsvp.ts`](../shared/rsvp.ts), in `buildPersonalizedInviteEmail`, `buildPersonalizedReminderEmail`, and `buildPersonalizedUpdateEmail`. It emits a table-based, inline-styled HTML email capped at 600px plus a readable plain-text fallback.

Email sends pass the absolute public URL for `public/apple-touch-icon.png`. The existing 180px PNG is displayed at 84px for retina-friendly email rendering. The SVG remains the web/PWA asset but is intentionally not required by the email because SVG support is inconsistent in Outlook and some webmail clients.

The RSVP, calendar, and directions links remain ordinary absolute URLs. Resend can rewrite them for click tracking on the configured tracking domain; the application does not hardcode or proxy the tracking host.

The template accepts an optional `unsubscribeUrl`. When present, it renders a visible unsubscribe link and sends `List-Unsubscribe` and `List-Unsubscribe-Post` headers through Resend. The current product has no unsubscribe endpoint yet, so current sends use the organizer-contact fallback. Add the future endpoint URL to the input when that backend is implemented.

Standalone preview: [`brotm-invite-email-preview.html`](./brotm-invite-email-preview.html).
