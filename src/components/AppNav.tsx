import { Shell } from './ui';
export function AppShell({ children }: { children: React.ReactNode }) {
  return <Shell mode="live" nav={<><a className="rounded-lg px-3 py-2 hover:bg-teal-50" href="/app">Events</a><a className="rounded-lg px-3 py-2 hover:bg-teal-50" href="/app/onboarding">Add event</a><a className="rounded-lg px-3 py-2 hover:bg-teal-50" href="/app/settings">Settings</a></>}>{children}</Shell>;
}
