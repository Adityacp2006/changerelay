'use client';
import clsx from 'clsx';
import type { Run, RunStep } from '@/lib/core/types';
import type { RecoveryAction } from '@/lib/core/executor';
import { RunPill, StepPill, Banner } from './ui';
import { formatRange } from '@/lib/core/time';

function Actions({ s, onRecover, disabled }: { s: RunStep; onRecover: (k: string, a: RecoveryAction) => void; disabled: boolean }) {
  if (s.status === 'failed') return <div className="mt-2"><button disabled={disabled} className="btn-quiet !min-h-[40px] !py-1.5" onClick={() => onRecover(s.key, 'retry')}>Check and try again</button></div>;
  if (s.status === 'needs_checking' && s.kind === 'email.send') return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button disabled={disabled} className="btn-quiet !min-h-[40px] !py-1.5" onClick={() => onRecover(s.key, 'recheck')}>Look in Sent folder</button>
      <button disabled={disabled} className="btn-quiet !min-h-[40px] !py-1.5" onClick={() => onRecover(s.key, 'mark_sent')}>I checked: it was sent</button>
      <button disabled={disabled} className="btn-danger !min-h-[40px] !py-1.5" onClick={() => { if (confirm(`Send this email again? If the first one did go out, ${s.recipient?.name ?? 'they'} will get two.`)) onRecover(s.key, 'resend'); }}>Send again</button>
    </div>);
  return null;
}

