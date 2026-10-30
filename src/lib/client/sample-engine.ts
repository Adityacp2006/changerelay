'use client';
import { advanceRun, createRun, recoverStep, type RecoveryAction } from '@/lib/core/executor';
import { detectConflicts } from '@/lib/core/conflicts';
import { approve } from '@/lib/core/plan';
import { LocalStorageRunStore } from '@/lib/core/store';
import { buildSampleWorld, SimConnector, type Scenario, type SimState } from '@/lib/core/sample';
import { parseRequestHeuristic, resolveInterpretation } from '@/lib/core/interpret';
import type { Engine, WorkspaceData } from './engine';
import type { Plan, Run } from '@/lib/core/types';

const SIM_KEY = 'changerelay.sample.sim.v1', RUN_KEY = 'changerelay.sample.runs.v1', WORLD_KEY = 'changerelay.sample.world.v1';
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Runs entirely in the browser against a simulator. It has no code path to fetch(), Calendar, Sheets or Gmail. */
export class SampleEngine implements Engine {
  mode = 'sample' as const;
  private store: LocalStorageRunStore;
  private sim: SimConnector;
  private world: ReturnType<typeof buildSampleWorld>;
  private scenarioNow: Scenario;

  constructor(private opts: { latencyMs?: number } = {}) {
    let nowIso: string; let saved: SimState | null = null;
    try { nowIso = localStorage.getItem(WORLD_KEY) ?? ''; saved = JSON.parse(localStorage.getItem(SIM_KEY) ?? 'null'); } catch { nowIso = ''; }
    if (!nowIso) { nowIso = new Date().toISOString(); try { localStorage.setItem(WORLD_KEY, nowIso); } catch { /* private mode */ } }
    this.world = buildSampleWorld(nowIso);
    this.scenarioNow = saved?.scenario ?? 'partial_failure';
    this.sim = new SimConnector(saved ?? SimConnector.fresh(this.world, this.scenarioNow), s => { try { localStorage.setItem(SIM_KEY, JSON.stringify(s)); } catch { /* ignore */ } }, opts.latencyMs ?? 450);
    this.store = new LocalStorageRunStore(RUN_KEY);
  }

  data(): WorkspaceData {
    const e = { ...this.world.event, calendarStart: this.sim.state.calendar.start, calendarEnd: this.sim.state.calendar.end, sheetStart: this.sim.state.sheet.start, sheetEnd: this.sim.state.sheet.end };
    return { mode: 'sample', event: e, people: this.world.people, assignments: this.world.assignments, busy: this.world.busy, calendarGuestUpdates: 'none', organiserName: 'The AI Club (sample)' };
  }
  async refresh() { return this.data(); }

  async approve(plan: Plan, _meta: { source: 'form' | 'text'; text?: string }): Promise<Run> {
    const d = this.data(); const now = new Date().toISOString();
    const conflicts = detectConflicts({ event: d.event, newStart: plan.proposed.newStart, newEnd: plan.proposed.newEnd, people: d.people, assignments: d.assignments, organiserBusy: d.busy, now });
    const { run } = await createRun(this.store, { plan, approval: approve(plan, 'sample-organiser', now), conflicts, now });
    return run;
  }
  async advance(runId: string) { await delay(this.opts.latencyMs === 0 ? 0 : 150); return advanceRun(this.store, this.sim, runId, { maxSteps: 1 }); }   // one step per call so progress is visible
  async recover(runId: string, k: string, a: RecoveryAction) { return recoverStep(this.store, this.sim, runId, k, a); }
  getRun(id: string) { return this.store.get(id); }
  async latestRun() { const all = await this.store.listByEvent(this.world.event.id); return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null; }
  async interpret(text: string) {
    const req = parseRequestHeuristic(text);
    if (!req) return { status: 'fallback' as const, message: "I couldn't turn that into a change. Use the form instead." };
    return resolveInterpretation(req, [this.data().event], new Date().toISOString());
  }
  demo = {
    simulateCalendarEdit: () => this.sim.externalCalendarEdit(new Date(Date.parse(this.sim.state.calendar.start) - 3600_000).toISOString(), new Date(Date.parse(this.sim.state.calendar.end) - 3600_000).toISOString()),
    setScenario: (s: Scenario) => { this.sim.state.scenario = s; this.scenarioNow = s; try { localStorage.setItem(SIM_KEY, JSON.stringify(this.sim.state)); } catch { /* ignore */ } },
    scenario: () => this.sim.state.scenario,
    reset: () => { this.store.clear(); try { localStorage.removeItem(SIM_KEY); localStorage.removeItem(WORLD_KEY); } catch { /* ignore */ } location.reload(); },
  };
}
