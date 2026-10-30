import clsx from 'clsx';
import type { RunStatus, StepStatus } from '@/lib/core/types';

export function ModeBadge({ mode }: { mode: 'sample' | 'live' }) {
  return mode === 'sample'
    ? <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-700" title="Nothing here contacts real accounts"><span aria-hidden className="h-2 w-2 rounded-full bg-indigo-600" />Sample workspace</span>
    : <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-100 px-3 py-1 text-sm font-semibold text-teal-800" title="Changes here affect your real Calendar, Sheet and email"><span aria-hidden className="h-2 w-2 rounded-full bg-teal-600" />Live workspace</span>;
}

const STEP: Record<StepStatus, { label: string; cls: string }> = {
  pending: { label: 'Waiting', cls: 'bg-stone-100 text-mute' },
  running: { label: 'Working…', cls: 'bg-indigo-100 text-indigo-700' },
  verified: { label: 'Verified', cls: 'bg-teal-100 text-teal-800' },
  failed: { label: 'Needs attention', cls: 'bg-red-100 text-bad' },
  needs_checking: { label: 'Needs checking', cls: 'bg-amber-100 text-warn' },
  skipped: { label: 'Skipped', cls: 'bg-stone-100 text-mute' },
};
export function StepPill({ status, kind }: { status: StepStatus; kind?: string }) {
  const s = STEP[status];
  const label = status === 'verified' && kind === 'email.send' ? 'Sent' : s.label;   // "Sent" ≠ "Acknowledged"
  return <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold', s.cls)}>{label}</span>;
}
const RUN: Record<RunStatus, { label: string; cls: string }> = {
  queued: { label: 'Starting', cls: 'bg-indigo-100 text-indigo-700' }, running: { label: 'In progress', cls: 'bg-indigo-100 text-indigo-700' },
  succeeded: { label: 'All verified', cls: 'bg-teal-100 text-teal-800' }, needs_attention: { label: 'Needs your attention', cls: 'bg-amber-100 text-warn' },
  blocked_stale: { label: 'Review again', cls: 'bg-amber-100 text-warn' },
};
export function RunPill({ status }: { status: RunStatus }) { return <span className={clsx('inline-flex rounded-full px-2.5 py-0.5 text-sm font-semibold', RUN[status].cls)}>{RUN[status].label}</span>; }

export function Banner({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; title?: string; children?: React.ReactNode }) {
  const t = { info: 'border-indigo-100 bg-indigo-50', warn: 'border-amber-200 bg-amber-50', bad: 'border-red-200 bg-red-50', ok: 'border-teal-100 bg-teal-50' }[tone];
  return <div role={tone === 'bad' ? 'alert' : 'status'} className={clsx('rounded-xl border px-4 py-3', t)}>{title && <p className="font-semibold">{title}</p>}{children && <div className="text-[15px]">{children}</div>}</div>;
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <div role="status" className="flex items-center gap-3 py-8 text-mute"><span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />{label}…</div>;
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return <div className="card border-dashed p-8 text-center"><h3 className="text-lg font-semibold">{title}</h3>{children && <p className="mx-auto mt-1 max-w-md text-mute">{children}</p>}{action && <div className="mt-4">{action}</div>}</div>;
}

export function Shell({ mode, nav, children }: { mode: 'sample' | 'live' | 'none'; nav?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-line bg-paper/90">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <a href="/" className="font-display text-xl font-extrabold tracking-tight">Change<span className="text-teal-600">Relay</span></a>
          {mode !== 'none' && <ModeBadge mode={mode} />}
          <nav aria-label="Main" className="ml-auto flex flex-wrap items-center gap-1 text-[15px]">{nav}</nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
