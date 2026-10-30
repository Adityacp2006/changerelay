import { z } from 'zod';
import { handle, limit, HttpError } from '@/lib/server/api';
import { requireUser, adminClient } from '@/lib/server/supabase';
import { loadLiveContext, audit } from '@/lib/server/data';
import { PgRunStore } from '@/lib/server/pg-store';
import { approve, planHash } from '@/lib/core/plan';
import { detectConflicts } from '@/lib/core/conflicts';
import { createRun } from '@/lib/core/executor';
import { sameInstant } from '@/lib/core/time';
import type { Plan } from '@/lib/core/types';

const Msg = z.object({ subject: z.string().min(1).max(200), body: z.string().min(1).max(5000) });
const PlanSchema = z.object({
  eventId: z.string(), timezone: z.string(),
  baseline: z.object({ calendarStart: z.string(), calendarEnd: z.string(), sheetStart: z.string(), sheetEnd: z.string() }),
  proposed: z.object({ newStart: z.string(), newEnd: z.string() }),
  fieldChanges: z.array(z.any()), steps: z.array(z.object({ key: z.string(), kind: z.enum(['calendar.update', 'sheet.update', 'email.send']), label: z.string(), required: z.boolean(), excluded: z.boolean().optional(),
    recipient: z.object({ id: z.string(), name: z.string(), email: z.string(), role: z.enum(['participant', 'volunteer', 'organiser']) }).optional() })).max(500),
  drafts: z.object({ participant: Msg, volunteer: Msg }),
  acknowledgedConflicts: z.array(z.string()), calendarGuestUpdates: z.enum(['none', 'all']),
});

/** Approve = save this exact plan version + approval + create (or return) the run. Everything the client sent is re-validated against fresh data. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser(); limit(`approve:${user.id}`, 10);
    const { plan: raw, source = 'form', text } = z.object({ plan: PlanSchema, source: z.enum(['form', 'text']).optional(), text: z.string().max(400).optional() }).parse(await req.json());
    const plan = raw as Plan;
    const ctx = await loadLiveContext(user.id, params.id);
    if (!ctx.ready) throw new HttpError(409, ctx.reason, 'not_ready');
    if (plan.eventId !== ctx.event.id) throw new HttpError(400, 'This plan is for a different event.');

    // Never trust client recipients: each must be on the roster read just now.
    const roster = new Map(ctx.people.map(p => [p.email, p]));
    for (const s of plan.steps.filter(s => s.kind === 'email.send')) {
      const p = roster.get(s.recipient?.email ?? '');
      if (!p) throw new HttpError(400, 'A recipient is not on your roster. Refresh and review again.');
      s.recipient = p; s.label = `Email ${p.name}`;
    }
    // Fixed required steps must be exactly calendar + sheet.
    for (const k of ['calendar', 'sheet']) if (!plan.steps.some(s => s.key === k && !s.excluded)) throw new HttpError(400, 'Calendar and Sheet updates cannot be left out.');
    // Stale preview?  Fresh sources must still equal what the organiser reviewed.
    const b = plan.baseline, e = ctx.event;
    if (![[b.calendarStart, e.calendarStart], [b.calendarEnd, e.calendarEnd], [b.sheetStart, e.sheetStart], [b.sheetEnd, e.sheetEnd]].every(([a, c]) => sameInstant(a, c)))
      throw new HttpError(409, 'Your Calendar or Sheet changed since this preview. Refresh the preview and review it again.', 'stale');

    const conflicts = detectConflicts({ event: e, newStart: plan.proposed.newStart, newEnd: plan.proposed.newEnd, people: ctx.people, assignments: ctx.assignments, organiserBusy: ctx.busy, now: new Date().toISOString() });
    const now = new Date().toISOString();
    const approval = approve(plan, user.id, now);
    const db = adminClient();
    const { data: cr } = await db.from('change_requests').insert({ owner_id: user.id, event_id: ctx.ev.id, source, input_text: source === 'text' ? text ?? null : null }).select('id').single();
    const { data: pv } = await db.from('plan_versions').insert({ owner_id: user.id, change_request_id: cr!.id, event_id: ctx.ev.id, plan, plan_hash: planHash(plan) }).select('id').single();
    await db.from('approvals').insert({ owner_id: user.id, plan_version_id: pv!.id, plan_hash: approval.planHash });
    const { run, created } = await createRun(new PgRunStore(db, user.id), { plan, approval, conflicts, now });
    if (created) await db.from('execution_runs').update({ plan_version_id: pv!.id }).eq('id', run.id).eq('owner_id', user.id);
    await audit(user.id, ctx.ev.id, 'plan.approved', { runId: run.id, created, steps: plan.steps.length });
    return { runId: run.id, created };
  });
}
