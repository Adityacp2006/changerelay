# Launch checklist

- [ ] Supabase project created; `supabase/migrations/0001_init.sql` applied; RLS shows enabled on every table (including `connection_secrets`, which has no policy on purpose).
- [ ] Auth: Site URL and Redirect URLs include `https://<your-domain>/auth/callback`. Email provider/SMTP configured for production (the built-in Supabase mailer is rate-limited and for testing only).
- [ ] viaSocket: embed created; `VIASOCKET_*` set in the host's server environment (never `NEXT_PUBLIC_`).
- [ ] `npm run discover:actions` run; `config/viasocket-actions.json` filled in; committed. The Settings → connections and onboarding show no "action not configured" banner.
- [ ] Google connect works for Calendar, Sheets and Gmail with a **test account** you control.
- [ ] Test sheet created from `public/templates/*.csv` (events, participants, assignments tabs).
- [ ] Live end-to-end with the test account: preview → approve → Calendar and Sheet read back → emails arrive individually → refresh mid-run → status still correct.
- [ ] Revoke the connection in Google; confirm the run shows "reconnect" in plain language and nothing else breaks.
- [ ] `CRON_SECRET` set; `vercel.json` schedule matches your Vercel plan (Hobby allows daily crons only; see README).
- [ ] `LLM_API_KEY` set (optional) or confirm the offline parser fallback is acceptable.
- [ ] Fresh browser session on the deployed URL: sign up, connect, set up, preview, approve, recover.
- [ ] Two different users: confirm neither can open the other's event or run URLs (expect 404).
- [ ] Privacy text in Settings reviewed for your jurisdiction; support contact added.
- [ ] Pilot results recorded (real numbers only) before they appear in any slide.
