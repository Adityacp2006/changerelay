import { buildSampleWorld, SimConnector, type Scenario } from '@/lib/core/sample';
import { buildPlan, approve, setAck } from '@/lib/core/plan';
import { detectConflicts } from '@/lib/core/conflicts';
import { resolveNewTimes } from '@/lib/core/time';
import { createRun } from '@/lib/core/executor';
import { MemoryRunStore } from '@/lib/core/store';

export const NOW = '2026-10-29T06:00:00.000Z';

export function setup(scenario: Scenario = 'happy', opts: { newStart?: string; ack?: boolean; recipients?: 'all' | 'none' } = {}) {
  const world = buildSampleWorld(NOW);
  const t = resolveNewTimes({ zone: world.event.timezone, oldStart: world.event.calendarStart, oldEnd: world.event.calendarEnd, newStartTime: opts.newStart ?? '16:00' });
  let plan = buildPlan({ event: world.event, newStart: t.newStart, newEnd: t.newEnd, recipients: opts.recipients === 'none' ? [] : world.people });
  const conflicts = detectConflicts({ event: world.event, newStart: t.newStart, newEnd: t.newEnd, people: world.people, assignments: world.assignments, organiserBusy: [], now: NOW });
  if (opts.ack !== false) for (const c of conflicts.filter(c => c.severity === 'warning')) plan = setAck(plan, c.id, true);
  const sim = new SimConnector(SimConnector.fresh(world, scenario));
  const store = new MemoryRunStore();
  const approval = approve(plan, 'user-1', NOW);
  return { world, plan, conflicts, sim, store, approval, t, start: () => createRun(store, { plan, approval, conflicts, now: NOW }) };
}
