import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Run, RunStep } from '@/lib/core/types';
import type { RunStore } from '@/lib/core/store';

/** Postgres-backed RunStore. Every query is filtered by owner_id as a second line of defence behind route-level checks. */
export class PgRunStore implements RunStore {
  constructor(private db: SupabaseClient, private ownerId: string | null) {}   // ownerId null = cron worker (service-level, run-id scoped)
  private q<T extends { eq: (c: string, v: string) => T }>(b: T): T { return this.ownerId ? b.eq('owner_id', this.ownerId) : b; }

  private toRun(r: Record<string, any>, steps: Record<string, any>[]): Run {
    return {
      id: r.id, eventId: r.event_id, planHash: r.plan_hash, plan: r.plan, approval: r.approval, status: r.status, staleReason: r.stale_reason ?? undefined,
      leaseOwner: r.lease_owner, leaseUntil: r.lease_until, createdAt: r.created_at, updatedAt: r.updated_at,
      steps: steps.map<RunStep>(s => ({ id: s.id, key: s.key, kind: s.kind, label: s.label, status: s.status, attempts: s.attempts, error: s.error ?? undefined, plainError: s.plain_error ?? undefined,
        verification: s.verification ?? undefined, messageRef: s.message_ref ?? undefined, recipient: s.recipient ?? undefined, acknowledgedAt: s.acknowledged_at ?? undefined, updatedAt: s.updated_at })),
    };
  }
  private async load(row: Record<string, any>): Promise<Run> {
    const { data } = await this.db.from('execution_steps').select('*').eq('run_id', row.id).order('updated_at', { ascending: true }).order('key');
    // keep plan order, not update order
    const order = new Map<string, number>((row.plan?.steps ?? []).map((s: { key: string }, i: number) => [s.key, i] as [string, number]));
    const steps = [...(data ?? [])].sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
    return this.toRun(row, steps);
  }

  async get(id: string) {
    const { data } = await this.q(this.db.from('execution_runs').select('*').eq('id', id)).maybeSingle();
    return data ? this.load(data) : null;
  }
  async listByEvent(eventId: string) {
    const { data } = await this.q(this.db.from('execution_runs').select('*').eq('event_id', eventId)).order('created_at', { ascending: false });
    return Promise.all((data ?? []).map(r => this.load(r)));
  }

  async insertUnique(run: Run) {
    const owner = this.ownerId!;
    const { error } = await this.db.from('execution_runs').insert({ id: run.id, owner_id: owner, event_id: run.eventId, plan_hash: run.planHash, plan: run.plan, approval: run.approval, status: run.status });
    if (error) {
      if (error.code === '23505') {      // unique violation: either the same plan (double click) or another active run
        const same = await this.db.from('execution_runs').select('*').eq('event_id', run.eventId).eq('plan_hash', run.planHash).eq('owner_id', owner).maybeSingle();
        if (same.data) return { kind: 'duplicate' as const, run: await this.load(same.data) };
        const act = await this.db.from('execution_runs').select('*').eq('event_id', run.eventId).eq('owner_id', owner).in('status', ['queued', 'running']).maybeSingle();
        if (act.data) return { kind: 'active' as const, run: await this.load(act.data) };
      }
      throw new Error(`Could not create the run: ${error.message}`);
    }
    const { error: e2 } = await this.db.from('execution_steps').insert(run.steps.map(s => this.stepRow(run, s)));
    if (e2) throw new Error(`Could not create run steps: ${e2.message}`);
    return { kind: 'created' as const, run };
  }

  private stepRow(run: Run, s: RunStep) {
    return { id: s.id, run_id: run.id, owner_id: this.ownerId ?? (run as any)._owner, key: s.key, kind: s.kind, label: s.label, status: s.status, attempts: s.attempts, error: s.error ?? null,
      plain_error: s.plainError ?? null, verification: s.verification ?? null, message_ref: s.messageRef ?? null, recipient: s.recipient ?? null, acknowledged_at: s.acknowledgedAt ?? null, updated_at: s.updatedAt };
  }

  async put(run: Run) {
    const owner = this.ownerId ?? await this.ownerOf(run.id);
    const { error } = await this.db.from('execution_runs').update({ status: run.status, stale_reason: run.staleReason ?? null, updated_at: new Date().toISOString() }).eq('id', run.id).eq('owner_id', owner);
    if (error) throw new Error(error.message);
    const rows = run.steps.map(s => ({ ...this.stepRow(run, s), owner_id: owner }));
    const { error: e2 } = await this.db.from('execution_steps').upsert(rows, { onConflict: 'run_id,key' });
    if (e2) throw new Error(e2.message);
    const sent = run.steps.filter(s => s.kind === 'email.send' && s.recipient && ['verified', 'needs_checking', 'failed'].includes(s.status));
    if (sent.length) await this.db.from('notification_outcomes').upsert(sent.map(s => ({ owner_id: owner, run_id: run.id, step_key: s.key, recipient_email: s.recipient!.email,
      outcome: s.status === 'verified' ? 'sent' : s.status, provider_ref: s.messageRef ?? null })), { onConflict: 'run_id,step_key' });
  }
  private async ownerOf(runId: string): Promise<string> {
    const { data } = await this.db.from('execution_runs').select('owner_id').eq('id', runId).single();
    return data!.owner_id;
  }

  async acquire(id: string, owner: string, ttlMs: number) {
    const now = new Date();
    const { data } = await this.q(this.db.from('execution_runs').update({ lease_owner: owner, lease_until: new Date(now.getTime() + ttlMs).toISOString() }).eq('id', id))
      .or(`lease_until.is.null,lease_until.lt.${now.toISOString()},lease_owner.eq.${owner}`).select('*').maybeSingle();
    return data ? this.load(data) : null;
  }
  async release(id: string, owner: string) {
    await this.q(this.db.from('execution_runs').update({ lease_owner: null, lease_until: null }).eq('id', id)).eq('lease_owner', owner);
  }
}
