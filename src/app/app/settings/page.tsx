'use client';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppNav';
import { Banner, Spinner } from '@/components/ui';
import { api } from '@/lib/client/api';
import { ConnectButtons } from '@/components/ConnectButtons';

interface WS { email: string; workspace: { timezone: string; notify_preferences: { calendarGuestUpdates?: 'none' | 'all' } } }

export default function Settings() {
  const [w, setW] = useState<WS | null>(null); const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [conns, setConns] = useState<Record<string, string>>({}); const [confirm, setConfirm] = useState('');
  const load = () => { api<WS>('/api/workspace').then(setW).catch(e => setMsg({ tone: 'bad', text: e.message })); api<{ connections: Record<string, string> }>('/api/setup').then(s => setConns(s.connections)).catch(() => undefined); };
  useEffect(load, []);
  const save = async (patch: object) => { try { await api('/api/workspace', { method: 'PATCH', body: JSON.stringify(patch) }); setMsg({ tone: 'ok', text: 'Saved.' }); load(); } catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); } };
  const remove = async () => { try { await api('/api/account', { method: 'DELETE', body: JSON.stringify({ confirm: 'DELETE' }) }); location.href = '/'; } catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); } };
  return (
    <AppShell><h1 className="text-3xl font-extrabold">Settings</h1>
      {msg && <div className="mt-3"><Banner tone={msg.tone}>{msg.text}</Banner></div>}
      {!w ? <Spinner /> : <div className="mt-6 space-y-6">
        <section className="card p-4 sm:p-5" aria-labelledby="c-h"><h2 id="c-h" className="text-xl font-bold">Connections</h2><p className="hint">Calendar is needed to read and move the event. Sheets is needed for the schedule and roster. Gmail is needed to send announcements.</p>
          <div className="mt-3"><ConnectButtons connected={conns} onChange={load} allowDisconnect /></div></section>
        <section className="card p-4 sm:p-5" aria-labelledby="t-h"><h2 id="t-h" className="text-xl font-bold">Time and notifications</h2>
          <label className="label mt-3" htmlFor="tz">Default timezone for new events</label>
          <input id="tz" className="input max-w-sm" defaultValue={w.workspace.timezone} onBlur={e => e.target.value !== w.workspace.timezone && save({ timezone: e.target.value })} />
          <p className="hint mt-1">An IANA name such as Asia/Kolkata.</p>
          <label className="mt-4 flex items-start gap-2"><input type="checkbox" className="mt-1 h-5 w-5 accent-teal-600" checked={w.workspace.notify_preferences.calendarGuestUpdates === 'all'} onChange={e => save({ calendarGuestUpdates: e.target.checked ? 'all' : 'none' })} /><span>Let Google Calendar also notify invited guests<span className="hint block">Off by default so people don't get a Calendar update and an email for the same change. The preview always shows who hears what.</span></span></label></section>
        <section className="card p-4 sm:p-5" aria-labelledby="p-h"><h2 id="p-h" className="text-xl font-bold">Privacy and help</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px]"><li><b>What we read:</b> the Calendar event you link, the schedule row and roster in the Sheet you pick, and (to check conflicts) nearby events on your Calendar.</li>
            <li><b>What we change:</b> the linked event's start and end, the linked Sheet row's start and end, and the emails you approve, sent from your Gmail.</li>
            <li><b>What we store:</b> your event setup, the roster names and emails, your change history and its outcomes. We never store Google passwords or tokens; viaSocket holds the connection.</li>
            <li>Emails go to each person separately; nobody sees the others.</li></ul>
          <p className="mt-2 text-[15px]">Template Sheets: <a className="underline" href="/templates/events.csv">events</a>, <a className="underline" href="/templates/participants.csv">participants</a>, <a className="underline" href="/templates/assignments.csv">assignments</a>.</p></section>
        <section className="card border-bad/30 p-4 sm:p-5" aria-labelledby="d-h"><h2 id="d-h" className="text-xl font-bold">Delete my account and data</h2>
          <p className="hint">This disconnects your apps and permanently deletes your events, rosters and history. It does not undo anything already changed in Calendar, Sheets or email.</p>
          <label className="label mt-3" htmlFor="del">Type DELETE to confirm</label><input id="del" className="input max-w-xs" value={confirm} onChange={e => setConfirm(e.target.value)} />
          <button className="btn-danger mt-3" disabled={confirm !== 'DELETE'} onClick={remove}>Delete everything</button></section></div>}
    </AppShell>);
}
