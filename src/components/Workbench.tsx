'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { Conflict, MessageDraft, Plan, Run } from '@/lib/core/types';
import { buildPlan, editDraft, planHash, renderMessage, setAck, setStepExcluded } from '@/lib/core/plan';
import { detectConflicts, unresolvedConflicts } from '@/lib/core/conflicts';
import { resolveNewTimes, TimeError, zoneLabel } from '@/lib/core/time';
import type { RecoveryAction } from '@/lib/core/executor';
import type { Engine, WorkspaceData } from '@/lib/client/engine';
import { localDate, localTime, clock, dateLabel } from '@/lib/client/format';
import { ImpactMap } from './ImpactMap';
import { RunPanel } from './RunPanel';
import { Banner, Spinner } from './ui';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['queued', 'running'];
const STEPS = ['Change', 'Review', 'Apply', 'Result'];

function notificationChoice(text: string, current: boolean): boolean {
  const optOut = /\b(?:don't|do not|without)\s+(?:(?:send|sending)\s+)?(?:any\s+)?(?:emails?|messages?|notifications?|notify|email|tell|inform)\b|\bno\s+(?:emails?|messages?|notifications?)\b/i.test(text);
  if (optOut) return false;
  return /\b(?:notify|email|message|tell|inform)\b/i.test(text) ? true : current;
}

export function Workbench({ engine, initial }: { engine: Engine; initial: WorkspaceData }) {
  const [data, setData] = useState(initial);
  const ev = data.event, zone = ev.timezone;
  const [form, setForm] = useState({ date: localDate(ev.calendarStart, zone), start: localTime(ev.calendarStart, zone), end: '' });
  const [notify, setNotify] = useState(true);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [previewStale, setPreviewStale] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [source, setSource] = useState<{ source: 'form' | 'text'; text?: string }>({ source: 'form' });
  const [run, setRun] = useState<Run | null>(null);
  const [loadingRun, setLoadingRun] = useState(true);
  const [approving, setApproving] = useState(false);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nl, setNl] = useState({ text: '', busy: false, msg: null as null | { tone: 'info' | 'warn'; text: string; options?: { id: string; label: string }[] } });
  const driving = useRef(false);

  const drive = useCallback(async (id: string) => {
    if (driving.current) return;
    driving.current = true; setWorking(true);
    try {
      for (let i = 0; i < 300; i++) {
        const r = await engine.advance(id); setRun(r.run);
        if (!ACTIVE.includes(r.run.status)) break;
        await sleep(r.busy ? 1500 : 120);
      }
    } catch (e) { setErr((e as Error).message); } finally { driving.current = false; setWorking(false); }
  }, [engine]);

  useEffect(() => {
    let alive = true;
    engine.latestRun().then(r => { if (!alive) return; setRun(r); setLoadingRun(false); if (r && ACTIVE.includes(r.status)) drive(r.id); })
      .catch(e => { if (alive) { setErr(e.message); setLoadingRun(false); } });
    return () => { alive = false; };
  }, [engine, drive]);

  const preview = (nextForm = form, nextNotify = notify, src: typeof source = { source: 'form' }) => {
    setFormErr(null); setErr(null);
    try {
      if (!nextForm.date || !nextForm.start) throw new TimeError('Choose a date and a new start time.');
      const t = resolveNewTimes({ zone, oldStart: ev.calendarStart, oldEnd: ev.calendarEnd, newDate: nextForm.date, newStartTime: nextForm.start, newEndTime: nextForm.end || undefined });
      const p = buildPlan({ event: ev, newStart: t.newStart, newEnd: t.newEnd, recipients: nextNotify ? data.people : [], organiserName: data.organiserName, calendarGuestUpdates: data.calendarGuestUpdates });
      setPlan(p); setPreviewStale(false); setSource(src);
      setConflicts(detectConflicts({ event: ev, newStart: t.newStart, newEnd: t.newEnd, people: data.people, assignments: data.assignments, organiserBusy: data.busy, now: new Date().toISOString() }));
    } catch (e) { setPlan(null); setPreviewStale(false); setFormErr(e instanceof TimeError ? e.message : 'Those times could not be used.'); }
  };

  const understand = async () => {
    setNl(s => ({ ...s, busy: true, msg: null }));
    try {
      const r = await engine.interpret(nl.text);
      if (r.status === 'ok') {
        if (r.event.id !== ev.id) { setNl(s => ({ ...s, busy: false, msg: { tone: 'warn', text: `That sounds like "${r.event.title}", which is a different event. Open it to plan the change.` } })); return; }
        const f = { date: localDate(r.newStart, zone), start: localTime(r.newStart, zone), end: localTime(r.newEnd, zone) };
        const notifyChoice = notificationChoice(nl.text, notify);
        setForm(f); setNotify(notifyChoice);
        setNl(s => ({ ...s, busy: false, msg: { tone: 'info', text: 'I filled in the form from your request. Nothing has changed yet. Review the proposed time and notification choice.' } }));
        preview(f, notifyChoice, { source: 'text', text: nl.text });
      } else if (r.status === 'clarify') setNl(s => ({ ...s, busy: false, msg: { tone: 'warn', text: r.question, options: r.options } }));
      else setNl(s => ({ ...s, busy: false, msg: { tone: 'warn', text: r.message } }));
    } catch (e) { setNl(s => ({ ...s, busy: false, msg: { tone: 'warn', text: `${(e as Error).message} You can still use the form.` } })); }
  };

  const open = plan ? unresolvedConflicts(conflicts, plan.acknowledgedConflicts) : [];
  const emails = plan?.steps.filter(s => s.kind === 'email.send') ?? [];
  const active = run && ACTIVE.includes(run.status);
  const first = plan?.steps.find(s => s.kind === 'email.send' && !s.excluded)?.recipient;
  const hash = plan ? planHash(plan).slice(0, 8) : '';
  const stage = active ? 2 : run ? 3 : plan ? 1 : 0;
  const isReviewing = !!plan && !active && (!run || run.planHash !== planHash(plan));

  const approve = async () => {
    if (!plan || previewStale || approving || open.length) return;
    setApproving(true); setErr(null);
    try { const r = await engine.approve(plan, source); setRun(r); drive(r.id); }
    catch (e) { const x = e as Error & { code?: string }; setErr(x.code === 'stale' ? 'Your Calendar or Sheet changed since this preview. Refresh and review it again.' : x.message); }
    finally { setApproving(false); }
  };
  const recover = async (k: string, a: RecoveryAction) => {
    if (!run) return;
    setWorking(true); setErr(null);
    try { const r = await engine.recover(run.id, k, a); setRun(r.run); if (ACTIVE.includes(r.run.status)) { setWorking(false); drive(r.run.id); return; } }
    catch (e) { setErr((e as Error).message); } finally { setWorking(false); }
  };
  const reviewAgain = async () => {
    try {
      const d = await engine.refresh(); setData(d); setRun(null); setPlan(null); setPreviewStale(false);
      setForm({ date: localDate(d.event.calendarStart, zone), start: localTime(d.event.calendarStart, zone), end: '' });
    } catch (e) { setErr((e as Error).message); }
  };
  const editMsg = (which: 'participant' | 'volunteer', patch: Partial<MessageDraft>) => plan && setPlan(editDraft(plan, which, { ...plan.drafts[which], ...patch }));
  const hasVol = emails.some(s => s.recipient?.role === 'volunteer');

  return (
    <div className="space-y-5">
      <nav aria-label="Change progress" className="card p-3 sm:p-4">
        <ol className="grid grid-cols-4 gap-1">
          {STEPS.map((label, i) => <li key={label} aria-current={i === stage ? 'step' : undefined} className={clsx('flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold sm:px-3', i === stage ? 'bg-teal-700 text-white' : i < stage ? 'bg-teal-50 text-teal-800' : 'bg-stone-50 text-mute')}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs">{i < stage ? '✓' : i + 1}</span><span>{label}</span>
          </li>)}
        </ol>
      </nav>

      {err && <Banner tone="bad" title="That didn't work">{err}</Banner>}
      {loadingRun && !plan && <Spinner label="Checking for earlier changes" />}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section aria-labelledby="plan-h" className="card p-4 sm:p-5">
          <h2 id="plan-h" className="text-xl font-bold">Change the event time</h2>
          <p className="hint mt-1">Times use <b>{zoneLabel(zone, ev.calendarStart)}</b>. The event duration stays the same unless you enter a new end time.</p>
          <form className="mt-4 space-y-3" onSubmit={e => { e.preventDefault(); preview(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="d">New date</label><input id="d" type="date" className="input" value={form.date} onChange={e => { setForm({ ...form, date: e.target.value }); if (plan) setPreviewStale(true); }} required /></div>
              <div><label className="label" htmlFor="s">New start</label><input id="s" type="time" className="input" value={form.start} onChange={e => { setForm({ ...form, start: e.target.value }); if (plan) setPreviewStale(true); }} required /></div>
              <div><label className="label" htmlFor="e">New end <span className="font-normal text-mute">(optional)</span></label><input id="e" type="time" className="input" value={form.end} onChange={e => { setForm({ ...form, end: e.target.value }); if (plan) setPreviewStale(true); }} /></div>
            </div>
            <label className="flex min-h-11 items-center gap-2 rounded-xl bg-stone-50 px-3 font-medium">
              <input type="checkbox" className="h-5 w-5 accent-teal-600" checked={notify} onChange={e => { setNotify(e.target.checked); if (plan) setPreviewStale(true); }} />
              Email the people on the roster about this change
            </label>
            {formErr && <Banner tone="bad" title="Check the new time">{formErr}</Banner>}
            <button className="btn-primary w-full" type="submit">{plan ? 'Review this change' : 'Create impact preview'}</button>
          </form>

          <details className="mt-4 rounded-xl bg-stone-50 p-3" open={!!nl.msg}>
            <summary className="cursor-pointer font-semibold">Or describe the change in a sentence</summary>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="nl">Describe the change</label>
              <input id="nl" className="input" placeholder="Move tomorrow's AI workshop from 2 pm to 4 pm" value={nl.text} maxLength={400} onChange={e => setNl({ ...nl, text: e.target.value })} />
              <button type="button" className="btn-quiet shrink-0" disabled={nl.busy || nl.text.trim().length < 3} onClick={understand}>{nl.busy ? 'Reading…' : 'Fill the form'}</button>
            </div>
            <p className="hint mt-1">This only fills the form. It preserves your email choice unless the sentence explicitly asks to notify or not notify.</p>
            {nl.msg && <div className="mt-2"><Banner tone={nl.msg.tone} title={nl.msg.tone === 'warn' ? 'One question' : undefined}>{nl.msg.text}{nl.msg.options && engine.mode === 'live' && <ul className="mt-2 list-disc pl-5">{nl.msg.options.map(o => <li key={o.id}><a className="font-semibold text-teal-700 underline" href={`/app/events/${o.id}`}>{o.label}</a></li>)}</ul>}</Banner></div>}
          </details>
        </section>

        <aside aria-label="Impact review" className="space-y-4">
          {isReviewing && plan ? <>
            {previewStale
              ? <Banner tone="warn" title="This preview is out of date">The date, time, or email choice changed after this preview. Review the updated change before approval.</Banner>
              : <Banner tone="info" title="Preview only — nothing has changed">Review the impact and exact notification choices. Approval applies only to this version ({hash}).</Banner>}

            <section className="card border-2 border-ink p-4 sm:p-5" aria-labelledby="before-after-h">
              <h2 id="before-after-h" className="text-lg font-bold">Proposed change</h2>
              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl bg-stone-50 p-3">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-mute">Before</p><p className="mt-1 font-semibold">{dateLabel(plan.baseline.calendarStart, zone)}</p><p>{clock(plan.baseline.calendarStart, zone)}–{clock(plan.baseline.calendarEnd, zone)}</p></div>
                <span aria-hidden className="text-xl font-bold text-teal-700">→</span>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-mute">After</p><p className="mt-1 font-semibold">{dateLabel(plan.proposed.newStart, zone)}</p><p className="font-bold text-indigo-700">{clock(plan.proposed.newStart, zone)}–{clock(plan.proposed.newEnd, zone)}</p></div>
              </div>
              <p className="mt-2 text-sm text-mute">Calendar + schedule sheet · {emails.filter(s => !s.excluded).length} individual emails {notify ? 'selected' : 'not selected'}</p>
            </section>

            <ImpactMap event={ev} people={data.people} plan={plan} conflicts={conflicts} run={null} />

            <section aria-labelledby="cf-h" className="card p-4 sm:p-5">
              <h2 id="cf-h" className="text-lg font-bold">Conflicts and availability checks</h2>
              {conflicts.length === 0 ? <p className="mt-2 text-mute">No known conflicts were found in the checked schedules.</p> : (
                <ul className="mt-3 space-y-2">{conflicts.map(c => (
                  <li key={c.id} className={clsx('rounded-xl border p-3', c.severity === 'blocking' ? 'border-bad/40 bg-red-50' : c.severity === 'warning' ? 'border-warn/40 bg-amber-50' : 'border-line bg-stone-50')}>
                    <p className="font-semibold">{c.severity === 'blocking' ? '⛔ ' : c.severity === 'warning' ? '⚠ ' : 'ℹ '}{c.title}</p>
                    <p className="text-[15px]">{c.detail}</p>
                    {c.severity === 'warning' && <label className="mt-2 flex items-center gap-2 text-[15px] font-medium"><input type="checkbox" className="h-5 w-5 accent-teal-600" checked={plan.acknowledgedConflicts.includes(c.id)} onChange={e => setPlan(setAck(plan, c.id, e.target.checked))} />I understand this conflict and want to continue</label>}
                  </li>))}</ul>)}
            </section>

            <details className="card p-4">
              <summary className="cursor-pointer font-semibold">Exact fields and message details</summary>
              <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[440px] text-left text-sm">
                <thead><tr className="border-b border-line text-mute"><th className="py-2 pr-3">Where</th><th className="pr-3">Field</th><th className="pr-3">Now</th><th>New</th></tr></thead>
                <tbody>{plan.fieldChanges.map((f, i) => <tr key={i} className="border-b border-line/60"><td className="py-2 pr-3">{f.target === 'calendar' ? 'Calendar' : 'Schedule sheet'}</td><td className="pr-3">{f.field === 'start' ? 'Start' : 'End'}</td><td className="pr-3 text-mute">{dateLabel(f.from, zone)}, {clock(f.from, zone)}</td><td className="font-semibold text-indigo-700">{dateLabel(f.to, zone)}, {clock(f.to, zone)}</td></tr>)}</tbody>
              </table></div>
              {emails.length > 0 && <div className="mt-4">
                <p className="hint">Each person receives an individual email. Sent means accepted by Gmail, not read or attendance-confirmed.</p>
                {((hasVol ? ['participant', 'volunteer'] : ['participant']) as ('participant' | 'volunteer')[]).map(w => <fieldset key={w} className="mt-3">
                  <legend className="font-bold">{w === 'participant' ? 'Participant message' : 'Volunteer message'}</legend>
                  <label className="label mt-2" htmlFor={`sub-${w}`}>Subject</label><input id={`sub-${w}`} className="input" value={plan.drafts[w].subject} maxLength={200} onChange={e => editMsg(w, { subject: e.target.value })} />
                  <label className="label mt-2" htmlFor={`bod-${w}`}>Message</label><textarea id={`bod-${w}`} className="input min-h-[130px]" value={plan.drafts[w].body} maxLength={5000} onChange={e => editMsg(w, { body: e.target.value })} />
                </fieldset>)}
                <h3 className="mt-4 font-bold">Recipients ({emails.filter(s => !s.excluded).length} of {emails.length})</h3>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">{emails.map(s => <li key={s.key}><label className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-stone-50"><input type="checkbox" className="h-5 w-5 accent-teal-600" checked={!s.excluded} onChange={e => setPlan(setStepExcluded(plan, s.key, !e.target.checked))} /><span>{s.recipient!.name} <span className="text-mute">({s.recipient!.role})</span></span></label></li>)}</ul>
                {first && <details className="mt-3 rounded-xl bg-stone-50 p-3"><summary className="cursor-pointer font-semibold">Preview email for {first.name}</summary><pre className="mt-2 whitespace-pre-wrap font-sans text-[15px]">{renderMessage(plan.drafts[first.role === 'volunteer' ? 'volunteer' : 'participant'], first).body}</pre></details>}
              </div>}
            </details>

            <section aria-labelledby="approve-h" className="card border-2 border-ink p-4 sm:p-5">
              <h2 id="approve-h" className="text-lg font-bold">Review and approve</h2>
              <ul className="mt-2 space-y-1 text-[15px]">
                <li>Calendar update, then read-back verification.</li><li>Schedule sheet update, then read-back verification.</li>
                <li>{emails.filter(s => !s.excluded).length ? `Send ${emails.filter(s => !s.excluded).length} individual emails after both updates verify.` : 'No emails will be sent.'}</li>
              </ul>
              {open.length > 0 && <div className="mt-3"><Banner tone="warn" title="Resolve or acknowledge before approval">{open.map(c => <p key={c.id}>{c.severity === 'blocking' ? c.title : `Confirm: ${c.title}`}</p>)}</Banner></div>}
              <button className="btn-primary mt-4 w-full" disabled={previewStale || open.length > 0 || approving} onClick={approve}>{approving ? 'Starting…' : previewStale ? 'Review the updated change first' : 'Approve exact change and update'}</button>
              <p className="hint mt-2">Approval is bound to version {hash}. Changing the time or email choice requires a fresh review.</p>
              {previewStale && <button type="button" className="btn-quiet mt-2 w-full" onClick={() => preview(form, notify, { source: 'form' })}>Review updated change</button>}
            </section>
          </> : isReviewing ? null : (
            <section className="card border-dashed p-5 text-center sm:p-8">
              <p className="font-display text-lg font-bold">Your impact preview appears here</p>
              <p className="mt-1 text-[15px] text-mute">Choose a new time or describe it in a sentence. Nothing is changed until you review and approve.</p>
            </section>
          )}
        </aside>
      </div>

      {run && (!plan || active || run.planHash === planHash(plan)) && <section className="space-y-4" aria-label="Change result">
        <ImpactMap event={ev} people={data.people} plan={run.plan} conflicts={conflicts} run={run} />
        <RunPanel run={run} onRecover={recover} working={working} timezone={zone} />
        {run.status === 'blocked_stale' && <button className="btn-primary" onClick={reviewAgain}>Refresh and review again</button>}
        {run.status === 'succeeded' && <button className="btn-quiet" onClick={() => { setRun(null); setPlan(null); setPreviewStale(false); reviewAgain(); }}>Plan another change</button>}
      </section>}
    </div>
  );
}
