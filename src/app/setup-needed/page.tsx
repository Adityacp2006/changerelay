import { Shell, Banner } from '@/components/ui';
export default function SetupNeeded() {
  return <Shell mode="none"><div className="mx-auto max-w-xl"><h1 className="text-3xl font-extrabold">This server needs setup</h1>
    <div className="mt-4"><Banner tone="warn" title="Supabase isn't configured">Add the Supabase variables from <code>.env.example</code>, run the migration, and restart. The README has the exact steps.</Banner></div>
    <p className="mt-4"><a className="btn-quiet" href="/sample">Try the sample workspace instead</a></p></div></Shell>;
}
