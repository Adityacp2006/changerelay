'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/AppNav';
import { Banner, Spinner } from '@/components/ui';
import { ConnectButtons } from '@/components/ConnectButtons';
import { Picker } from '@/components/Picker';
import { api } from '@/lib/client/api';

type Pick = { id: string; second: string; label: string };
const empty: Pick = { id: '', second: '', label: '' };
const STEPS = ['Connect', 'Event', 'Calendar', 'Schedule', 'Roster', 'Confirm'];

function Wizard() {
  const router = useRouter(); const sp = useSearchParams();
  const [eventId, setEventId] = useState(sp.get('event') ?? '');
  const [step, setStep] = useState(0);
  const [conns, setConns] = useState<Record<string, string>>({}); const [setup, setSetup] = useState<{ server: Record<string, boolean>; actionGaps: { operation: string; optional: boolean }[] } | null>(null);
  const [basics, setBasics] = useState({ title: '', eventCode: '', timezone: 'Asia/Kolkata', location: '' });
  const [cal, setCal] = useState<Pick>(empty), [sched, setSched] = useState<Pick>(empty), [roster, setRoster] = useState<Pick>(empty), [asg, setAsg] = useState<Pick>(empty);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  const load = () => api<{ connections: Record<string, string>; server: Record<string, boolean>; actionGaps: { operation: string; optional: boolean }[] }>('/api/setup').then(s => { setConns(s.connections); setSetup(s); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  useEffect(() => { // resume / correct an existing event
    if (!eventId) return;
    api<{ event: { title: string; event_code: string; timezone: string; location: string | null }; links: { kind: string; external_id: string; secondary_id: string; label: string }[] }>(`/api/events/${eventId}/links`).then(({ event, links }) => {
      setBasics({ title: event.title, eventCode: event.event_code, timezone: event.timezone, location: event.location ?? '' });
      const f = (k: string): Pick => { const l = links.find(x => x.kind === k); return l ? { id: l.external_id, second: l.secondary_id, label: l.label ?? '' } : empty; };
      setCal(f('calendar_event')); setSched(f('schedule_sheet')); setRoster(f('roster_sheet')); setAsg(f('assignments_sheet'));
      if (step === 0) setStep(links.length ? 5 : 2);
    }).catch(() => undefined);
  }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  const allConnected = ['calendar', 'sheets', 'gmail'].every(k => conns[k] === 'active');
  const createEvent = async () => {
    setBusy(true); setErr(null);
    try { if (!eventId) { const r = await api<{ id: string }>('/api/events', { method: 'POST', body: JSON.stringify({ ...basics, location: basics.location || undefined }) }); setEventId(r.id); history.replaceState(null, '', `/app/onboarding?event=${r.id}`); } setStep(2); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const finish = async () => {
    setBusy(true); setErr(null);
    try {
      await api(`/api/events/${eventId}/links`, { method: 'PUT', body: JSON.stringify({ timezone: basics.timezone, calendar: cal, schedule: sched, roster: roster, ...(asg.id ? { assignments: asg } : {}) }) });
      router.push(`/app/events/${eventId}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const next = (ok: boolean, to: number) => <div className="mt-5 flex gap-2"><button className="btn-quiet" onClick={() => setStep(step - 1)} disabled={step === 0}>Back</button><button className="btn-primary" disabled={!ok} onClick={() => setStep(to)}>Continue</button><a className="btn-quiet ml-auto" href="/app">Save and finish later</a></div>;
  const gaps = setup?.actionGaps.filter(g => !g.optional) ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-extrabold">Set up an event</h1>
      <ol className="mt-3 flex flex-wrap gap-2" aria-label="Progress">{STEPS.map((s, i) => <li key={s} aria-current={i === step ? 'step' : undefined} className={`rounded-full px-3 py-1 text-sm font-semibold ${i === step ? 'bg-ink text-white' : i < step ? 'bg-teal-100 text-teal-800' : 'bg-stone-100 text-mute'}`}>{i + 1}. {s}</li>)}</ol>
      {err && <div className="mt-4"><Banner tone="bad" title="That didn't work">{err}</Banner></div>}
      {!setup ? <Spinner /> : <div className="card mt-4 p-5">
        {gaps.length > 0 && <div className="mb-4"><Banner tone="warn" title="The server owner still has setup to do">{gaps.length} viaSocket action{gaps.length > 1 ? 's' : ''} {gaps.length > 1 ? 'aren\'t' : 'isn\'t'} configured yet ({gaps.map(g => g.operation).join(', ')}). You can connect apps and save progress, but real changes won't run until this is done. See the README, "Configure viaSocket actions".</Banner></div>}
        {step === 0 && <><h2 className="text-xl font-bold">Connect your calendar</h2><p className="hint mb-3">Each connection opens a Google consent window run by viaSocket. We read and change only what's described in Settings → Privacy.</p>
          <ConnectButtons connected={conns} onChange={load} />{next(allConnected, 1)}{!allConnected && <p className="hint mt-2">Connect all three to continue.</p>}</>}
        {step === 1 && <><h2 className="text-xl font-bold">Name your workshop</h2>
          <div className="mt-3 space-y-3"><div><label className="label" htmlFor="t">Event name</label><input id="t" className="input" value={basics.title} onChange={e => setBasics({ ...basics, title: e.target.value })} /></div>
            <div><label className="label" htmlFor="c">Event ID</label><p className="hint mb-1">The same ID you put in the Sheet's event_id column. ChangeRelay finds rows by this, never by row number.</p><input id="c" className="input" value={basics.eventCode} disabled={!!eventId} onChange={e => setBasics({ ...basics, eventCode: e.target.value })} placeholder="ai-workshop-2026-10" /></div>
            <div><label className="label" htmlFor="z">Timezone</label><input id="z" className="input" value={basics.timezone} onChange={e => setBasics({ ...basics, timezone: e.target.value })} /><p className="hint mt-1">All times are read and shown in this zone.</p></div>
            <div><label className="label" htmlFor="l">Location <span className="font-normal text-mute">(optional)</span></label><input id="l" className="input" value={basics.location} onChange={e => setBasics({ ...basics, location: e.target.value })} /></div></div>
          <div className="mt-5 flex gap-2"><button className="btn-quiet" onClick={() => setStep(0)}>Back</button><button className="btn-primary" disabled={busy || basics.title.trim().length < 2 || !/^[A-Za-z0-9_-]{2,64}$/.test(basics.eventCode)} onClick={createEvent}>{busy ? 'Saving…' : 'Save and continue'}</button></div></>}
        {step === 2 && <><h2 className="text-xl font-bold">Choose your workshop</h2><div className="mt-3 space-y-3">
          <Picker id="cal" label="Calendar" kind="calendars" value={cal.id} onChange={(v, l) => setCal({ id: v, second: '', label: l })} />
          <Picker id="cev" label="Calendar event" kind="calendarEvents" parent={cal.id} value={cal.second} onChange={(v, l) => setCal({ ...cal, second: v, label: l })} /></div>{next(!!cal.id && !!cal.second, 3)}</>}
        {step === 3 && <><h2 className="text-xl font-bold">Link the schedule row</h2><div className="mt-3 space-y-3">
          <Picker id="sp" label="Spreadsheet" kind="spreadsheets" value={sched.id} onChange={(v, l) => { setSched({ id: v, second: '', label: l }); setRoster(r => r.id && r.id !== v ? r : { ...r, id: v, label: l }); }} />
          <Picker id="st" label="Tab with your events" kind="sheetTabs" parent={sched.id} value={sched.second} onChange={v => setSched({ ...sched, second: v })} hint="The tab with columns event_id, title, start, end, timezone, location." /></div>{next(!!sched.id && !!sched.second, 4)}</>}
        {step === 4 && <><h2 className="text-xl font-bold">Choose your participants</h2><div className="mt-3 space-y-3">
          <Picker id="rt" label="Tab with participants" kind="sheetTabs" parent={roster.id || sched.id} value={roster.second} onChange={v => setRoster({ ...roster, id: roster.id || sched.id, second: v })} hint="Columns: event_id, name, email, role. Roles: participant, volunteer." />
          <Picker id="at" label="Tab with volunteer assignments" kind="sheetTabs" parent={sched.id} optional value={asg.second} onChange={v => setAsg(v ? { id: sched.id, second: v, label: '' } : empty)} hint="Columns: person, event_id, assignment_start, assignment_end. Used to find volunteer conflicts." /></div>{next(!!roster.second, 5)}</>}
        {step === 5 && <><h2 className="text-xl font-bold">Check and confirm</h2>
          <dl className="mt-3 space-y-2 text-[15px]"><div><dt className="font-semibold">Event</dt><dd>{basics.title} (ID {basics.eventCode})</dd></div><div><dt className="font-semibold">Timezone</dt><dd>{basics.timezone}</dd></div>
            <div><dt className="font-semibold">Calendar event</dt><dd>{cal.label || 'Selected'}</dd></div><div><dt className="font-semibold">Schedule</dt><dd>{sched.label || 'Selected spreadsheet'}, tab "{sched.second}"</dd></div>
            <div><dt className="font-semibold">Participants</dt><dd>Tab "{roster.second}"</dd></div><div><dt className="font-semibold">Volunteer assignments</dt><dd>{asg.second ? `Tab "${asg.second}"` : 'Not linked. Volunteer conflicts will show as not checked.'}</dd></div></dl>
          <p className="hint mt-3">You're confirming that these are the right records. ChangeRelay only changes what's listed here.</p>
          <div className="mt-5 flex gap-2"><button className="btn-quiet" onClick={() => setStep(4)}>Back</button><button className="btn-primary" disabled={busy || !cal.id || !sched.id || !roster.second} onClick={finish}>{busy ? 'Saving…' : 'Confirm links'}</button></div></>}
      </div>}
    </div>);
}
export default function Onboarding() { return <AppShell><Suspense fallback={<Spinner />}><Wizard /></Suspense></AppShell>; }
