import { z } from 'zod';
import { handle, limit, HttpError } from '@/lib/server/api';
import { requireUser, adminClient } from '@/lib/server/supabase';
import { vs, uniqueIdentifier, serviceIdFor } from '@/lib/viasocket/client';
import { config } from '@/lib/viasocket/config';
import { audit } from '@/lib/server/data';

const Body = z.object({ kind: z.enum(['calendar', 'sheets', 'gmail']), authId: z.string().min(3).max(200) });

/** Called after the connect popup returns an authId. Ownership is verified with viaSocket before anything is saved or enabled. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(); limit(`connected:${user.id}`, 20);
    const { kind, authId } = Body.parse(await req.json());
    const scope = vs().user(uniqueIdentifier(user.id));
    const serviceId = await serviceIdFor(config.services[kind].slug);
    // Ownership check: the authId must appear in THIS user's connection list (viaSocket isolates by unique identifier).
    const mine = await scope.listConnections();
    if (!JSON.stringify(mine).includes(authId)) throw new HttpError(403, 'That connection does not belong to your account.', 'not_owner');
    const scriptId = (await scope.findEnabled(serviceId)) ?? (await scope.enable(serviceId, authId)).scriptId;
    const db = adminClient();
    const { data: conn, error } = await db.from('connections').upsert({ owner_id: user.id, kind, service_id: serviceId, auth_id: authId, status: 'active' }, { onConflict: 'owner_id,kind' }).select('id').single();
    if (error) throw new Error(error.message);
    await db.from('connection_secrets').upsert({ connection_id: conn.id, owner_id: user.id, script_id: scriptId }, { onConflict: 'connection_id' });
    await audit(user.id, null, 'connection.added', { kind });
    return { ok: true };
  });
}
