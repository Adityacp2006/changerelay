import { handle, limit } from '@/lib/server/api';
import { requireUser, adminClient } from '@/lib/server/supabase';
import { PgRunStore } from '@/lib/server/pg-store';
import { AuthzError } from '@/lib/server/authz';
import { connectorFor } from '@/lib/server/data';
import { advanceRun } from '@/lib/core/executor';

export const maxDuration = 60;

/** Executes ready steps under a database lease. Safe to call repeatedly (client polling, cron, or a second tab). */
export async function POST(_: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser(); limit(`advance:${user.id}`, 60);
    const store = new PgRunStore(adminClient(), user.id);
    const run = await store.get(params.id);
    if (!run) throw new AuthzError();
    const { connector } = await connectorFor(user.id, run.eventId);
    if (!connector) return { run, busy: false, note: 'This event is not fully linked.' };
    const res = await advanceRun(store, connector, run.id, { maxSteps: 25 });
    return { run: res.run, busy: res.busy };
  });
}
