import { handle, limit } from '@/lib/server/api';
import { requireUser, adminClient } from '@/lib/server/supabase';
import { loadLiveContext } from '@/lib/server/data';

export const dynamic = 'force-dynamic';

/** Fresh read of Calendar + Sheet + roster for one event, plus recent runs. */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser(); limit(`ctx:${user.id}`, 60);
    const ctx = await loadLiveContext(user.id, params.id);
    const { data: runs } = await adminClient().from('execution_runs').select('id,status,created_at,plan').eq('event_id', params.id).eq('owner_id', user.id).order('created_at', { ascending: false }).limit(10);
    const recent = (runs ?? []).map(r => ({ id: r.id, status: r.status, createdAt: r.created_at, newStart: r.plan?.proposed?.newStart, newEnd: r.plan?.proposed?.newEnd }));
    if (!ctx.ready) return { mode: 'live', ready: false, reason: ctx.reason, connections: ctx.status, event: { id: ctx.ev.id, title: ctx.ev.title, timezone: ctx.ev.timezone }, runs: recent };
    return { mode: 'live', ready: true, connections: ctx.status, event: ctx.event, people: ctx.people, assignments: ctx.assignments, busy: ctx.busy, calendarGuestUpdates: ctx.notify ? 'all' : 'none', runs: recent };
  });
}
