import { z } from 'zod';
import { handle } from '@/lib/server/api';
import { requireUser, adminClient } from '@/lib/server/supabase';
import { vs, uniqueIdentifier, viasocketConfigured } from '@/lib/viasocket/client';

/** Permanent removal: revokes viaSocket grants, then deletes the auth user. Every table cascades from auth.users. */
export async function DELETE(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    z.object({ confirm: z.literal('DELETE') }).parse(await req.json());
    const db = adminClient();
    if (viasocketConfigured()) {
      const { data } = await db.from('connections').select('auth_id').eq('owner_id', user.id);
      for (const c of data ?? []) await vs().user(uniqueIdentifier(user.id)).revokeConnection(c.auth_id).catch(() => undefined);
    }
    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}
