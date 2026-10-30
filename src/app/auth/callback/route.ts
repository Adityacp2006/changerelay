import { NextResponse } from 'next/server';
import { sessionClient } from '@/lib/server/supabase';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/app';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/app';      // no open redirects
  if (code) {
    const { error } = await sessionClient().auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, url.origin));
  }
  return NextResponse.redirect(new URL('/login?error=link', url.origin));
}
