'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Shell, Banner } from '@/components/ui';
import { browserSupabase } from '@/lib/client/supabase';

function LoginForm() {
  const params = useSearchParams();
  const next = params.get('next') ?? '/app';
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ tone: 'bad' | 'ok'; text: string } | null>(params.get('error') ? { tone: 'bad', text: 'That sign-in link has expired. Request a new one.' } : null);
  const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const sb = browserSupabase();
    const redirect = `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error, data } = mode === 'in' ? await sb.auth.signInWithPassword({ email, password }) : await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
    setBusy(false);
    if (error) return setMsg({ tone: 'bad', text: error.message });
    if (mode === 'up' && !data.session) return setMsg({ tone: 'ok', text: 'Check your email to confirm your account, then sign in.' });
    location.href = next;
  };
  const magic = async () => {
    if (!email) return setMsg({ tone: 'bad', text: 'Enter your email first.' });
    setBusy(true);
    const { error } = await browserSupabase().auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
    setBusy(false);
    setMsg(error ? { tone: 'bad', text: error.message } : { tone: 'ok', text: 'Check your email for a sign-in link.' });
  };
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl font-extrabold">{mode === 'in' ? 'Welcome back' : 'Create your account'}</h1>
      {!configured && <div className="mt-3"><Banner tone="warn" title="Sign-in isn't set up on this server">The owner needs to add Supabase settings. You can still <a className="font-semibold underline" href="/sample">try the sample workspace</a>.</Banner></div>}
      <form onSubmit={submit} className="card mt-4 space-y-4 p-5">
        <div><label className="label" htmlFor="em">Email</label><input id="em" type="email" autoComplete="email" required className="input" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div><label className="label" htmlFor="pw">Password</label><input id="pw" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={8} required className="input" value={password} onChange={e => setPassword(e.target.value)} />{mode === 'up' && <p className="hint mt-1">At least 8 characters.</p>}</div>
        {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
        <button className="btn-primary w-full" disabled={busy || !configured}>{busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="btn-quiet w-full" disabled={busy || !configured} onClick={magic}>Email me a sign-in link instead</button>
      </form>
      <p className="mt-4 text-center text-[15px]">{mode === 'in' ? 'New here?' : 'Already have an account?'} <button className="font-semibold text-teal-700 underline" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'Create an account' : 'Sign in'}</button></p>
    </div>
  );
}
export default function LoginPage() { return <Shell mode="none"><Suspense><LoginForm /></Suspense></Shell>; }
