import { Shell } from '@/components/ui';
import { HeroDemo } from '@/components/HeroDemo';

const flow = [
  ['Link your event', 'Choose the Calendar event, the schedule row and the roster. You confirm every link.'],
  ['Say what changes', 'Use the form or type a sentence. ChangeRelay only fills in the form; you stay in charge.'],
  ['See the impact', 'A map shows what will change, who is affected and any conflicts it can actually check.'],
  ['Approve once', 'Calendar and Sheet are updated and read back. Emails go out only after that.'],
  ['Fix what failed', 'Every step has a status. Retry just the part that needs it.'],
];

export default function Home() {
  return (
    <Shell mode="none" nav={<><a className="rounded-lg px-3 py-2 hover:bg-teal-50" href="/sample">Sample workspace</a><a className="btn-quiet !min-h-[40px] !py-1.5" href="/login">Sign in</a></>}>
      <section className="grid items-center gap-8 py-6 md:grid-cols-[1.15fr_1fr] md:py-12">
        <div>
          <p className="mb-3 inline-flex rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-800">One approved change. A verified follow-through.</p>
          <h1 className="text-4xl font-extrabold sm:text-5xl">Reschedule once. Keep every tool in sync.</h1>
          <p className="mt-4 max-w-xl text-lg text-mute">ChangeRelay helps event organisers update Google Calendar, their schedule sheet, and participant emails—with a clear preview, conflict checks, and verified results.</p>
          <div className="mt-6 flex flex-wrap gap-3"><a className="btn-primary" href="/sample">Try interactive demo</a><a className="btn-quiet" href="/login">Sign in to live workspace</a></div>
          <p className="hint mt-3">The interactive demo uses fictional people and simulated services. It never connects to real accounts. Sign in opens the live workspace when your account is configured.</p>
          <ul className="mt-6 grid gap-2 text-sm sm:grid-cols-3">
            <li className="rounded-xl border border-amber-200 bg-amber-50 p-3"><b className="block text-warn">Catch conflicts</b><span>Surface known overlaps before approval.</span></li>
            <li className="rounded-xl border border-teal-100 bg-teal-50 p-3"><b className="block text-teal-800">Verify every update</b><span>Read Calendar and Sheet back.</span></li>
            <li className="rounded-xl border border-indigo-100 bg-indigo-50 p-3"><b className="block text-indigo-700">Recover safely</b><span>Retry failed steps without repeating verified work.</span></li>
          </ul>
        </div>
        <HeroDemo />
      </section>

      <section aria-labelledby="problem" className="py-8">
        <h2 id="problem" className="text-2xl font-bold">The problem is the follow-through</h2>
        <p className="mt-2 max-w-2xl text-mute">Moving a workshop takes a minute. Remembering everything that depended on it takes the rest of the evening: the Calendar, the volunteer sheet, the message to participants, and whether any of it actually worked.</p>
      </section>

      <section aria-labelledby="how" className="py-8">
        <h2 id="how" className="text-2xl font-bold">How it works</h2>
        <ol className="mt-4 grid gap-3 md:grid-cols-5">{flow.map(([t, d], i) => <li key={t} className="card p-4"><p className="font-display text-lg font-bold"><span className="text-teal-600">{i + 1}.</span> {t}</p><p className="mt-1 text-[15px] text-mute">{d}</p></li>)}</ol>
      </section>

      <section aria-labelledby="tools" className="py-8">
        <h2 id="tools" className="text-2xl font-bold">Works with three tools you already use</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          <li className="card p-4"><b>Google Calendar</b><p className="text-[15px] text-mute">Reads and updates the event's start and end.</p></li>
          <li className="card p-4"><b>Google Sheets</b><p className="text-[15px] text-mute">Finds your event by its ID, reads the roster, updates the schedule.</p></li>
          <li className="card p-4"><b>Gmail</b><p className="text-[15px] text-mute">Sends each person their own message, only after you approve.</p></li>
        </ul>
        <p className="hint mt-3">Connections are handled by viaSocket. ChangeRelay never sees your Google password or tokens.</p>
      </section>
    </Shell>
  );
}
