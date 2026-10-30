import { describe, expect, it, vi } from 'vitest';
import { setup, NOW } from './helpers';
import { advanceRun, createRun, recoverStep, ApprovalError } from '@/lib/core/executor';
import { ActiveRunError } from '@/lib/core/store';
import { ConnectorError } from '@/lib/core/connector';
import { editDraft, isApprovalValid, setStepExcluded } from '@/lib/core/plan';
import { sameInstant } from '@/lib/core/time';

describe('1. successful reschedule', () => {
  it('updates calendar and sheet, verifies by read-back, then sends individual emails', async () => {
    const s = setup(); const { run } = await s.start();
    const r = (await advanceRun(s.store, s.sim, run.id)).run;
    expect(r.status).toBe('succeeded');
    expect(r.steps.every(x => x.status === 'verified')).toBe(true);
    expect(sameInstant(s.sim.state.calendar.start, s.t.newStart)).toBe(true);
    expect(sameInstant(s.sim.state.sheet.end, s.t.newEnd)).toBe(true);
    expect(Object.keys(s.sim.state.sent).length).toBe(7);
    expect(r.steps.find(x => x.key === 'calendar')?.verification).toMatch(/Read back/);
  });
  it('sends emails only after both schedule updates are verified', async () => {
    const s = setup('partial_failure'); const { run } = await s.start();
    const r = (await advanceRun(s.store, s.sim, run.id)).run;           // sheet fails once
    expect(r.steps.find(x => x.key === 'sheet')?.status).toBe('failed');
    expect(r.steps.filter(x => x.kind === 'email.send').every(x => x.status === 'pending')).toBe(true);
    expect(Object.keys(s.sim.state.sent).length).toBe(0);
    expect(r.status).toBe('needs_attention');
  });
});

describe('5. source changed after preview', () => {
  it('stops before writing anything and asks for a refreshed review', async () => {
    const s = setup(); const { run } = await s.start();
    s.sim.externalCalendarEdit('2026-10-30T05:00:00.000Z', '2026-10-30T06:00:00.000Z');
    const r = (await advanceRun(s.store, s.sim, run.id)).run;
    expect(r.status).toBe('blocked_stale');
    expect(r.staleReason).toMatch(/Calendar event changed/);
    expect(sameInstant(s.sim.state.sheet.start, s.world.event.sheetStart)).toBe(true);   // nothing written
    expect(Object.keys(s.sim.state.sent)).toHaveLength(0);
  });
});

describe('6. double-clicking Approve', () => {
  it('returns the same run for the same approved plan', async () => {
    const s = setup();
    const [a, b] = await Promise.all([s.start(), s.start()]);
    expect(b.run.id).toBe(a.run.id);
    expect((await s.store.listByEvent(s.plan.eventId)).length).toBe(1);
  });
  it('refuses a different plan while another run is active for the event', async () => {
    const s = setup(); await s.start();
    const other = editDraft(s.plan, 'participant', { subject: 'x', body: 'y' });
    await expect(createRun(s.store, { plan: other, approval: { ...s.approval, planHash: 'wrong' }, conflicts: s.conflicts, now: NOW })).rejects.toBeInstanceOf(ApprovalError);
    const { approve } = await import('@/lib/core/plan');
    await expect(createRun(s.store, { plan: other, approval: approve(other, 'u', NOW), conflicts: s.conflicts, now: NOW })).rejects.toBeInstanceOf(ActiveRunError);
  });
  it('two concurrent advance calls never send the same email twice (lease)', async () => {
    const s = setup(); const { run } = await s.start();
    const spy = vi.spyOn(s.sim, 'sendEmail');
    await Promise.all([advanceRun(s.store, s.sim, run.id, { owner: 'a' }), advanceRun(s.store, s.sim, run.id, { owner: 'b' })]);
    expect(spy.mock.calls.length).toBe(7);                                   // 7 recipients, each exactly once
    expect(Object.keys(s.sim.state.sent).length).toBe(7);
  });
});

