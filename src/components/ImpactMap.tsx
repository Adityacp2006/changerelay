'use client';
import { useState } from 'react';
import clsx from 'clsx';
import type { Conflict, EventRecord, Person, Plan, Run, StepStatus } from '@/lib/core/types';
import { clock, dateLabel } from '@/lib/client/format';

type CardId = 'calendar' | 'sheet' | 'participants' | 'volunteers';
type CardState = 'unchanged' | 'pending' | StepStatus;

interface Card { id: CardId; title: string; summary: string; detail: React.ReactNode; state: CardState; conflicts: Conflict[]; touched: boolean }

function aggregate(statuses: StepStatus[]): CardState {
  if (!statuses.length) return 'unchanged';
  if (statuses.some(s => s === 'failed')) return 'failed';
  if (statuses.some(s => s === 'needs_checking')) return 'needs_checking';
  if (statuses.some(s => s === 'running')) return 'running';
  if (statuses.every(s => s === 'verified' || s === 'skipped')) return 'verified';
  return statuses.some(s => s === 'verified') ? 'running' : 'pending';
}

export function buildCards(event: EventRecord, people: Person[], plan: Plan, conflicts: Conflict[], run: Run | null): Card[] {
  const z = event.timezone, p = plan.proposed;
  const step = (key: string) => run?.steps.find(s => s.key === key)?.status;
  const group = (role: Person['role']) => plan.steps.filter(s => s.kind === 'email.send' && s.recipient?.role === role && !s.excluded);
  const groupState = (role: Person['role']): CardState => run ? aggregate(run.steps.filter(s => s.kind === 'email.send' && s.recipient?.role === role).map(s => s.status)) : (group(role).length ? 'pending' : 'unchanged');
  const parts = group('participant'), vols = group('volunteer');
  const groupSummary = (role: Person['role'], steps: typeof parts) => {
    if (!run) return `${steps.length} to email`;
    const sent = run.steps.filter(s => s.kind === 'email.send' && s.recipient?.role === role && s.status === 'verified').length;
    const total = run.steps.filter(s => s.kind === 'email.send' && s.recipient?.role === role && s.status !== 'skipped').length;
    return run.status === 'succeeded' ? `${sent} emails sent` : `${sent} of ${total} emails sent`;
  };
  const change = (from: [string, string], to: [string, string]) => <>
    <p><span className="text-mute">Now:</span> {dateLabel(from[0], z)}, {clock(from[0], z)}–{clock(from[1], z)}</p>
    <p><span className="font-semibold text-indigo-700">New:</span> {dateLabel(to[0], z)}, {clock(to[0], z)}–{clock(to[1], z)}</p></>;
  const cf = (a: Conflict['area']) => conflicts.filter(c => c.area === a && c.severity !== 'info');
  const names = (l: typeof parts) => l.map(s => s.recipient!.name).join(', ');
  return [
    { id: 'calendar', title: 'Calendar', summary: `${clock(p.newStart, z)}–${clock(p.newEnd, z)}`, state: run ? (step('calendar') ?? 'pending') : 'pending', conflicts: cf('calendar'), touched: true,
      detail: <>{change([plan.baseline.calendarStart, plan.baseline.calendarEnd], [p.newStart, p.newEnd])}<p className="mt-1 hint">Fields changed: start, end. {plan.calendarGuestUpdates === 'all' ? 'Calendar will also notify invited guests.' : 'Calendar will not send its own guest notifications.'}</p></> },
    { id: 'sheet', title: 'Schedule sheet', summary: `${clock(p.newStart, z)}–${clock(p.newEnd, z)}`, state: run ? (step('sheet') ?? 'pending') : 'pending', conflicts: cf('sheet'), touched: true,
      detail: <>{change([plan.baseline.sheetStart, plan.baseline.sheetEnd], [p.newStart, p.newEnd])}<p className="mt-1 hint">Row found by event ID “{event.id.length > 30 ? 'linked ID' : event.id}”, not by row number. Fields changed: start, end.</p></> },
    { id: 'participants', title: 'Participants', summary: groupSummary('participant', parts), state: groupState('participant'), conflicts: cf('participants'), touched: parts.length > 0,
      detail: <><p>{parts.length ? `${parts.length} will get a Gmail message, one email each: ${names(parts)}.` : 'Nobody will be emailed.'}</p><p className="mt-1 hint">Availability not checked for participants.</p></> },
    ...(people.some(x => x.role === 'volunteer') ? [{ id: 'volunteers' as const, title: 'Volunteers', summary: groupSummary('volunteer', vols), state: groupState('volunteer'), conflicts: cf('volunteers'), touched: vols.length > 0 || cf('volunteers').length > 0,
      detail: <><p>{vols.length ? `${vols.length} will get a Gmail message: ${names(vols)}.` : 'No volunteers will be emailed.'}</p>
        {cf('volunteers').map(c => <p key={c.id} className="mt-1 font-semibold text-warn">{c.title}. <span className="font-normal text-ink">{c.detail}</span></p>)}</> }] : []),
  ];
}

