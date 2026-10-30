import 'server-only';
import { adminClient } from './supabase';
import { assertOwns } from './authz';
import { ViaSocketConnector, type EventLinks, type LinkedConnections } from '@/lib/viasocket/connector';
import type { EventRecord, Person, Assignment } from '@/lib/core/types';

export async function loadEventRow(userId: string, eventId: string) {
  const { data } = await adminClient().from('events').select('*').eq('id', eventId).maybeSingle();
  assertOwns(userId, data); return data;
}

export async function loadConnections(userId: string): Promise<{ conns: LinkedConnections; status: Record<string, string> }> {
  const db = adminClient();
  const { data: rows } = await db.from('connections').select('id,kind,service_id,status').eq('owner_id', userId);
  const { data: secrets } = await db.from('connection_secrets').select('connection_id,script_id').eq('owner_id', userId);
  const conns: LinkedConnections = {}; const status: Record<string, string> = {};
  for (const r of rows ?? []) {
    status[r.kind] = r.status;
    const s = secrets?.find(x => x.connection_id === r.id);
    if (r.status === 'active' && s) conns[r.kind as keyof LinkedConnections] = { serviceId: r.service_id, scriptId: s.script_id };
  }
  return { conns, status };
}

export async function loadLinks(userId: string, ev: { id: string; event_code: string; timezone: string }, notifyGuests: boolean): Promise<EventLinks | null> {
  const { data } = await adminClient().from('linked_resources').select('*').eq('event_id', ev.id).eq('owner_id', userId);
  const by = (k: string) => data?.find(r => r.kind === k);
  const cal = by('calendar_event'), sched = by('schedule_sheet'), roster = by('roster_sheet'), asg = by('assignments_sheet');
  if (!cal || !sched || !roster) return null;
  return { calendarId: cal.external_id, calendarEventId: cal.secondary_id!, spreadsheetId: sched.external_id, scheduleTab: sched.secondary_id!, rosterTab: roster.secondary_id!, assignmentsTab: asg?.secondary_id ?? undefined, eventCode: ev.event_code, timezone: ev.timezone, notifyGuests };
}

export async function connectorFor(userId: string, eventId: string) {
  const ev = await loadEventRow(userId, eventId);
  const { data: ws } = await adminClient().from('workspaces').select('notify_preferences').eq('owner_id', userId).maybeSingle();
  const notify = ws?.notify_preferences?.calendarGuestUpdates === 'all';
  const [{ conns, status }, links] = await Promise.all([loadConnections(userId), loadLinks(userId, ev, notify)]);
  return { ev, conns, status, links, connector: links ? new ViaSocketConnector(conns, links) : null, notify };
}

/** Fresh, live view of an event: reads Calendar + Sheet now; roster/assignments from the Sheet. */
export async function loadLiveContext(userId: string, eventId: string) {
  const { ev, connector, links, status, notify } = await connectorFor(userId, eventId);
  if (!connector || !links) return { ev, ready: false as const, status, reason: 'Finish linking this event to a Calendar event, a schedule row and a roster.' };
  const [cal, sheet] = await Promise.all([connector.readCalendar(), connector.readSheet(ev.event_code)]);
  const event: EventRecord = { id: ev.id, title: ev.title, timezone: ev.timezone, location: ev.location ?? undefined, calendarStart: cal.start, calendarEnd: cal.end, sheetStart: sheet.start, sheetEnd: sheet.end };
  const { people: raw, assignments } = await connector.loadPeople();
  const people: Person[] = raw.map((p, i) => ({ id: `${p.email.split('@')[0].replace(/\W/g, '')}${i}`, ...p }));
  const busy = await connector.listBusy(new Date(Date.parse(cal.start) - 864e5).toISOString(), new Date(Date.parse(cal.end) + 864e5 * 7).toISOString());
  return { ev, ready: true as const, status, event, people, assignments: (assignments as Assignment[]).map(a => a.eventId === ev.event_code ? { ...a, eventId: ev.id } : a), busy, connector, notify };
}

export async function audit(ownerId: string, eventId: string | null, action: string, detail: Record<string, unknown> = {}) {
  await adminClient().from('audit_log').insert({ owner_id: ownerId, event_id: eventId, action, detail });
}