describe('approval is bound to an exact plan version', () => {
  it('editing the message or recipients voids the approval', () => {
    const s = setup();
    expect(isApprovalValid(s.plan, s.approval)).toBe(true);
    expect(isApprovalValid(editDraft(s.plan, 'participant', { subject: 'new', body: 'edited' }), s.approval)).toBe(false);
    expect(isApprovalValid(setStepExcluded(s.plan, 'email:asha', true), s.approval)).toBe(false);
  });
  it('required steps cannot be excluded; optional ones can', () => {
    const s = setup();
    expect(setStepExcluded(s.plan, 'calendar', true).steps.find(x => x.key === 'calendar')?.excluded).toBeUndefined();
    expect(setStepExcluded(s.plan, 'email:asha', true).steps.find(x => x.key === 'email:asha')?.excluded).toBe(true);
  });
  it('refuses to start with unacknowledged warnings', async () => {
    const s = setup('happy', { ack: false });
    await expect(createRun(s.store, { plan: s.plan, approval: s.approval, conflicts: s.conflicts, now: NOW })).rejects.toThrow(/Resolve or acknowledge/);
  });
});

describe('7 + 8. partial failure, targeted retry, uncertain send', () => {
  it('preserves completed steps and retries only what failed', async () => {
    const s = setup('partial_failure'); const { run } = await s.start();
    let r = (await advanceRun(s.store, s.sim, run.id)).run;
    const calAttempts = r.steps.find(x => x.key === 'calendar')!.attempts;
    expect(r.steps.find(x => x.key === 'calendar')?.status).toBe('verified');
    const writeCal = vi.spyOn(s.sim, 'writeCalendar');
    r = (await recoverStep(s.store, s.sim, run.id, 'sheet', 'retry')).run;
    expect(writeCal).not.toHaveBeenCalled();
    expect(r.steps.find(x => x.key === 'calendar')!.attempts).toBe(calAttempts);
    expect(r.steps.find(x => x.key === 'sheet')?.status).toBe('verified');
  });
  it('marks a timed-out send "needs checking", reconciles via findSent, and never double-sends', async () => {
    const s = setup('partial_failure'); const { run } = await s.start();
    await advanceRun(s.store, s.sim, run.id);
    let r = (await recoverStep(s.store, s.sim, run.id, 'sheet', 'retry')).run;
    const kabir = r.steps.find(x => x.key === 'email:kabir')!;
    // the simulator timed out, but findSent confirms the message exists → verified without resending
    expect(kabir.status).toBe('verified');
    expect(kabir.verification).toMatch(/Confirmed in your Sent folder/);
    expect(Object.keys(s.sim.state.sent).filter(k => k.endsWith('email:kabir')).length).toBe(1);
    const dev = r.steps.find(x => x.key === 'email:dev')!;
    expect(dev.status).toBe('failed');                                        // definite rejection → safe to retry
    r = (await recoverStep(s.store, s.sim, run.id, 'email:dev', 'retry')).run;
    expect(r.status).toBe('succeeded');
  });
  it('without a lookup capability an uncertain send stays "needs checking" and is not resent automatically', async () => {
    const s = setup('partial_failure'); const { run } = await s.start();
    delete (s.sim as { findSent?: unknown }).findSent; (Object.getPrototypeOf(s.sim) as { findSent?: unknown }).findSent = undefined;
    const spy = vi.spyOn(s.sim, 'sendEmail');
    await advanceRun(s.store, s.sim, run.id);
    let r = (await recoverStep(s.store, s.sim, run.id, 'sheet', 'retry')).run;
    const k = r.steps.find(x => x.key === 'email:kabir')!;
    expect(k.status).toBe('needs_checking');
    const calls = spy.mock.calls.filter(c => c[0].to.startsWith('kabir@')).length;
    r = (await recoverStep(s.store, s.sim, run.id, 'email:kabir', 'recheck')).run;
    expect(spy.mock.calls.filter(c => c[0].to.startsWith('kabir@')).length).toBe(calls);   // recheck never sends
    r = (await recoverStep(s.store, s.sim, run.id, 'email:kabir', 'mark_sent')).run;
    expect(r.steps.find(x => x.key === 'email:kabir')?.verification).toMatch(/Confirmed by you/);
  });
  it('never reruns a verified step even when asked', async () => {
    const s = setup(); const { run } = await s.start(); await advanceRun(s.store, s.sim, run.id);
    const spy = vi.spyOn(s.sim, 'writeCalendar');
    await recoverStep(s.store, s.sim, run.id, 'calendar', 'retry');
    expect(spy).not.toHaveBeenCalled();
  });
  it('a retry skips the write when the source already shows the new time', async () => {
    const s = setup('partial_failure'); const { run } = await s.start();
    await advanceRun(s.store, s.sim, run.id);                          // sheet fails once
    s.sim.state.sheet = { start: s.t.newStart, end: s.t.newEnd };      // meanwhile it landed (e.g. user fixed it by hand)
    const spy = vi.spyOn(s.sim, 'writeSheet');
    const r = (await recoverStep(s.store, s.sim, run.id, 'sheet', 'retry')).run;
    expect(spy).not.toHaveBeenCalled();
    expect(r.steps.find(x => x.key === 'sheet')?.verification).toMatch(/Already up to date/);
  });
});

