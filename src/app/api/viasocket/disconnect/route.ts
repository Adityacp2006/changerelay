import { z } from 'zod';
import { handle } from '@/lib/server/api';
import { requireUser, adminClient } from '@/lib/server/supabase';
import { vs, uniqueIdentifier } from '@/lib/viasocket/client';
import { audit } from '@/lib/server/data';

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { kind } = z.object({ kind: z.enum(['calendar', 'sheets', 'gmail']) }).parse(await req.json());
    const db = adminClient();
    const { data: c } = await db.from('connections').select('id,auth_id').eq('owner_id', user.id).eq('kind', kind).maybeSingle();
    if (c) {
      await vs().user(uniqueIdentifier(user.id)).revokeConnection(c.auth_id).catch(() => undefined);   // best effort: always remove locally
      await db.from('connection_secrets').delete().eq('connection_id', c.id);
      await db.from('connections').delete().eq('id', c.id).eq('owner_id', user.id);
      await audit(user.id, null, 'connection.removed', { kind });
    }
    return { ok: true };
  });
}
