# ChangeRelay

**Change the plan once. See the impact. Keep connected work aligned.**
Reschedule a one-off workshop and keep Google Calendar, Google Sheets and Gmail consistent, with a preview before anything changes, read-back verification after, and targeted recovery when a step fails. Connections run through [viaSocket](https://viasocket.com/developers/docs).

> **Status:** v0.1. The internal logic, sample workspace, build and tests are verified. **Live viaSocket/Google/Supabase behaviour has not been exercised yet**: see [docs/LIMITATIONS.md](docs/LIMITATIONS.md) and follow "Go live" below.

## Try it now (no accounts)
```bash
npm install
npm run dev        # http://localhost:3000
```
The homepage's **Try interactive demo** button opens `/sample`, a clearly labelled **Sample workspace** that runs in your browser against a simulator. It cannot contact any real service. It includes a volunteer conflict and a switchable controlled failure (busy Sheet, rejected email, timed-out email) to demonstrate recovery.

## Architecture (small on purpose)
| Piece | Where | Notes |
|---|---|---|
| Domain logic (pure TS) | `src/lib/core` | time/timezone, conflicts, plan + approval hash, executor, recovery, NL schema. No framework, no network. |
| Ports | `connector.ts`, `store.ts` | The executor only talks to a `Connector` and a `RunStore`. |
| Live adapters | `src/lib/viasocket`, `src/lib/server/pg-store.ts` | viaSocket SDK; Postgres run store with lease. |
| Simulator | `src/lib/core/sample.ts` | Sample mode only. |
| API | `src/app/api/*` | Every route: verified session → ownership check → rate limit → zod validation. |
| UI | `src/app`, `src/components` | Same `Workbench` for sample and live via an `Engine` interface. |

**Durable execution, one approach:** a run and its steps are rows in Postgres. Any caller (the open page polling `/api/runs/:id/advance`, a second tab, or the cron worker) takes a **database lease**, executes ready steps, persists `running` *before* each external call, and releases. Unique constraints give double-click safety (`unique(event_id, plan_hash)`) and one in-flight run per event (partial unique index). No unawaited background promises.

**Safety rules encoded and tested:** approval is bound to a hash of the exact plan; sources are re-read before any write (drift → `blocked_stale`, nothing written); Calendar/Sheet are read back before "Verified"; emails go only after both schedule steps verify, one email per recipient; a timed-out send is **Needs checking**, never auto-resent; verified steps are never rerun; recipients are re-validated server-side against the freshly-read roster.

## Go live

### 1. Supabase
1. Create a project. Run `supabase/migrations/0001_init.sql` in the SQL editor (or `supabase db push`).
2. Auth → URL configuration: Site URL = your URL; add `https://<your-domain>/auth/callback` (and `http://localhost:3000/auth/callback`) to Redirect URLs.
3. For production email, configure custom SMTP (Auth → SMTP). The default mailer is for testing and is rate-limited.
4. Copy URL, anon key and service-role key into your host's environment (see `.env.example`). The service-role key is server-only.

### 2. viaSocket
1. https://flow.viasocket.com/integrations → your project → Configuration → **Create new embed**. Copy org id, project id and signing secret into `VIASOCKET_ORG_ID`, `VIASOCKET_PROJECT_ID`, `VIASOCKET_EMBED_SECRET` (server only).
2. **Configure viaSocket actions.** Run:
   ```bash
   VIASOCKET_ORG_ID=... VIASOCKET_PROJECT_ID=... VIASOCKET_EMBED_SECRET=... npm run discover:actions
   ```
   It prints the real actions and input fields for `google-calendar`, `google-sheets`, `gmail` from your catalog (if a slug differs, fix it in `config/viasocket-actions.json → services`). For each operation in that file, set `event` (an `action_id` or page path), the `input` template (use `{{placeholders}}` listed below) and the `output` JSON paths. Operations left empty show as "needs setup" and never run.

   | Operation | Placeholders available |
   |---|---|
   | calendar.getEvent / updateEvent | `calendarId` `calendarEventId` `startIso` `endIso` `timezone` `notifyGuests` |
   | calendar.listEvents | `calendarId` `timeMin` `timeMax` |
   | sheets.findEventRow | `spreadsheetId` `sheetName` `eventId` (output `start`, `end`) |
   | sheets.updateEventRow | `spreadsheetId` `sheetName` `eventId` `startValue` `endValue` |
   | sheets.listRows | `spreadsheetId` `sheetName` (override per call: roster/assignments tabs) |
   | gmail.sendEmail | `to` `subject` `body` `idempotencyKey` (output `messageRef`) |
   | gmail.findSent *(optional)* | `to` `subject` |

   Also fill `options` (dropdown sources): which action/`fieldKey` lists calendars, events, spreadsheets and tabs, plus `parentKey` for dependent lists (e.g. `calendar_id`). Look in `docs` of each app: https://flow.viasocket.com/documentation/<slug>.md
3. For `notifyGuests`, check what your Calendar update action does with guest notifications; the preview's "Who hears about this" box relies on that.

### 3. Your Sheet
Create three tabs from `public/templates/` (`events.csv`, `participants.csv`, `assignments.csv`). Rows are found by the stable `event_id` column, never by row number. Times: ISO-8601 with offset, or `YYYY-MM-DD HH:mm` (read in the event's timezone).

### 4. Deploy (Vercel)
Import the repo, set every variable from `.env.example`, deploy. `vercel.json` schedules `/api/cron/advance` (set `CRON_SECRET`; Vercel sends it as a bearer token). Vercel Hobby only allows daily crons; change the schedule or use Pro: the page itself also drives runs. Then work through [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md).

### 5. Optional AI
Set `LLM_API_KEY` (and `LLM_MODEL`) to let the sentence box use a model. Output must pass a strict zod schema; the model never picks records, recipients or times. Without a key, a built-in parser handles common phrasings, and the form always works.

## Scripts
`npm run dev` · `npm test` (51 unit/integration tests) · `npm run typecheck` · `npm run lint` · `npm run build` · `npm run test:e2e` (Playwright; run `npx playwright install` first) · `npm run discover:actions`

## Privacy and security notes
Private rows carry `owner_id` with RLS (read) and server-side ownership checks (write); foreign ids return 404. viaSocket `script_id` values (password-equivalent) live in `connection_secrets` (RLS on, no policies). Logs record error names only. Emails are individual (no roster in headers). Account deletion revokes grants and cascades all data. Details in Settings → Privacy.

## Docs
[Demo script](docs/DEMO_SCRIPT.md) · [Launch checklist](docs/LAUNCH_CHECKLIST.md) · [Limitations](docs/LIMITATIONS.md)
