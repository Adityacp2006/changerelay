import type { Run } from './types';

export class ActiveRunError extends Error {
  constructor(public existingRunId: string) { super('Another change is already running for this event.'); }
}

/** Persistence port. Implemented by Postgres (live) and memory/localStorage (sample + tests). */
export interface RunStore {
  get(id: string): Promise<Run | null>;
  put(run: Run): Promise<void>;
  listByEvent(eventId: string): Promise<Run[]>;
  /**
   * Atomic insert. Must enforce, in one step: (a) one run per (event, plan hash) and (b) one active run per event.
   * Postgres: unique(event_id, plan_hash) + partial unique index on event_id where status in ('queued','running').
   */
  insertUnique(run: Run): Promise<{ kind: 'created' | 'duplicate' | 'active'; run: Run }>;
  /** Atomically take the lease if free or expired. Returns the run on success, null when held by someone else. */
  acquire(id: string, owner: string, ttlMs: number): Promise<Run | null>;
  release(id: string, owner: string): Promise<void>;
}

export class MemoryRunStore implements RunStore {
  protected runs = new Map<string, Run>();
  async get(id: string) { const r = this.runs.get(id); return r ? structuredClone(r) : null; }
  async put(run: Run) { this.runs.set(run.id, structuredClone({ ...run, updatedAt: new Date().toISOString() })); this.persist(); }
  async listByEvent(eventId: string) { return [...this.runs.values()].filter(r => r.eventId === eventId).map(r => structuredClone(r)); }
  async insertUnique(run: Run) {
    const all = [...this.runs.values()].filter(r => r.eventId === run.eventId);   // synchronous: no await between check and set
    const dupe = all.find(r => r.planHash === run.planHash); if (dupe) return { kind: 'duplicate' as const, run: structuredClone(dupe) };
    const active = all.find(r => r.status === 'queued' || r.status === 'running'); if (active) return { kind: 'active' as const, run: structuredClone(active) };
    this.runs.set(run.id, structuredClone(run)); this.persist();
    return { kind: 'created' as const, run: structuredClone(run) };
  }
  async acquire(id: string, owner: string, ttlMs: number) {
    const r = this.runs.get(id); if (!r) return null;
    const now = Date.now();
    if (r.leaseUntil && new Date(r.leaseUntil).getTime() > now && r.leaseOwner !== owner) return null;
    r.leaseOwner = owner; r.leaseUntil = new Date(now + ttlMs).toISOString(); this.persist();
    return structuredClone(r);
  }
  async release(id: string, owner: string) {
    const r = this.runs.get(id);
    if (r && r.leaseOwner === owner) { r.leaseOwner = null; r.leaseUntil = null; this.persist(); }
  }
  protected persist() { /* overridden by LocalStorageRunStore */ }
}

/** Survives page refresh in sample mode. */
export class LocalStorageRunStore extends MemoryRunStore {
  constructor(private key: string) {
    super();
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      if (raw) for (const r of JSON.parse(raw) as Run[]) this.runs.set(r.id, r);
    } catch { /* corrupted storage: start clean */ }
  }
  protected persist() {
    try { localStorage.setItem(this.key, JSON.stringify([...this.runs.values()])); } catch { /* storage full/blocked */ }
  }
  clear() { this.runs.clear(); try { localStorage.removeItem(this.key); } catch { /* ignore */ } }
}
