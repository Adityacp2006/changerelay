'use client';
import { useEffect, useState } from 'react';
import { Shell, Banner, Spinner } from '@/components/ui';
import { EventOverview } from '@/components/EventOverview';
import { Workbench } from '@/components/Workbench';
import { SampleEngine } from '@/lib/client/sample-engine';

export default function SamplePage() {
  const [engine, setEngine] = useState<SampleEngine | null>(null);
  const [scenario, setScenario] = useState<'happy' | 'partial_failure'>('partial_failure');
  const [version, setVersion] = useState(0);
  useEffect(() => { const e = new SampleEngine(); setEngine(e); setScenario(e.demo.scenario()); }, []);

  return (
    <Shell mode="sample" nav={<><a className="rounded-lg px-3 py-2 hover:bg-teal-50" href="/">Home</a><a className="btn-quiet !min-h-[40px] !py-1.5" href="/login">Live sign in</a></>}>
      <Banner tone="info" title="You're in the sample workspace">Everything here is made up and runs in your browser. No real Calendar, Sheet or email is touched, and nothing is saved on a server.</Banner>
      {!engine ? <Spinner label="Opening the sample workspace" /> : (
        <div className="mt-6 space-y-6">
          <EventOverview event={engine.data().event} people={engine.data().people} assignments={engine.data().assignments} links={[{ label: 'Linked Calendar event', value: 'AI Workshop (sample calendar)' }, { label: 'Linked schedule row', value: 'Sample sheet, event ID evt_ai_workshop' }]} />
          <details className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            <summary className="cursor-pointer font-semibold">Demo controls · simulated workspace only</summary>
            <div className="mt-2">
              <p className="hint">Try moving the workshop to 4 pm, reviewing the conflict, then watching targeted recovery.</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 font-medium"><input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={scenario === 'partial_failure'} onChange={e => { const s = e.target.checked ? 'partial_failure' : 'happy'; engine.demo.setScenario(s); setScenario(s); }} />Include controlled failures (busy Sheet, rejected email, timed-out email)</label>
                <button className="btn-quiet !min-h-[40px] !py-1.5" onClick={() => { engine.demo.simulateCalendarEdit(); setVersion(v => v + 1); }}>Simulate an external Calendar edit</button>
                <button className="btn-quiet !min-h-[40px] !py-1.5" onClick={() => engine.demo.reset()}>Reset sample</button>
              </div>
              <p className="hint mt-2">An external edit after preview makes the change stale. Refresh and review it again before approval.</p>
            </div>
          </details>
          <Workbench key={version} engine={engine} initial={engine.data()} />
        </div>)}
    </Shell>
  );
}
