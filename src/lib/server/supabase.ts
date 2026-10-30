import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const supabaseConfigured = () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Session-aware client (reads the signed-in user from cookies). */
export function sessionClient() {
  const store = cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: list => { try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* called from a Server Component: middleware refreshes */ } },
    },
  });
}

let admin: SupabaseClient | null = null;
/** Service-role client. Bypasses RLS: every caller must verify ownership first. */
export function adminClient(): SupabaseClient {
  return admin ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

export class NotConfiguredError extends Error { status = 503; constructor() { super('This server is not set up yet.'); } }
export class UnauthenticatedError extends Error { status = 401; constructor() { super('Please sign in.'); } }

/** The verified user id (validated with Supabase Auth, not just decoded from the cookie). */
export async function requireUser(): Promise<{ id: string; email: string }> {
  if (!supabaseConfigured()) throw new NotConfiguredError();
  const { data, error } = await sessionClient().auth.getUser();
  if (error || !data.user) throw new UnauthenticatedError();
  return { id: data.user.id, email: data.user.email ?? '' };
}
