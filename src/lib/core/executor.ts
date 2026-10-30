import { ConnectorError, type Connector } from './connector';
import { ActiveRunError, type RunStore } from './store';
import { isApprovalValid, planHash, renderMessage } from './plan';
import { unresolvedConflicts } from './conflicts';
import { sameInstant, formatRange } from './time';
import type { Approval, Conflict, Plan, Run, RunStatus, RunStep } from './types';

const LEASE_MS = 60_000;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export class ApprovalError extends Error {}

/** Create a run from an approved plan. Idempotent per plan; refuses overlapping runs for one event. */
export async function createRun(store: RunStore, args: {
  plan: Plan; approval: Approval; conflicts: Conflict[]; now: string; id?: string;
}): Promise<{ run: Run; created: boolean }> {
  const { plan, approval } = args;
  if (!isApprovalValid(plan, approval)) throw new ApprovalError('This approval no longer matches the plan. Review and approve again.');
  const open = unresolvedConflicts(args.conflicts, plan.acknowledgedConflicts);
  if (open.length) throw new ApprovalError(`Resolve or acknowledge ${open.length} item${open.length === 1 ? '' : 's'} before approving.`);

  const hash = planHash(plan);
  const run: Run = {
    id: args.id ?? uid(), eventId: plan.eventId, planHash: hash, plan, approval, status: 'queued',
    steps: plan.steps.map<RunStep>(s => ({
      id: uid(), key: s.key, kind: s.kind, label: s.label, recipient: s.recipient,
      status: s.excluded ? 'skipped' : 'pending', attempts: 0, updatedAt: args.now,
      verification: s.excluded ? 'Left out by the organiser' : undefined,
    })),
    createdAt: args.now, updatedAt: args.now, leaseOwner: null, leaseUntil: null,
  };
  const res = await store.insertUnique(run);
  if (res.kind === 'active') throw new ActiveRunError(res.run.id);
  return { run: res.run, created: res.kind === 'created' };
}

const touch = (s: RunStep, patch: Partial<RunStep>): RunStep => ({ ...s, ...patch, updatedAt: new Date().toISOString() });
const done = (s: RunStep) => s.status === 'verified' || s.status === 'skipped';

function plainError(e: unknown, what: string): string {
  if (e instanceof ConnectorError) {
    if (e.kind === 'disconnected') return `${what} isn't connected right now. Reconnect it in Settings, then retry this step.`;
    if (e.kind === 'uncertain') return `We couldn't confirm what happened with ${what}. Check it before trying again.`;
    return `${what} rejected the update: ${e.message}`;
  }
  return `Something unexpected went wrong with ${what}.`;
}
const appName = (k: RunStep['kind']) => k === 'calendar.update' ? 'Google Calendar' : k === 'sheet.update' ? 'Google Sheets' : 'Gmail';

/** A step left "running" by a crashed/interrupted request must be re-evaluated, never blindly repeated. */
export function recoverInterrupted(run: Run): Run {
  return { ...run, steps: run.steps.map(s => s.status !== 'running' ? s : s.kind === 'email.send'
    ? touch(s, { status: 'needs_checking', plainError: 'The send was interrupted. We need to check whether the email went out.' })
    : touch(s, { status: 'pending' })) };
}

export function deriveStatus(run: Run): RunStatus {
  if (run.status === 'blocked_stale') return 'blocked_stale';
  const steps = run.steps;
  if (steps.every(done)) return 'succeeded';
  const runnable = steps.some(s => s.status === 'pending' && ready(run, s));
  const running = steps.some(s => s.status === 'running');
  if (runnable || running) return run.status === 'queued' ? 'queued' : 'running';
  return 'needs_attention';
}

function ready(run: Run, s: RunStep): boolean {
  if (s.kind !== 'email.send') return true;
  return run.steps.filter(x => x.kind !== 'email.send').every(done);   // emails only after schedule changes are verified
}

