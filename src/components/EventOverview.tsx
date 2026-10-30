import type { Assignment, EventRecord, Person } from '@/lib/core/types';
import { formatRange, zoneLabel } from '@/lib/core/time';

export function EventOverview({ event, people, assignments, links }: { event: EventRecord; people: Person[]; assignments: Assignment[]; links?: { label: string; value: string }[] }) {
  const z = event.timezone;
  const parts = people.filter(p => p.role === 'participant'), vols = people.filter(p => p.role === 'volunteer');
  return (
    <section aria-labelledby="ov-h" className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-mute">Event summary</p><h2 id="ov-h" className="mt-1 text-xl font-bold">{event.title}</h2></div>
        <p className="rounded-xl bg-stone-50 px-3 py-2 text-sm"><b>{formatRange(event.calendarStart, event.calendarEnd, z)}</b><span className="ml-2 text-mute">{zoneLabel(z, event.calendarStart)}</span></p>
      </div>
      <details className="mt-3 rounded-xl bg-stone-50 px-3 py-2">
        <summary className="cursor-pointer font-semibold">Event details, people and linked records</summary>
        <dl className="mt-3 grid gap-x-8 gap-y-3 text-[15px] sm:grid-cols-2">
          <div><dt className="font-semibold">Calendar says</dt><dd>{formatRange(event.calendarStart, event.calendarEnd, z)}</dd></div>
          <div><dt className="font-semibold">Schedule sheet says</dt><dd>{formatRange(event.sheetStart, event.sheetEnd, z)}</dd></div>
          <div><dt className="font-semibold">Timezone</dt><dd>{zoneLabel(z, event.calendarStart)}</dd></div>
          {event.location && <div><dt className="font-semibold">Location</dt><dd>{event.location}</dd></div>}
          {links?.map(l => <div key={l.label}><dt className="font-semibold">{l.label}</dt><dd className="break-words">{l.value}</dd></div>)}
        </dl>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><h3 className="font-bold">Participants ({parts.length})</h3>{parts.length ? <p className="text-[15px] text-mute">{parts.map(p => p.name).join(', ')}</p> : <p className="text-[15px] text-mute">None found for this event yet.</p>}</div>
          <div><h3 className="font-bold">Volunteers ({vols.length})</h3>{vols.length ? <p className="text-[15px] text-mute">{vols.map(p => p.name).join(', ')}</p> : <p className="text-[15px] text-mute">None.</p>}</div>
        </div>
        {assignments.length > 0 && <>
          <h3 className="mt-4 font-bold">Known volunteer assignments</h3>
          <ul className="mt-1 space-y-1 text-[15px]">{assignments.map((a, i) => <li key={i}><b>{a.person}</b>: {a.label ?? a.eventId}, {formatRange(a.start, a.end, z)}</li>)}</ul></>}
      </details>
    </section>
  );
}
