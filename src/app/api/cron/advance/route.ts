import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/server/supabase';
import { PgRunStore } from '@/lib/server/pg-store';
import { connectorFor } from '@/lib/server/data';
import { advanceRun } from '@/lib/core/executor';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Durable worker: picks up runs whose page was closed or whose request was interrupted. Scheduled by vercel.json. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = adminClient();
  const stale = new Date(Date.now() - 30_000).toISOString();
  const { data } = await db.from('execution_runs').select('id,owner_id,event_id,lease_until').in('status', ['queued', 'running']).lt('updated_at', stale).limit(10);
  const out: { id: string; status: string }[] = [];
  for (const r of data ?? []) {
    try {
      const { connector } = await connectorFor(r.owner_id, r.event_id);
      if (!connector) continue;
      const res = await advanceRun(new PgRunStore(db, r.owner_id), connector, r.id, { owner: 'cron', maxSteps: 25 });
      out.push({ id: r.id, status: res.run.status });
    } catch { out.push({ id: r.id, status: 'error' }); }
  }
  return NextResponse.json({ advanced: out });
}
