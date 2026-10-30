import { DateTime } from 'luxon';
import { ConnectorError, type Connector, type SendEmailInput } from './connector';
import { localToUtc } from './time';
import type { Assignment, BusySlot, EventRecord, Person } from './types';

export const SAMPLE_ZONE = 'Asia/Kolkata';
export const SAMPLE_EVENT_ID = 'evt_ai_workshop';

export interface SampleWorld {
  event: EventRecord; people: Person[]; assignments: Assignment[]; busy: BusySlot[];
}

/** Fictional data only. Dates are relative to `now` so "tomorrow's AI workshop" always works. */
export function buildSampleWorld(now: string = new Date().toISOString()): SampleWorld {
  const tomorrow = DateTime.fromISO(now).setZone(SAMPLE_ZONE).plus({ days: 1 }).toISODate()!;
  const at = (t: string) => localToUtc(tomorrow, t, SAMPLE_ZONE);
  const event: EventRecord = {
    id: SAMPLE_EVENT_ID, title: 'AI Workshop: Build Your First Chatbot', timezone: SAMPLE_ZONE, location: 'Seminar Hall B (sample)',
    calendarStart: at('14:00'), calendarEnd: at('15:00'), sheetStart: at('14:00'), sheetEnd: at('15:00'),
  };
  const mk = (id: string, name: string, role: Person['role']): Person => ({ id, name, role, email: `${id}@example.com` });
  const people: Person[] = [
    mk('asha', 'Asha Verma', 'participant'), mk('kabir', 'Kabir Nair', 'participant'), mk('meera', 'Meera Iyer', 'participant'),
    mk('dev', 'Dev Patel', 'participant'), mk('ishita', 'Ishita Rao', 'participant'),
    mk('rohan', 'Rohan Desai', 'volunteer'), mk('tara', 'Tara Menon', 'volunteer'),
  ];
  const assignments: Assignment[] = [
    { person: 'Rohan Desai', eventId: SAMPLE_EVENT_ID, start: at('14:00'), end: at('15:00'), label: 'AI Workshop: registration desk' },
    { person: 'Tara Menon', eventId: SAMPLE_EVENT_ID, start: at('14:00'), end: at('15:00'), label: 'AI Workshop: demo support' },
    { person: 'Rohan Desai', eventId: 'evt_design_meetup', start: at('16:30'), end: at('17:30'), label: 'Design Meetup: check-in' },
  ];
  return { event, people, assignments, busy: [] };
}

export type Scenario = 'happy' | 'partial_failure';

export interface SimState {
  calendar: { start: string; end: string }; sheet: { start: string; end: string };
  sent: Record<string, { to: string; ref: string }>;
  /** Faults that have already fired (each fires once so retry can succeed). */
  fired: string[];
  scenario: Scenario;
}

/** Simulated provider. NEVER contacts any real service. Used only by the Sample workspace and tests. */
export class SimConnector implements Connector {
  constructor(public state: SimState, private onChange: (s: SimState) => void = () => {}, private latencyMs = 0) {}
  static fresh(world: SampleWorld, scenario: Scenario): SimState {
    return { calendar: { start: world.event.calendarStart, end: world.event.calendarEnd }, sheet: { start: world.event.sheetStart, end: world.event.sheetEnd }, sent: {}, fired: [], scenario };
  }
  private async tick() { if (this.latencyMs) await new Promise(r => setTimeout(r, this.latencyMs)); }
  private fireOnce(id: string) { if (this.state.scenario !== 'partial_failure' || this.state.fired.includes(id)) return false; this.state.fired.push(id); this.onChange(this.state); return true; }
  async readCalendar() { await this.tick(); return { ...this.state.calendar }; }
  async writeCalendar(start: string, end: string) { await this.tick(); this.state.calendar = { start, end }; this.onChange(this.state); }
  async readSheet() { await this.tick(); return { ...this.state.sheet }; }
  async writeSheet(_id: string, start: string, end: string) {
    await this.tick();
    if (this.fireOnce('sheet-rate-limit')) throw new ConnectorError('Google Sheets is busy (rate limit). Try again in a moment.', 'definite');
    this.state.sheet = { start, end }; this.onChange(this.state);
  }
  async sendEmail(i: SendEmailInput) {
    await this.tick();
    if (this.state.sent[i.idempotencyKey]) return { messageRef: this.state.sent[i.idempotencyKey].ref };
    if (i.to.startsWith('kabir@') && this.fireOnce('gmail-timeout')) {
      this.state.sent[i.idempotencyKey] = { to: i.to, ref: 'sim-msg-' + i.to.split('@')[0] };   // it WAS sent; we just never heard back
      this.onChange(this.state);
      throw new ConnectorError('Gmail did not respond in time', 'uncertain');
    }
    if (i.to.startsWith('dev@') && this.fireOnce('gmail-reject')) throw new ConnectorError('Gmail rejected the message (temporary error)', 'definite');
    const ref = 'sim-msg-' + i.to.split('@')[0];
    this.state.sent[i.idempotencyKey] = { to: i.to, ref }; this.onChange(this.state);
    return { messageRef: ref };
  }
  async findSent(i: { idempotencyKey: string }) { await this.tick(); const s = this.state.sent[i.idempotencyKey]; return s ? { found: true, messageRef: s.ref } : { found: false }; }
  /** Test hook / demo button: someone edits the Calendar event after the preview was made. */
  externalCalendarEdit(start: string, end: string) { this.state.calendar = { start, end }; this.onChange(this.state); }
}
