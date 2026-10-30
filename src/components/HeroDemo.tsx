'use client';
import { useState } from 'react';
import clsx from 'clsx';

/** A fictional illustration of the sample change; it never contacts connected services. */
export function HeroDemo() {
  const [approved, setApproved] = useState(false);
  return (
    <div className="card overflow-hidden p-5 shadow-sm" aria-label="Illustration of the sample AI Workshop moving from 2 pm to 4 pm">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-sm font-semibold uppercase tracking-wide text-mute">Impact preview · sample</p><p className="mt-1 font-display text-xl font-bold">AI Workshop</p></div>
        <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-700">Preview only</span>
      </div>
      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl bg-stone-50 p-4 text-center">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-mute">Before</p><p className="mt-1 text-xl font-bold">2:00 pm</p></div>
        <span aria-hidden className="text-2xl font-bold text-teal-700">→</span>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-mute">Proposed</p><p className="mt-1 text-xl font-bold text-indigo-700">4:00 pm</p></div>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        <li className={clsx('rounded-xl border p-3 transition-colors', approved ? 'border-teal-200 bg-teal-50' : 'border-line bg-white')}>
          <p className="font-semibold">Calendar + schedule sheet</p><p className="mt-1 text-sm text-mute">{approved ? 'Updates verified' : 'Both updates checked before email'}</p>
        </li>
        <li className="rounded-xl border border-line bg-white p-3">
          <p className="font-semibold">7 people to notify</p><p className="mt-1 text-sm text-mute">5 participants · 2 volunteers</p>
        </li>
      </ul>
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p className="font-semibold text-warn">Conflict detected</p>
        <p className="text-sm">A volunteer has another assignment during the proposed time.</p>
      </div>
      {approved && <div role="status" className="mt-3 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm"><b>Recovery stays targeted.</b> Verified steps are kept; only a failed step needs retrying.</div>}
      <button className="btn-primary mt-4 w-full" onClick={() => setApproved(v => !v)} aria-pressed={approved}>{approved ? 'Show the review preview' : 'Preview the verified result'}</button>
      <p className="hint mt-2">Illustration only. Try the interactive demo to review, approve, and recover a simulated change.</p>
    </div>
  );
}
