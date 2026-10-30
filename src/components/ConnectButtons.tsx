'use client';
import { useState } from 'react';
import { api } from '@/lib/client/api';

const APPS = [['calendar', 'Google Calendar', 'Find and move your event'], ['sheets', 'Google Sheets', 'Read the roster, update the schedule'], ['gmail', 'Gmail', 'Send approved announcements']] as const;

/** Opens viaSocket's own consent popup. We never see a password or token; we only keep the connection id the popup returns. */
export function ConnectButtons({ connected, onChange, allowDisconnect }: { connected: Record<string, string>; onChange: () => void; allowDisconnect?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const connect = async (kind: string) => {
    setBusy(kind); setErr(null);
    try {
      const { token, serviceId } = await api<{ token: string; serviceId: string }>(`/api/viasocket/token?kind=${kind}`);
      const { connect } = await import('viasocket-apps/browser');
      const { authId } = await connect({ embedToken: token, serviceId });
      await api('/api/viasocket/connected', { method: 'POST', body: JSON.stringify({ kind, authId }) });
      onChange();
    } catch (e) {
      const x = e as Error & { code?: string };
      if (x.code === 'closed') return;                         // user closed the popup: nothing happened, nothing to report
      setErr(x.code === 'script' ? "The connection window couldn't load. Check for a content blocker and try again." : x.message);
    } finally { setBusy(null); }
  };
  const disconnect = async (kind: string) => { if (!confirm('Disconnect this app? Pending changes that need it will stop until you reconnect.')) return; await api('/api/viasocket/disconnect', { method: 'POST', body: JSON.stringify({ kind }) }); onChange(); };
  return (
    <div>
      {err && <p role="alert" className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[15px]">{err}</p>}
      <ul className="space-y-2">{APPS.map(([k, n, d]) => { const on = connected[k] === 'active'; return (
        <li key={k} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white p-3">
          <span><b>{n}</b> <span className="hint block sm:inline">{d}</span></span>
          <span className="flex items-center gap-2">{on && <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-sm font-semibold text-teal-800">Connected</span>}
            <button className={on ? 'btn-quiet !min-h-[40px] !py-1.5' : 'btn-primary !min-h-[40px] !py-1.5'} disabled={busy === k} onClick={() => connect(k)}>{busy === k ? 'Opening…' : on ? 'Reconnect' : 'Connect'}</button>
            {on && allowDisconnect && <button className="btn-danger !min-h-[40px] !py-1.5" onClick={() => disconnect(k)}>Disconnect</button>}</span></li>); })}</ul>
    </div>);
}