const ring: Record<CardState, string> = {
  unchanged: 'border-line', pending: 'border-indigo-600/50 bg-indigo-50', running: 'border-indigo-600 bg-indigo-50 animate-pulseRing',
  verified: 'border-teal-600 bg-teal-50 animate-settle', failed: 'border-bad bg-red-50', needs_checking: 'border-warn bg-amber-50', skipped: 'border-line',
};
const stateText: Record<CardState, string> = { unchanged: 'No change', pending: 'Will change', running: 'Updating…', verified: 'Verified', failed: 'Needs attention', needs_checking: 'Needs checking', skipped: 'Skipped' };
const POS: Record<CardId, string> = { calendar: 'left-[3%] top-[6%]', sheet: 'left-[3%] bottom-[6%]', participants: 'right-[3%] top-[6%]', volunteers: 'right-[3%] bottom-[6%]' };
const LINE: Record<CardId, [number, number]> = { calendar: [22, 22], sheet: [22, 78], participants: [78, 22], volunteers: [78, 78] };

export function ImpactMap({ event, people, plan, conflicts, run }: { event: EventRecord; people: Person[]; plan: Plan; conflicts: Conflict[]; run: Run | null }) {
  const cards = buildCards(event, people, plan, conflicts, run);
  const [sel, setSel] = useState<CardId>('calendar');
  const [view, setView] = useState<'map' | 'list'>('map');
  const selected = cards.find(c => c.id === sel) ?? cards[0];
  const z = event.timezone;
  const statusLabel = (c: Card) => (run && c.state === 'verified' && (c.id === 'calendar' || c.id === 'sheet') ? 'Update verified' : stateText[c.state]);
  const label = (c: Card) => `${c.title}: ${statusLabel(c)}${c.conflicts.length ? `, ${c.conflicts.length} conflict${c.conflicts.length > 1 ? 's' : ''}` : ''}`;

  return (
    <section aria-labelledby="impact-h" className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="impact-h" className="text-xl font-bold">See what changes</h2>
        <div role="group" aria-label="View" className="hidden gap-1 rounded-xl border border-line p-1 md:flex">
          {(['map', 'list'] as const).map(v => <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={clsx('rounded-lg px-3 py-1 text-sm font-semibold', view === v ? 'bg-ink text-white' : 'text-mute hover:bg-stone-100')}>{v === 'map' ? 'Map' : 'List'}</button>)}
        </div>
      </div>

      {/* Map (md and up) */}
      {view === 'map' && (
        <div className="relative mt-4 hidden min-h-[340px] md:block" role="group" aria-label="Impact map. The same information is available in list view.">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {cards.map(c => <line key={c.id} x1="50" y1="50" x2={LINE[c.id][0]} y2={LINE[c.id][1]} vectorEffect="non-scaling-stroke" strokeWidth="2" strokeDasharray={c.touched ? '0' : '4 4'}
              stroke={c.state === 'verified' ? '#0E7C72' : c.state === 'failed' ? '#B42318' : c.touched ? '#4A4FD6' : '#D8D3C8'} className="transition-all duration-500" />)}
          </svg>
          <div className="absolute left-1/2 top-1/2 w-[30%] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-ink bg-white p-3 text-center shadow-sm">
            <p className="font-display text-base font-bold leading-tight">{event.title}</p>
            <p className="mt-1 text-sm text-mute line-through decoration-mute/60">{clock(plan.baseline.calendarStart, z)}–{clock(plan.baseline.calendarEnd, z)}</p>
            <p className="text-sm font-bold text-indigo-700">{clock(plan.proposed.newStart, z)}–{clock(plan.proposed.newEnd, z)}</p>
          </div>
          {cards.map(c => (
            <button key={c.id} onClick={() => setSel(c.id)} aria-pressed={sel === c.id} aria-label={label(c)}
              className={clsx('absolute w-[27%] rounded-2xl border-2 p-3 text-left transition-colors duration-300', POS[c.id], ring[c.state], c.conflicts.length && c.state !== 'verified' && 'border-warn', sel === c.id && 'ring-2 ring-ink ring-offset-2')}>
              <span className="flex items-center justify-between gap-1"><span className="font-bold">{c.title}</span>{c.state === 'verified' && <span aria-hidden className="text-teal-700">✓</span>}{c.conflicts.length > 0 && c.state !== 'verified' && <span aria-hidden className="text-warn">⚠</span>}</span>
              <span className="mt-0.5 block text-sm">{c.summary}</span>
              <span className="mt-0.5 block text-sm font-semibold text-mute">{statusLabel(c)}</span>
            </button>
          ))}
        </div>
      )}
      {view === 'map' && <div className="mt-3 hidden rounded-xl bg-stone-50 p-4 md:block" aria-live="polite"><p className="font-bold">{selected.title}</p><div className="mt-1 text-[15px]">{selected.detail}</div></div>}

      {/* List (always on small screens, optional on large) */}
      <ul className={clsx('mt-4 space-y-2', view === 'map' && 'md:hidden')}>
        {cards.map(c => (
          <li key={c.id} className={clsx('rounded-xl border-2 p-3', ring[c.state])}>
            <div className="flex items-center justify-between gap-2"><span className="font-bold">{c.title}</span><span className="text-sm font-semibold text-mute">{statusLabel(c)}</span></div>
            <div className="mt-1 text-[15px]">{c.detail}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
