import 'server-only';
import { DateTime } from 'luxon';
import { ViaSocketError } from 'viasocket-apps';
import { ConnectorError, type Connector, type SendEmailInput } from '@/lib/core/connector';
import type { Assignment, BusySlot } from '@/lib/core/types';
import { config, op } from './config';
import { fill, pick } from './template';
import { vs } from './client';

export interface LinkedConnections { calendar?: { serviceId: string; scriptId: string }; sheets?: { serviceId: string; scriptId: string }; gmail?: { serviceId: string; scriptId: string } }
export interface EventLinks { calendarId: string; calendarEventId: string; spreadsheetId: string; scheduleTab: string; rosterTab: string; assignmentsTab?: string; eventCode: string; timezone: string; notifyGuests: boolean }

const TIMEOUT_MS = 20_000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new ConnectorError('The request timed out', 'uncertain')), TIMEOUT_MS);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

function classify(e: unknown): ConnectorError {
  if (e instanceof ConnectorError) return e;
  if (e instanceof ViaSocketError) {
    const text = `${e.message} ${JSON.stringify(e.body ?? '')}`.toLowerCase();
    if (e.status === 401 || e.status === 403 || /revoked|expired|not connected|invalid.*(token|auth)|reauthor/.test(text)) return new ConnectorError('The connection was revoked or expired', 'disconnected');
    if (e.status !== null && e.status >= 400 && e.status < 500) return new ConnectorError(e.message, 'definite');
    return new ConnectorError(e.message, 'uncertain');            // 5xx / unknown: the action may have happened
  }
  return new ConnectorError(e instanceof Error ? e.message : 'Unknown error', 'uncertain');
}

export function parseSheetTime(v: unknown, zone: string): string {
  const s = String(v ?? '').trim();
  let d = DateTime.fromISO(s, { setZone: true });
  if (!d.isValid || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) d = DateTime.fromISO(s.replace(' ', 'T'), { zone });   // no offset: read in the event zone
  if (!d.isValid) throw new ConnectorError(`The Sheet has an unreadable date/time: "${s}"`, 'definite');
  return d.toUTC().toISO()!;
}
export const formatSheetTime = (iso: string, zone: string) => DateTime.fromISO(iso).setZone(zone).toISO({ suppressMilliseconds: true })!;

export class ViaSocketConnector implements Connector {
  findSent?: Connector['findSent'];
  constructor(private conns: LinkedConnections, private l: EventLinks) {
    if (config.operations['gmail.findSent']?.event) {
      this.findSent = async ({ to, subject }) => {
        const r = await this.run('gmail.findSent', { to, subject });
        const items = (pick(r, config.operations['gmail.findSent'].output.items) as unknown[] | undefined) ?? [];
        const first = items[0]; const ref = first ? pick(first, config.operations['gmail.findSent'].output.messageRef) : undefined;
        return { found: items.length > 0, messageRef: ref ? String(ref) : undefined };
      };
    }
  }

  async run(name: string, vars: Record<string, unknown>): Promise<unknown> {
    const o = op(name);                                               // throws SetupError if unconfigured
    const c = this.conns[o.service];
    if (!c) throw new ConnectorError(`${config.services[o.service].label} isn't connected`, 'disconnected');
    try {
      const versionId = await vs().catalog.versionIdFor(c.serviceId, o.event);
      return await withTimeout(vs().runAction(c.scriptId, versionId, fill(o.input, { ...this.base(), ...vars }) as Record<string, unknown>));
    } catch (e) { throw classify(e); }
  }
  private base() { const l = this.l; return { calendarId: l.calendarId, calendarEventId: l.calendarEventId, spreadsheetId: l.spreadsheetId, sheetName: l.scheduleTab, rosterTab: l.rosterTab, assignmentsTab: l.assignmentsTab, eventId: l.eventCode, timezone: l.timezone, notifyGuests: l.notifyGuests }; }

  private times(res: unknown, name: string, parse: (v: unknown) => string) {
    const out = config.operations[name].output;
    const s = pick(res, out.start), e = pick(res, out.end);
    if (!s || !e) throw new ConnectorError('The response did not include start and end times', 'definite');
    return { start: parse(s), end: parse(e) };
  }
  private iso = (v: unknown) => { const d = DateTime.fromISO(String(v), { setZone: true }); if (!d.isValid) throw new ConnectorError(`Unreadable time "${v}"`, 'definite'); return d.toUTC().toISO()!; };

