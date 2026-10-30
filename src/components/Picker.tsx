'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';

interface Opt { label: string; value: string }

/** A readable dropdown filled from the user's own connected account. Nobody types an ID. */
export function Picker({ id, label, kind, parent, value, onChange, optional, hint }: { id: string; label: string; kind: string; parent?: string; value: string; onChange: (v: string, label: string) => void; optional?: boolean; hint?: string }) {
  const [opts, setOpts] = useState<Opt[] | null>(null); const [err, setErr] = useState<string | null>(null); const [q, setQ] = useState('');
  useEffect(() => {
    if (parent === '') { setOpts([]); return; }
    let live = true; setOpts(null); setErr(null);
    const t = setTimeout(() => {
      api<{ options: Opt[] }>(`/api/viasocket/options?kind=${kind}${parent ? `&parent=${encodeURIComponent(parent)}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`)
        .then(r => live && setOpts(r.options)).catch(e => live && setErr(e.message));
    }, q ? 300 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [kind, parent, q]);
  return (
    <div>
      <label className="label" htmlFor={id}>{label}{optional && <span className="font-normal text-mute"> (optional)</span>}</label>
      {hint && <p className="hint mb-1">{hint}</p>}
      <input className="input mb-2" aria-label={`Search ${label}`} placeholder="Type to search" value={q} onChange={e => setQ(e.target.value)} />
      {err ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[15px]">{err}</p> :
        <select id={id} className="input" value={value} disabled={!opts} onChange={e => onChange(e.target.value, opts?.find(o => o.value === e.target.value)?.label ?? '')}>
          <option value="">{opts ? (opts.length ? 'Choose…' : parent === '' ? 'Choose the previous item first' : 'Nothing found') : 'Loading…'}</option>
          {opts?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>}
    </div>);
}
