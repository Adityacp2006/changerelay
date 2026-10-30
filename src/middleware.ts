import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Refreshes the Supabase session cookie and keeps signed-out visitors out of /app. The sample workspace stays public. */
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    if (req.nextUrl.pathname.startsWith('/app')) return NextResponse.redirect(new URL('/setup-needed', req.url));
    return res;
  }
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: list => { list.forEach(({ name, value }) => req.cookies.set(name, value)); res = NextResponse.next({ request: req }); list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)); },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user && req.nextUrl.pathname.startsWith('/app')) {
    const login = new URL('/login', req.url); login.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return res;
}
export const config = { matcher: ['/app/:path*', '/login'] };