async function execStep(run: Run, step: RunStep, c: Connector): Promise<RunStep> {
  const { proposed } = run.plan;
  const notify = run.plan.calendarGuestUpdates === 'all';
  const what = appName(step.kind);
  const attempts = step.attempts + 1;
  try {
    if (step.kind === 'calendar.update' || step.kind === 'sheet.update') {
      const read = () => step.kind === 'calendar.update' ? c.readCalendar() : c.readSheet(run.eventId);
      const write = () => step.kind === 'calendar.update' ? c.writeCalendar(proposed.newStart, proposed.newEnd, notify) : c.writeSheet(run.eventId, proposed.newStart, proposed.newEnd);
      const matches = (v: { start: string; end: string }) => sameInstant(v.start, proposed.newStart) && sameInstant(v.end, proposed.newEnd);
      // Recheck current state first: a retry must not redo work that already landed.
      if (matches(await read())) return touch(step, { status: 'verified', attempts, error: undefined, plainError: undefined, verification: 'Already up to date when checked.' });
      let wrote = true;
      try { await write(); } catch (e) {
        if (!(e instanceof ConnectorError && e.kind === 'uncertain')) throw e;
        wrote = false;   // timeout: read back to find out what happened
      }
      const after = await read();
      if (matches(after)) return touch(step, { status: 'verified', attempts, error: undefined, plainError: undefined,
        verification: `Read back: ${formatRange(after.start, after.end, run.plan.timezone)}${wrote ? '' : ' (confirmed after a timeout)'}` });
      return touch(step, { status: 'failed', attempts, error: 'Read-back did not match the intended values',
        plainError: `${what} didn't show the new time after the update. The old value is still there.` });
    }
    // email
    const person = step.recipient!;
    const draft = renderMessage(person.role === 'volunteer' ? run.plan.drafts.volunteer : run.plan.drafts.participant, person);
    const key = `${run.id}:${step.key}`;
    try {
      const res = await c.sendEmail({ to: person.email, subject: draft.subject, body: draft.body, idempotencyKey: key });
      return touch(step, { status: 'verified', attempts, messageRef: res.messageRef, error: undefined, plainError: undefined,
        verification: res.messageRef ? `Sent. Reference ${res.messageRef}` : 'Sent. Gmail accepted it (no message reference returned).' });
    } catch (e) {
      if (e instanceof ConnectorError && e.kind === 'uncertain') {
        const found = c.findSent ? await c.findSent({ idempotencyKey: key, to: person.email, subject: draft.subject }).catch(() => null) : null;
        if (found?.found) return touch(step, { status: 'verified', attempts, messageRef: found.messageRef, plainError: undefined, verification: 'Sent. Confirmed in your Sent folder after a timeout.' });
        return touch(step, { status: 'needs_checking', attempts, error: e.message,
          plainError: `Gmail didn't confirm the email to ${person.name}. It may or may not have been sent. We won't send it again unless you say so.` });
      }
      throw e;
    }
  } catch (e) {
    return touch(step, { status: 'failed', attempts, error: e instanceof Error ? e.message : String(e), plainError: plainError(e, what) });
  }
}

/** Compare live sources with the plan's baseline. Any drift voids the approval. */
async function preflight(run: Run, c: Connector): Promise<string | null> {
  try {
    const [cal, sheet] = await Promise.all([c.readCalendar(), c.readSheet(run.eventId)]);
    const b = run.plan.baseline;
    if (!sameInstant(cal.start, b.calendarStart) || !sameInstant(cal.end, b.calendarEnd)) return 'The Calendar event changed after you reviewed it.';
    if (!sameInstant(sheet.start, b.sheetStart) || !sameInstant(sheet.end, b.sheetEnd)) return 'The schedule Sheet changed after you reviewed it.';
    return null;
  } catch (e) {
    if (e instanceof ConnectorError && e.kind === 'disconnected') throw e;
    throw e;
  }
}

export interface AdvanceResult { run: Run; busy: boolean }

