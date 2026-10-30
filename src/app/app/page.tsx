'use client';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppNav';
import { Banner, Empty, RunPill, Spinner } from '@/components/ui';
import { api } from '@/lib/client/api';
import type { RunStatus } from '@/lib/core/types';

interface Data { events: { id: string; title: string; event_code: string; timezone: string; setup_state: string }[]; runs: { id: string; event_id: string; status: RunStatus; created_at: string }[]; connections: Record<string, string> }
const APPS = [['calendar', 'Calendar'], ['sheets', 'Sheets'], ['gmail', 'Gmail']] as const;

export default function Dashboard() {
  const [d, setD] = useState<Data | null>(null); const [err, setErr] = useState<string | null>(null); const [q, setQ] = useState('');
  useEffect(() => { api<Data>('/api/events').then(setD).catch(e => setErr(e.message)); }, []);
  const shown = useMemo(() => d?.events.filter(e => e.title.toLowerCase().includes(q.toLowerCase())) ?? [], [d, q]);
  const attention = d?.runs.filter(r => r.status === 'needs_attention' || r.status === 'blocked_stale') ?? [];
  const firstReady = d?.events.find(e => e.setup_state === 'ready');
  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-extrabold">Your events</h1>
        <a className="btn-primary" href={firstReady ? `/app/events/${firstReady.id}` : '/app/onboarding'}>Plan a change</a></div>
      {err && <div className="mt-4"><Banner tone="bad" title="Couldn't load your events">{err}</Banner></div>}
      {!d && !err && <Spinner label="Loading your events" />}
      {d && <div className="mt-6 space-y-6">
        <section aria-labelledby="rd" className="card p-4"><h2 id="rd" className="text-lg font-bold">Connections</h2>
          <ul className="mt-2 flex flex-wrap gap-2">{APPS.map(([k, n]) => <li key={k} className={`rounded-full px-3 py-1 text-sm font-semibold ${d.connections[k] === 'active' ? 'bg-teal-100 text-teal-800' : 'bg-amber-100 text-warn'}`}>{n}: {d.connections[k] === 'active' ? 'connected' : 'not connected'}</li>)}</ul>
          {Object.keys(d.connections).length < 3 && <p className="hint mt-2">Connect all three in <a className="font-semibold underline" href="/app/onboarding">setup</a> to run a real change.</p>}</section>
        {attention.length > 0 && <Banner tone="warn" title="This update needs your attention">{attention.map(r => <p key={r.id}><a className="font-semibold underline" href={`/app/runs/${r.id}`}>{d.events.find(e => e.id === r.event_id)?.title ?? 'An event'}</a> <RunPill status={r.status} /></p>)}</Banner>}
        <section aria-labelledby="ev"><div className="flex flex-wrap items-center justify-between gap-2"><h2 id="ev" className="text-xl font-bold">Events</h2>
          <div><label className="sr-only" htmlFor="q">Search events</label><input id="q" className="input !w-64 max-w-full" placeholder="Search events" value={q} onChange={e => setQ(e.target.value)} /></div></div>
          {d.events.length === 0 ? <div className="mt-3"><Empty title="Choose your workshop" action={<a className="btn-primary" href="/app/onboarding">Link your first event</a>}>Connect your calendar and sheet, then pick the event you want ChangeRelay to keep aligned.</Empty></div>
            : shown.length === 0 ? <p className="mt-3 text-mute">No events match "{q}".</p>
            : <ul className="mt-3 grid gap-3 sm:grid-cols-2">{shown.map(e => <li key={e.id} className="card p-4"><p className="font-display text-lg font-bold">{e.title}</p><p className="hint">{e.timezone} · ID {e.event_code}</p>
              <div className="mt-3 flex gap-2">{e.setup_state === 'ready' ? <a className="btn-primary !min-h-[40px] !py-1.5" href={`/app/events/${e.id}`}>Open</a> : <a className="btn-quiet !min-h-[40px] !py-1.5" href={`/app/onboarding?event=${e.id}`}>Finish setup</a>}</div></li>)}</ul>}
        </section>
        <section aria-labelledby="rc"><h2 id="rc" className="text-xl font-bold">Recent changes</h2>
          {d.runs.length === 0 ? <p className="mt-2 text-mute">No changes yet. When you approve one, you'll see every step here.</p> : <ul className="mt-2 space-y-2">{d.runs.slice(0, 8).map(r => <li key={r.id} className="card flex flex-wrap items-center justify-between gap-2 p-3"><span>{d.events.find(e => e.id === r.event_id)?.title ?? 'Event'} <span className="text-mute">· {new Date(r.created_at).toLocaleString()}</span></span><span className="flex items-center gap-3"><RunPill status={r.status} /><a className="font-semibold text-teal-700 underline" href={`/app/runs/${r.id}`}>Details</a></span></li>)}</ul>}</section>
      </div>}
    </AppShell>);
}
