import type { Assignment, BusySlot, EventRecord, Person, Plan, Run } from '@/lib/core/types';
import type { RecoveryAction } from '@/lib/core/executor';
import type { Resolution } from '@/lib/core/interpret';

export interface WorkspaceData {
  mode: 'sample' | 'live';
  event: EventRecord; people: Person[]; assignments: Assignment[];
  busy: BusySlot[] | null; calendarGuestUpdates: 'none' | 'all';
  organiserName?: string;
}

/** Everything the planning UI needs. Sample = in-browser simulator; Live = server API. Same UI, same core logic. */
export interface Engine {
  mode: 'sample' | 'live';
  approve(plan: Plan, meta: { source: 'form' | 'text'; text?: string }): Promise<Run>;
  advance(runId: string): Promise<{ run: Run; busy: boolean }>;
  recover(runId: string, stepKey: string, action: RecoveryAction): Promise<{ run: Run; busy: boolean }>;
  getRun(runId: string): Promise<Run | null>;
  latestRun(): Promise<Run | null>;
  interpret(text: string): Promise<Resolution | { status: 'fallback'; message: string }>;
  /** Re-read sources (used after "source changed" blocks). */
  refresh(): Promise<WorkspaceData>;
  /** Sample-only demo controls. */
  demo?: { simulateCalendarEdit(): void; setScenario(s: 'happy' | 'partial_failure'): void; scenario(): 'happy' | 'partial_failure'; reset(): void };
}

async function j<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(body.error ?? 'Something went wrong.') as Error & { code?: string; status: number }; err.code = body.code; err.status = res.status; throw err; }
  return body as T;
}

export class LiveEngine implements Engine {
  mode = 'live' as const;
  constructor(private eventId: string) {}
  approve(plan: Plan, meta: { source: 'form' | 'text'; text?: string }) {
    return fetch(`/api/events/${this.eventId}/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan, ...meta }) })
      .then(r => j<{ runId: string }>(r)).then(async ({ runId }) => (await this.getRun(runId))!);
  }
  advance(runId: string) { return fetch(`/api/runs/${runId}/advance`, { method: 'POST' }).then(r => j<{ run: Run; busy: boolean }>(r)); }
  recover(runId: string, stepKey: string, action: RecoveryAction) {
    return fetch(`/api/runs/${runId}/recover`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stepKey, action }) }).then(r => j<{ run: Run; busy: boolean }>(r));
  }
  async getRun(runId: string) { return (await fetch(`/api/runs/${runId}`).then(r => j<{ run: Run }>(r))).run; }
  async latestRun() {
    const ctx = await fetch(`/api/events/${this.eventId}/context`).then(r => j<{ runs: { id: string }[] }>(r));
    return ctx.runs[0] ? this.getRun(ctx.runs[0].id) : null;
  }
  interpret(text: string) { return fetch(`/api/events/${this.eventId}/interpret`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }).then(r => j<Resolution>(r)); }
  async refresh(): Promise<WorkspaceData> {
    const c = await fetch(`/api/events/${this.eventId}/context`).then(r => j<WorkspaceData & { ready: boolean; reason?: string }>(r));
    if (!c.ready) throw Object.assign(new Error(c.reason ?? 'This event is not fully linked yet.'), { code: 'not_ready' });
    return { ...c, mode: 'live' };
  }
}