/** Run as many ready steps as fit in maxSteps. Holds a lease so two callers can never execute the same run at once. */
export async function advanceRun(store: RunStore, connector: Connector, runId: string, opts: { owner?: string; maxSteps?: number } = {}): Promise<AdvanceResult> {
  const owner = opts.owner ?? uid();
  const leased = await store.acquire(runId, owner, LEASE_MS);
  if (!leased) { const cur = await store.get(runId); if (!cur) throw new Error('Run not found'); return { run: cur, busy: true }; }
  let run = recoverInterrupted(leased);
  if (run.status === 'needs_attention' && run.steps.every(s => s.status === 'pending' && s.attempts === 0)) run = { ...run, status: 'queued' };  // nothing started yet: re-run preflight
  try {
    if (run.status === 'queued') {
      try {
        const drift = await preflight(run, connector);
        if (drift) {
          run = { ...run, status: 'blocked_stale', staleReason: `${drift} Nothing was changed. Review the plan again.`,
            steps: run.steps.map(s => s.status === 'pending' ? touch(s, { status: 'skipped', verification: 'Not run: source records changed' }) : s) };
          await store.put(run); return { run, busy: false };
        }
      } catch (e) {
        const msg = plainError(e, 'Google');
        run = { ...run, status: 'needs_attention', staleReason: `We couldn't re-read your records before starting. ${msg}` };
        await store.put(run); return { run, busy: false };
      }
      run = { ...run, status: 'running', staleReason: undefined };
      await store.put(run);
    }
    for (let n = 0; n < (opts.maxSteps ?? 50); n++) {
      const next = run.steps.find(s => s.status === 'pending' && ready(run, s));
      if (!next) break;
      run = { ...run, steps: run.steps.map(s => s.id === next.id ? touch(s, { status: 'running' }) : s) };
      await store.put(run);                                           // persist "running" before the external call
      const result = await execStep(run, next, connector);
      run = { ...run, steps: run.steps.map(s => s.id === next.id ? result : s) };
      await store.put(run);
    }
    run = { ...run, status: deriveStatus(run) };
    await store.put(run);
    return { run, busy: false };
  } finally {
    await store.release(runId, owner);
  }
}

export type RecoveryAction = 'retry' | 'recheck' | 'mark_sent' | 'resend';

/** Targeted recovery for one step. Successful steps are never rerun. */
export async function recoverStep(store: RunStore, connector: Connector, runId: string, stepKey: string, action: RecoveryAction): Promise<AdvanceResult> {
  const owner = uid();
  const leased = await store.acquire(runId, owner, LEASE_MS);
  if (!leased) { const cur = await store.get(runId); if (!cur) throw new Error('Run not found'); return { run: cur, busy: true }; }
  try {
    let run = recoverInterrupted(leased);
    const step = run.steps.find(s => s.key === stepKey);
    if (!step) throw new Error('Step not found');
    if (step.status === 'verified' || step.status === 'skipped' || step.status === 'running') return { run, busy: false };  // never rerun
    const set = (p: Partial<RunStep>) => { run = { ...run, steps: run.steps.map(s => s.id === step.id ? touch(s, p) : s) }; };

    if (step.kind === 'email.send' && step.status === 'needs_checking') {
      if (action === 'recheck') {
        if (!connector.findSent) { set({ plainError: "This connection can't look up sent mail. Check your Gmail Sent folder, then tell us what you found." }); }
        else {
          const p = step.recipient!;
          const r = await connector.findSent({ idempotencyKey: `${run.id}:${step.key}`, to: p.email, subject: renderMessage(run.plan.drafts[p.role === 'volunteer' ? 'volunteer' : 'participant'], p).subject }).catch(() => null);
          if (r?.found) set({ status: 'verified', messageRef: r.messageRef, plainError: undefined, verification: 'Sent. Found in your Sent folder.' });
          else set({ plainError: "We couldn't find this email in your Sent folder. You can send it again if you're sure it didn't go out." });
        }
      } else if (action === 'mark_sent') set({ status: 'verified', plainError: undefined, verification: 'Sent. Confirmed by you.' });
      else if (action === 'resend') set({ status: 'pending', plainError: undefined, error: undefined });
    } else if (step.status === 'failed' && (action === 'retry' || action === 'resend')) {
      set({ status: 'pending', plainError: undefined, error: undefined });
    }
    run = { ...run, status: run.status === 'blocked_stale' ? 'blocked_stale' : (deriveStatus(run) === 'succeeded' ? 'succeeded' : 'running') };
    await store.put(run);
  } finally { await store.release(runId, owner); }
  return advanceRun(store, connector, runId);
}
