import { handle } from '@/lib/server/api';
import { requireUser, adminClient } from '@/lib/server/supabase';
import { PgRunStore } from '@/lib/server/pg-store';
import { AuthzError } from '@/lib/server/authz';

export const dynamic = 'force-dynamic';

/** Status survives page refresh because it is read from the database, not from the browser. */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const run = await new PgRunStore(adminClient(), user.id).get(params.id);
    if (!run) throw new AuthzError();
    const { leaseOwner, leaseUntil, ...safe } = run;      // internal lease details stay server-side
    void leaseOwner; void leaseUntil;
    return { run: safe };
  });
}
