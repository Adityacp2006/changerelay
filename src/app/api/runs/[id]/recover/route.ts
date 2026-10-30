import { z } from 'zod';
import { handle, limit } from '@/lib/server/api';
import { requireUser, adminClient } from '@/lib/server/supabase';
import { PgRunStore } from '@/lib/server/pg-store';
import { AuthzError } from '@/lib/server/authz';
import { connectorFor, audit } from '@/lib/server/data';
import { recoverStep } from '@/lib/core/executor';

export const maxDuration = 60;

const Body = z.object({ stepKey: z.string().max(100), action: z.enum(['retry', 'recheck', 'mark_sent', 'resend']) });

/** Targeted recovery for one step. Verified steps are never rerun (enforced in the executor). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser(); limit(`recover:${user.id}`, 30);
    const { stepKey, action } = Body.parse(await req.json());
    const store = new PgRunStore(adminClient(), user.id);
    const run = await store.get(params.id);
    if (!run) throw new AuthzError();
    const { connector } = await connectorFor(user.id, run.eventId);
    if (!connector) return { run, busy: false };
    const res = await recoverStep(store, connector, run.id, stepKey, action);
    await audit(user.id, run.eventId, 'run.recovery', { runId: run.id, stepKey, action });
    return { run: res.run, busy: res.busy };
  });
}