describe('9. disconnected account', () => {
  it('fails the step in plain language and keeps the run recoverable', async () => {
    const s = setup(); const { run } = await s.start();
    s.sim.writeCalendar = async () => { throw new ConnectorError('revoked', 'disconnected'); };
    const r = (await advanceRun(s.store, s.sim, run.id)).run;
    expect(r.steps.find(x => x.key === 'calendar')?.plainError).toMatch(/Reconnect it in Settings/);
    expect(r.status).toBe('needs_attention');
  });
  it('a disconnected account at preflight blocks the run before any write', async () => {
    const s = setup(); const { run } = await s.start();
    s.sim.readCalendar = async () => { throw new ConnectorError('revoked', 'disconnected'); };
    const w = vi.spyOn(s.sim, 'writeSheet');
    const r = (await advanceRun(s.store, s.sim, run.id)).run;
    expect(r.status).toBe('needs_attention'); expect(w).not.toHaveBeenCalled();
  });
});

describe('11. sample mode isolation', () => {
  it('completes a full run without ever calling fetch', async () => {
    const f = vi.fn(() => { throw new Error('network used in sample mode'); });
    vi.stubGlobal('fetch', f);
    const s = setup('partial_failure'); const { run } = await s.start();
    await advanceRun(s.store, s.sim, run.id); await recoverStep(s.store, s.sim, run.id, 'sheet', 'retry');
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('12. status survives a refresh', () => {
  it('a crashed "running" step is re-evaluated, not blindly repeated', async () => {
    const s = setup(); const { run } = await s.start();
    const r0 = (await s.store.get(run.id))!;
    r0.status = 'running';
    r0.steps = r0.steps.map(x => x.key === 'calendar' ? { ...x, status: 'verified' as const } : x.key === 'sheet' ? { ...x, status: 'verified' as const } : x.key === 'email:asha' ? { ...x, status: 'running' as const } : x);
    s.sim.state.calendar = { start: s.t.newStart, end: s.t.newEnd }; s.sim.state.sheet = { start: s.t.newStart, end: s.t.newEnd };
    await s.store.put(r0);
    const reloaded = (await s.store.get(run.id))!;                    // "page refresh": state comes only from the store
    expect(reloaded.steps.find(x => x.key === 'email:asha')?.status).toBe('running');
    const r = (await advanceRun(s.store, s.sim, run.id)).run;
    expect(r.steps.find(x => x.key === 'email:asha')?.status).toBe('needs_checking');
    expect(r.steps.find(x => x.key === 'email:kabir')?.status).toBeDefined();
  });
});
