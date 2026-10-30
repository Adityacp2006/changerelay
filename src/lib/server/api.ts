import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthzError } from './authz';
import { UnauthenticatedError, NotConfiguredError } from './supabase';
import { rateLimit } from './rate-limit';
import { ConnectorError } from '@/lib/core/connector';
import { ActiveRunError } from '@/lib/core/store';
import { ApprovalError } from '@/lib/core/executor';
import { SetupError } from '@/lib/viasocket/config';

export class HttpError extends Error { constructor(public status: number, message: string, public code?: string) { super(message); } }

export function limit(key: string, max: number, windowMs = 60_000) {
  const r = rateLimit(key, max, windowMs);
  if (!r.ok) throw new HttpError(429, `Too many requests. Try again in ${r.retryAfter}s.`, 'rate_limited');
}

/** Uniform error mapping. Never leaks stack traces, credentials or provider bodies. */
export async function handle(fn: () => Promise<unknown>) {
  try { return NextResponse.json(await fn()); }
  catch (e) {
    if (e instanceof NotConfiguredError) return NextResponse.json({ error: e.message, code: 'not_configured' }, { status: 503 });
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: e.message, code: 'unauthenticated' }, { status: 401 });
    if (e instanceof AuthzError) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 });
    if (e instanceof HttpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    if (e instanceof ZodError) return NextResponse.json({ error: 'Some details are missing or invalid.', code: 'invalid', issues: e.issues.map(i => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 });
    if (e instanceof ActiveRunError) return NextResponse.json({ error: e.message, code: 'run_active', runId: e.existingRunId }, { status: 409 });
    if (e instanceof ApprovalError) return NextResponse.json({ error: e.message, code: 'approval' }, { status: 409 });
    if (e instanceof SetupError) return NextResponse.json({ error: e.message, code: 'needs_setup' }, { status: 503 });
    if (e instanceof ConnectorError) return NextResponse.json({ error: e.kind === 'disconnected' ? 'A connected account needs to be reconnected in Settings.' : 'A connected app did not respond as expected.', code: e.kind }, { status: e.kind === 'disconnected' ? 409 : 502 });
    console.error('[api] unexpected error', e instanceof Error ? e.name : typeof e);   // name only: no messages that might hold personal data
    return NextResponse.json({ error: 'Something went wrong on our side. Your information was kept; please try again.', code: 'internal' }, { status: 500 });
  }
}
