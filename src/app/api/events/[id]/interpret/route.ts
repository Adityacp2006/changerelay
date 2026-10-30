import { z } from 'zod';
import { handle, limit } from '@/lib/server/api';
import { requireUser, adminClient } from '@/lib/server/supabase';
import { loadLiveContext } from '@/lib/server/data';
import { interpretWithLLM, parseRequestHeuristic, resolveInterpretation } from '@/lib/core/interpret';
import type { EventRecord } from '@/lib/core/types';

const Body = z.object({ text: z.string().trim().min(3).max(400) });

/** Natural-language request → structured proposal. Never executes anything; the result only pre-fills the preview form. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser(); limit(`interpret:${user.id}`, 20);
    const { text } = Body.parse(await req.json());
    const { data: rows } = await adminClient().from('events').select('id').eq('owner_id', user.id).eq('setup_state', 'ready').limit(25);
    const loaded = await Promise.allSettled((rows ?? []).map(r => loadLiveContext(user.id, r.id)));
    const events = loaded.flatMap(r => r.status === 'fulfilled' && r.value.ready ? [r.value.event as EventRecord] : []);
    let interpreted = null; let usedAI = false;
    if (process.env.LLM_API_KEY) {
      interpreted = await interpretWithLLM(text, events.map(e => e.title), { apiKey: process.env.LLM_API_KEY, model: process.env.LLM_MODEL ?? 'claude-sonnet-4-6', baseUrl: process.env.LLM_BASE_URL, signal: AbortSignal.timeout(15000) }).catch(() => null);
      usedAI = !!interpreted;
    }
    interpreted ??= parseRequestHeuristic(text);
    if (!interpreted) return { status: 'fallback', message: "I couldn't turn that into a change. Use the form below instead.", usedAI };
    const r = resolveInterpretation(interpreted, events, new Date().toISOString());
    return { ...r, usedAI, currentEventId: params.id };
  });
}
