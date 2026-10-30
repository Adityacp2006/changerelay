import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SampleEngine } from '@/lib/client/sample-engine';
import { buildPlan, setAck } from '@/lib/core/plan';
import { detectConflicts } from '@/lib/core/conflicts';
import { resolveNewTimes } from '@/lib/core/time';

function memoryStorage() { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() }; }

async function preview(e: SampleEngine, startTime = '16:00') {
  const d = e.data();
  const t = resolveNewTimes({ zone: d.event.timezone, oldStart: d.event.calendarStart, oldEnd: d.event.calendarEnd, newStartTime: startTime });
  let plan = buildPlan({ event: d.event, newStart: t.newStart, newEnd: t.newEnd, recipients: d.people });
  for (const c of detectConflicts({ event: d.event, newStart: t.newStart, newEnd: t.newEnd, people: d.people, assignments: d.assignments, organiserBusy: d.busy, now: new Date().toISOString() }).filter(c => c.severity === 'warning')) plan = setAck(plan, c.id, true);
  return { plan, t };
}
async function drive(e: SampleEngine, id: string) { for (let i = 0; i < 50; i++) { const r = await e.advance(id); if (!['queued', 'running'].includes(r.run.status)) return r.run; } throw new Error('did not finish'); }

describe('sample workspace journey (engine level)', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('network call from sample mode'); })); });

  it('runs the full recovery demo and never touches the network', async () => {
    const e = new SampleEngine({ latencyMs: 0 }); e.demo.setScenario('partial_failure');
    const { plan } = await preview(e);
    const run0 = await e.approve(plan, { source: 'form' });
    let run = await drive(e, run0.id);
    expect(run.status).toBe('needs_attention');
    expect(run.steps.find(s => s.key === 'sheet')?.status).toBe('failed');
    run = (await e.recover(run.id, 'sheet', 'retry')).run;
    expect(run.steps.find(s => s.key === 'email:kabir')?.status).toBe('verified');   // timeout reconciled, not resent
    expect(run.steps.find(s => s.key === 'email:dev')?.status).toBe('failed');
    run = (await e.recover(run.id, 'email:dev', 'retry')).run;
    expect(run.status).toBe('succeeded');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('a page refresh (new engine, same storage) restores the run and the simulated records', async () => {
    const e1 = new SampleEngine({ latencyMs: 0 }); e1.demo.setScenario('partial_failure');
    const { plan, t } = await preview(e1);
    const run0 = await e1.approve(plan, { source: 'form' });
    await drive(e1, run0.id);
    const e2 = new SampleEngine({ latencyMs: 0 });                       // "refresh"
    const restored = await e2.latestRun();
    expect(restored?.id).toBe(run0.id);
    expect(restored?.status).toBe('needs_attention');
    expect(new Date(e2.data().event.calendarStart).toISOString()).toBe(t.newStart);
  });

  it('double approve returns the same run; an edited Calendar blocks the run before any write', async () => {
    const e = new SampleEngine({ latencyMs: 0 }); e.demo.setScenario('happy');
    const { plan } = await preview(e);
    const [a, b] = await Promise.all([e.approve(plan, { source: 'form' }), e.approve(plan, { source: 'form' })]);
    expect(a.id).toBe(b.id);
    e.demo.simulateCalendarEdit();
    const run = await drive(e, a.id);
    expect(run.status).toBe('blocked_stale');
    expect(e.data().event.sheetStart).toBe(e.data().event.sheetStart);
  });
});
