import { z } from 'zod';
import { handle } from '@/lib/server/api';
import { requireUser, adminClient } from '@/lib/server/supabase';
import { isValidZone } from '@/lib/core/time';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const { data } = await adminClient().from('workspaces').select('name,timezone,notify_preferences').eq('owner_id', user.id).maybeSingle();
    return { email: user.email, workspace: data ?? { name: 'My workspace', timezone: 'Asia/Kolkata', notify_preferences: { calendarGuestUpdates: 'none' } } };
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const b = z.object({ timezone: z.string().refine(isValidZone).optional(), calendarGuestUpdates: z.enum(['none', 'all']).optional() }).parse(await req.json());
    const db = adminClient();
    const { data: cur } = await db.from('workspaces').select('id,notify_preferences').eq('owner_id', user.id).maybeSingle();
    const prefs = { ...(cur?.notify_preferences ?? {}), ...(b.calendarGuestUpdates ? { calendarGuestUpdates: b.calendarGuestUpdates } : {}) };
    const row = { owner_id: user.id, notify_preferences: prefs, ...(b.timezone ? { timezone: b.timezone } : {}) };
    const { error } = cur ? await db.from('workspaces').update(row).eq('id', cur.id).eq('owner_id', user.id) : await db.from('workspaces').insert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}
