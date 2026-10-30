'use client';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppNav';
import { Banner, Spinner } from '@/components/ui';
import { EventOverview } from '@/components/EventOverview';
import { Workbench } from '@/components/Workbench';
import { LiveEngine, type WorkspaceData } from '@/lib/client/engine';

export default function EventPage({ params }: { params: { id: string } }) {
  const engine = useMemo(() => new LiveEngine(params.id), [params.id]);
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [err, setErr] = useState<{ message: string; code?: string } | null>(null);
  useEffect(() => { engine.refresh().then(setData).catch(e => setErr({ message: e.message, code: e.code })); }, [engine]);
  return (
    <AppShell>
      <a className="text-[15px] text-teal-700 underline" href="/app">← All events</a>
      {err && <div className="mt-4 space-y-3"><Banner tone={err.code === 'not_ready' ? 'warn' : 'bad'} title={err.code === 'not_ready' ? 'Finish setting up this event' : "Couldn't read this event"}>{err.message}</Banner>
        {err.code === 'not_ready' ? <a className="btn-primary" href={`/app/onboarding?event=${params.id}`}>Continue setup</a> : <p className="hint">If a connection was revoked, reconnect it in <a className="underline" href="/app/settings">Settings</a>.</p>}</div>}
      {!data && !err && <Spinner label="Reading your Calendar and Sheet" />}
      {data && <div className="mt-4 space-y-6"><EventOverview event={data.event} people={data.people} assignments={data.assignments} />
        <p><a className="font-semibold text-teal-700 underline" href={`/app/onboarding?event=${params.id}`}>Correct the links for this event</a></p>
        <Workbench engine={engine} initial={data} /></div>}
    </AppShell>);
}
