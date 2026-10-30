import { z } from 'zod';
import { handle } from '@/lib/server/api';
import { requireUser, adminClient } from '@/lib/server/supabase';
import { loadEventRow, audit } from '@/lib/server/data';

const L = z.object({ id: z.string().min(1).max(300), second: z.string().max(300).optional(), label: z.string().max(200).optional() });
const Body = z.object({ calendar: L.extend({ second: z.string().min(1) }), schedule: L.extend({ second: z.string().min(1) }), roster: L.extend({ second: z.string().min(1) }), assignments: L.extend({ second: z.string().min(1) }).optional(), timezone: z.string().optional() });

/** Save organiser-confirmed links. Only explicit choices from dropdowns are stored. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser(); const ev = await loadEventRow(user.id, params.id);
    const b = Body.parse(await req.json()); const db = adminClient();
    const rows = [
      { kind: 'calendar_event', external_id: b.calendar.id, secondary_id: b.calendar.second, label: b.calendar.label },
      { kind: 'schedule_sheet', external_id: b.schedule.id, secondary_id: b.schedule.second, label: b.schedule.label },
      { kind: 'roster_sheet', external_id: b.roster.id, secondary_id: b.roster.second, label: b.roster.label },
      ...(b.assignments ? [{ kind: 'assignments_sheet', external_id: b.assignments.id, secondary_id: b.assignments.second, label: b.assignments.label }] : []),
    ].map(r => ({ ...r, owner_id: user.id, event_id: ev.id, confirmed_at: new Date().toISOString() }));
    const { error } = await db.from('linked_resources').upsert(rows, { onConflict: 'event_id,kind' });
    if (error) throw new Error(error.message);
    if (!b.assignments) await db.from('linked_resources').delete().eq('event_id', ev.id).eq('kind', 'assignments_sheet').eq('owner_id', user.id);
    await db.from('events').update({ setup_state: 'ready', ...(b.timezone ? { timezone: b.timezone } : {}) }).eq('id', ev.id).eq('owner_id', user.id);
    await audit(user.id, ev.id, 'event.links_saved');
    return { ok: true };
  });
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser(); const ev = await loadEventRow(user.id, params.id);
    const { data } = await adminClient().from('linked_resources').select('kind,external_id,secondary_id,label').eq('event_id', ev.id).eq('owner_id', user.id);
    return { event: ev, links: data ?? [] };
  });
}
