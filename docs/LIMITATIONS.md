# Known limitations (v0.1)

**Live Google actions not verified.** Supabase Auth health and the viaSocket action catalog were reachable, but no real Calendar, Sheets or Gmail records were changed. What *is* verified: all domain logic, the executor's failure/recovery behaviour, the adapter's error classification (with mocks), the sample workspace engine, desktop/mobile browser flows, typecheck, lint and a production build.

**viaSocket actions need your configuration.** The documented flow (connect → enable → list-options → run) is implemented with the official SDK. Action IDs and input/output field names for Calendar, Sheets and Gmail are **not guessed**; they live in `config/viasocket-actions.json` until you fill them from `npm run discover:actions`. Response shapes are read through the configured JSON paths; expect to adjust them on first live contact.

**Gmail "find sent" is optional.** Reconciling an uncertain send needs a "list mails" style action. Without it, an uncertain email stays "Needs checking" and the organiser decides; it is never resent automatically. The lookup matches recipient + subject in Sent, which is a heuristic.

**No "Got it" acknowledgement links.** "Sent" is tracked; "Acknowledged" is a reserved, unused column. Nothing claims a message was read.

**No AI redrafting of announcements.** Drafts are deterministic, role-specific templates the organiser edits. AI is used only for request interpretation, with a strict schema and an offline fallback.

**Rate limiting is per server instance** (in-memory). Use a shared store for multi-instance production traffic.

**Cron frequency.** The worker is a safety net for closed tabs; on Vercel Hobby, crons run at most daily. The open page also drives the run by polling, and any later visit to the run resumes it.

**Browser-test setup.** The Playwright suite is in `tests/e2e`; on a new machine, install its browser with `npx playwright install chromium` before running `npm run test:e2e`.

**Single organiser per workspace; one-off events only.** No recurring events, teams, or other industries.

**Calendar availability** is checked only for the connected organiser's calendar and the sheet's volunteer assignments. Participants' availability is always shown as "not checked".

**Plan edits after approval** are not possible; approval immediately starts the run. To change anything, make a new change.
