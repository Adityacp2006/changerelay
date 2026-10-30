import { z } from 'zod';
import { handle, limit, HttpError } from '@/lib/server/api';
import { requireUser, adminClient } from '@/lib/server/supabase';
import { isValidZone } from '@/lib/core/time';
import { audit } from '@/lib/server/data';

export const dynamic = 'force-dynamic';

const Create = z.object({
  title: z.string().trim().min(2).max(120),
  eventCode: z.string().trim().regex(/^[A-Za-z0-9_-]{2,64}$/, 'Use letters, numbers, dashes or underscores'),
  timezone: z.string().refine(isValidZone, 'Pick a valid timezone'),
  location: z.string().trim().max(160).optional(),
});

export async function GET() {
  return handle(async () => {
    const user = await requireUser(); const db = adminClient();
    const { data: events } = await db.from('events').select('id,title,event_code,timezone,location,setup_state,created_at').eq('owner_id', user.id).order('created_at', { ascending: false });
    const { data: runs } = await db.from('execution_runs').select('id,event_id,status,created_at').eq('owner_id', user.id).order('created_at', { ascending: false }).limit(50);
    const { data: conns } = await db.from('connections').select('kind,status').eq('owner_id', user.id);
    return { events: events ?? [], runs: runs ?? [], connections: Object.fromEntries((conns ?? []).map(c => [c.kind, c.status])) };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(); limit(`events:${user.id}`, 30);
    const body = Create.parse(await req.json()); const db = adminClient();
    const { data: ws, error: we } = await db.from('workspaces').upsert({ owner_id: user.id, timezone: body.timezone }, { onConflict: 'owner_id', ignoreDuplicates: true }).select('id').maybeSingle();
    const workspaceId = ws?.id ?? (await db.from('workspaces').select('id').eq('owner_id', user.id).single()).data!.id;
    if (we && !workspaceId) throw new Error(we.message);
    const { data, error } = await db.from('events').insert({ owner_id: user.id, workspace_id: workspaceId, event_code: body.eventCode, title: body.title, timezone: body.timezone, location: body.location ?? null }).select('id').single();
    if (error) { if (error.code === '23505') throw new HttpError(409, 'You already have an event with that ID.', 'duplicate'); throw new Error(error.message); }
    await audit(user.id, data.id, 'event.created');
    return { id: data.id };
  });
}