/** Activity and recovery: every step, its status, how it was verified, and what you can do about it. */
export function RunPanel({ run, onRecover, working, timezone }: { run: Run; onRecover: (k: string, a: RecoveryAction) => void; working: boolean; timezone: string }) {
  const schedule = run.steps.filter(s => s.kind !== 'email.send'), mail = run.steps.filter(s => s.kind === 'email.send');
  const verified = run.steps.filter(s => s.status === 'verified').length, total = run.steps.filter(s => s.status !== 'skipped').length;
  const attention = run.steps.filter(s => s.status === 'failed' || s.status === 'needs_checking');
  const waiting = run.steps.filter(s => s.status === 'pending').length;
  const mailCount = (role: 'participant' | 'volunteer') => {
    const steps = mail.filter(s => s.recipient?.role === role && s.status !== 'skipped');
    const sent = steps.filter(s => s.status === 'verified').length;
    return { sent, total: steps.length, label: run.status === 'succeeded' ? `${sent} emails sent` : `${sent} of ${steps.length} emails sent` };
  };
  const calendar = run.steps.find(s => s.key === 'calendar');
  const sheet = run.steps.find(s => s.key === 'sheet');
  const updateLabel = (s?: RunStep) => s?.status === 'verified' ? 'Update verified' : s?.status === 'failed' ? 'Update failed' : s?.status === 'needs_checking' ? 'Needs checking' : s?.status === 'running' ? 'Updating…' : 'Waiting';
  const row = (s: RunStep) => (
    <li key={s.id} className={clsx('rounded-xl border p-3', s.status === 'failed' ? 'border-bad/40 bg-red-50' : s.status === 'needs_checking' ? 'border-warn/40 bg-amber-50' : 'border-line bg-white')}>
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{s.label}</span>{s.kind === 'email.send' ? <StepPill status={s.status} kind={s.kind} /> : <span className={clsx('rounded-full px-2.5 py-0.5 text-sm font-semibold', s.status === 'verified' ? 'bg-teal-100 text-teal-800' : s.status === 'failed' ? 'bg-red-100 text-bad' : s.status === 'needs_checking' ? 'bg-amber-100 text-warn' : 'bg-stone-100 text-mute')}>{updateLabel(s)}</span>}</div>
      {s.verification && <p className="mt-1 text-[15px] text-mute">{s.verification}</p>}
      {s.plainError && s.status !== 'verified' && <p className="mt-1 text-[15px] font-medium text-ink">{s.plainError}</p>}
      {s.kind === 'email.send' && s.status === 'verified' && <p className="mt-1 text-sm text-mute">Sent. We can't tell whether they've read it.</p>}
      <Actions s={s} onRecover={onRecover} disabled={working} />
    </li>);
  return (
    <section aria-labelledby="run-h" className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="run-h" className="text-xl font-bold">{run.status === 'succeeded' ? 'Change receipt' : 'Execution result'}</h2><RunPill status={run.status} /></div>
      <div aria-live="polite" className="mt-3 space-y-3">
        {run.status === 'blocked_stale' && <Banner tone="warn" title="Nothing was changed">{run.staleReason}</Banner>}
        {run.status === 'needs_attention' && run.staleReason && <Banner tone="warn" title="Couldn't start">{run.staleReason}</Banner>}
        {run.status === 'needs_attention' && !run.staleReason && <Banner tone="warn" title="This update needs your attention">{attention.length ? `${attention.length} step${attention.length > 1 ? 's' : ''} need${attention.length > 1 ? '' : 's'} you. Steps that already worked are kept and won't be repeated.` : `${waiting} step${waiting > 1 ? 's are' : ' is'} waiting for the schedule updates to be verified.`}</Banner>}
        {run.status === 'succeeded' && <Banner tone="ok" title="Everything is verified">Calendar and Sheet were read back with the new time. Emails show as sent, which means Gmail accepted them.</Banner>}
        <p className="hint">{verified} of {total} steps verified. These updates happen in separate apps, so they aren't all-or-nothing; we check each one.</p>
      </div>
      {run.status === 'succeeded' && <div className="mt-4 rounded-2xl border-2 border-teal-700 bg-teal-50 p-4">
        <h3 className="font-display text-lg font-bold text-teal-800">Verified change summary</h3>
        <ul className="mt-2 grid gap-2 text-[15px] sm:grid-cols-2">
          <li><b>Calendar:</b> {updateLabel(calendar)}</li>
          <li><b>Schedule sheet:</b> {updateLabel(sheet)}</li>
          {mail.some(s => s.recipient?.role === 'participant' && s.status !== 'skipped') && <li><b>Participants:</b> {mailCount('participant').label}</li>}
          {mail.some(s => s.recipient?.role === 'volunteer' && s.status !== 'skipped') && <li><b>Volunteers:</b> {mailCount('volunteer').label}</li>}
        </ul>
        <p className="mt-2 text-sm text-mute">Email status means Gmail accepted the messages. It does not confirm they were read or that anyone can attend.</p>
      </div>}
      <h3 className="mt-4 font-bold">Schedule updates</h3>
      <ul className="mt-2 space-y-2">{schedule.map(row)}</ul>
      {mail.length > 0 && <><h3 className="mt-4 font-bold">Emails</h3><ul className="mt-2 space-y-2">{mail.map(row)}</ul></>}
      {(run.status === 'succeeded' || run.status === 'needs_attention') && (
        <details className="mt-4 rounded-xl bg-stone-50 p-3">
          <summary className="cursor-pointer font-semibold">Change receipt</summary>
          <div className="mt-2 space-y-1 text-[15px]">
            <p><b>Event:</b> {run.plan.eventId.length > 20 ? 'Linked event' : run.plan.eventId}</p>
            <p><b>Old time:</b> {formatRange(run.plan.baseline.calendarStart, run.plan.baseline.calendarEnd, timezone)}</p>
            <p><b>New time:</b> {formatRange(run.plan.proposed.newStart, run.plan.proposed.newEnd, timezone)} ({timezone})</p>
            <p><b>Approved:</b> {new Date(run.approval.approvedAt).toLocaleString()}</p>
            <ul className="list-disc pl-5">
              <li>Calendar: {updateLabel(calendar)}</li>
              <li>Schedule sheet: {updateLabel(sheet)}</li>
              {mail.some(s => s.recipient?.role === 'participant' && s.status !== 'skipped') && <li>Participants: {mailCount('participant').label}</li>}
              {mail.some(s => s.recipient?.role === 'volunteer' && s.status !== 'skipped') && <li>Volunteers: {mailCount('volunteer').label}</li>}
              {run.steps.filter(s => s.messageRef).map(s => <li key={s.id}>{s.label} reference: {s.messageRef}</li>)}
            </ul>
            <p className="hint">A change can't be undone from here. To go back, make a new change and review it like any other.</p>
          </div>
        </details>
      )}
    </section>
  );
}