  async readCalendar() { return this.times(await this.run('calendar.getEvent', {}), 'calendar.getEvent', this.iso); }
  async writeCalendar(start: string, end: string, notifyGuests: boolean) {
    await this.run('calendar.updateEvent', { startIso: formatSheetTime(start, this.l.timezone), endIso: formatSheetTime(end, this.l.timezone), notifyGuests });
  }
  async readSheet(_eventId?: string) { return this.times(await this.run('sheets.findEventRow', {}), 'sheets.findEventRow', v => parseSheetTime(v, this.l.timezone)); }
  async writeSheet(_eventId: string, start: string, end: string) {
    await this.run('sheets.updateEventRow', { startValue: formatSheetTime(start, this.l.timezone), endValue: formatSheetTime(end, this.l.timezone) });
  }
  async sendEmail(i: SendEmailInput) {
    const r = await this.run('gmail.sendEmail', { to: i.to, subject: i.subject, body: i.body, idempotencyKey: i.idempotencyKey });
    const ref = pick(r, config.operations['gmail.sendEmail'].output.messageRef);
    return { messageRef: ref ? String(ref) : undefined };
  }

  /** Organiser's calendar entries around the proposed window. null = couldn't check. */
  async listBusy(fromIso: string, toIso: string): Promise<BusySlot[] | null> {
    try {
      const r = await this.run('calendar.listEvents', { timeMin: fromIso, timeMax: toIso });
      const o = config.operations['calendar.listEvents'].output;
      const items = (pick(r, o.items) as unknown[] | undefined) ?? [];
      return items.map(it => ({ id: String(pick(it, o.id)), title: String(pick(it, o.title) ?? 'Busy'), start: this.iso(pick(it, o.start)), end: this.iso(pick(it, o.end)) }))
        .filter(b => b.id !== this.l.calendarEventId);
    } catch { return null; }
  }

  async listRows(tab: string): Promise<Record<string, string>[]> {
    const r = await this.run('sheets.listRows', { sheetName: tab });
    const rows = (pick(r, config.operations['sheets.listRows'].output.rows) as unknown[] | undefined) ?? [];
    return rows.map(row => Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([k, v]) => [k.trim().toLowerCase(), String(v ?? '')])));
  }

  /** Roster and assignments keyed by the stable event_id column, not row position. */
  async loadPeople(): Promise<{ people: { name: string; email: string; role: 'participant' | 'volunteer' | 'organiser' }[]; assignments: Assignment[] }> {
    const roster = (await this.listRows(this.l.rosterTab)).filter(r => r.event_id === this.l.eventCode);
    const people = roster.filter(r => /^\S+@\S+\.\S+$/.test(r.email ?? '')).map(r => ({ name: r.name || r.email, email: r.email.trim().toLowerCase(), role: (['volunteer', 'organiser'].includes((r.role ?? '').toLowerCase()) ? r.role.toLowerCase() : 'participant') as 'participant' | 'volunteer' | 'organiser' }));
    let assignments: Assignment[] = [];
    if (this.l.assignmentsTab) {
      assignments = (await this.listRows(this.l.assignmentsTab)).filter(r => r.person && r.assignment_start && r.assignment_end).map(r => ({
        person: r.person, eventId: r.event_id, start: parseSheetTime(r.assignment_start, this.l.timezone), end: parseSheetTime(r.assignment_end, this.l.timezone), label: r.label || `Assignment for ${r.event_id}`,
      }));
    }
    return { people, assignments };
  }
}

/** Account-specific dropdown values (calendars, spreadsheets, tabs…). Uses viaSocket list-options; users never type IDs. */
export async function listOptionValues(userKey: string, conn: { serviceId: string; authId: string }, kind: string, parent?: string, search?: string) {
  const o = config.options[kind];
  if (!o || !o.fieldKey) throw new Error(`The "${kind}" dropdown isn't configured yet (config/viasocket-actions.json → options).`);
  const operation = op(o.operation);
  const versionId = await vs().catalog.versionIdFor(conn.serviceId, operation.event);
  const existing: Record<string, unknown> = {};
  const put = (dotted: string, v: unknown) => { const parts = dotted.split('.'); let cur = existing; parts.slice(0, -1).forEach(k => { cur = (cur[k] ??= {}) as Record<string, unknown>; }); cur[parts[parts.length - 1]] = v; };
  if (parent && o.parentKey) put(o.parentKey, parent);       // docs: existingFields nest exactly like inputData
  if (search) existing._searchText = search;
  const res = await vs().user(userKey).listOptions(versionId, { fieldKey: o.fieldKey, authId: conn.authId, existingFields: existing });
  return res.options;
}
