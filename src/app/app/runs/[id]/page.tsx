'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/AppNav';
import { Banner, Spinner } from '@/components/ui';
import { RunPanel } from '@/components/RunPanel';
import { LiveEngine } from '@/lib/client/engine';
import type { Run } from '@/lib/core/types';
import type { RecoveryAction } from '@/lib/core/executor';

/** Recovery view. The status comes from the database, so it survives closing the page. Opening it also resumes interrupted runs. */
export default function RunPage({ params }: { params: { id: string } }) {
  const [run, setRun] = useState<Run | null>(null); const [err, setErr] = useState<string | null>(null); const [working, setWorking] = useState(false);
  const engine = useMemo(() => new LiveEngine(run?.eventId ?? ''), [run?.eventId]);
  const driving = useRef(false);
  const drive = useCallback(async (e: LiveEngine, id: string) => {
    if (driving.current) return; driving.current = true; setWorking(true);
    try { for (let i = 0; i < 300; i++) { const r = await e.advance(id); setRun(r.run); if (!['queued', 'running'].includes(r.run.status)) break; await new Promise(res => setTimeout(res, r.busy ? 1500 : 150)); } }
    catch (x) { setErr((x as Error).message); } finally { driving.current = false; setWorking(false); }
  }, []);
  useEffect(() => { const e0 = new LiveEngine(''); e0.getRun(params.id).then(r => { setRun(r); if (r && ['queued', 'running'].includes(r.status)) drive(new LiveEngine(r.eventId), r.id); }).catch(x => setErr(x.message)); }, [params.id, drive]);
  const recover = async (k: string, a: RecoveryAction) => { if (!run) return; setWorking(true); try { const r = await engine.recover(run.id, k, a); setRun(r.run); if (['queued', 'running'].includes(r.run.status)) { setWorking(false); drive(engine, run.id); return; } } catch (x) { setErr((x as Error).message); } finally { setWorking(false); } };
  return (
    <AppShell><a className="text-[15px] text-teal-700 underline" href="/app">← All events</a><h1 className="mt-2 text-3xl font-extrabold">Activity</h1>
      {err && <div className="mt-3"><Banner tone="bad" title="That didn't work">{err}</Banner></div>}
      {!run && !err && <Spinner label="Loading this change" />}
      {run && <div className="mt-4 space-y-4"><RunPanel run={run} onRecover={recover} working={working} timezone={run.plan.timezone} />
        <p><a className="font-semibold text-teal-700 underline" href={`/app/events/${run.eventId}`}>Back to the event</a></p></div>}
    </AppShell>);
}
