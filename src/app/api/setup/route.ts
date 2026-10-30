import { handle } from '@/lib/server/api';
import { requireUser, adminClient, supabaseConfigured } from '@/lib/server/supabase';
import { setupGaps } from '@/lib/viasocket/config';
import { viasocketConfigured } from '@/lib/viasocket/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const { data } = await adminClient().from('connections').select('kind,status').eq('owner_id', user.id);
    return {
      connections: Object.fromEntries((data ?? []).map(c => [c.kind, c.status])),
      server: { supabase: supabaseConfigured(), viasocket: viasocketConfigured(), ai: !!process.env.LLM_API_KEY },
      actionGaps: setupGaps(),
    };
  });
}
