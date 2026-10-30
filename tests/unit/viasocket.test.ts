import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ViaSocketError } from 'viasocket-apps';
import { fill, pick } from '@/lib/viasocket/template';
import { ConnectorError } from '@/lib/core/connector';

let impl: (...a: unknown[]) => Promise<unknown> = async () => ({});
const calls: unknown[][] = [];
const runAction = (...a: unknown[]) => { calls.push(a); return impl(...a); };   // plain function: vi.fn tracking leaks unhandled rejections
vi.mock('@/lib/viasocket/client', () => ({ vs: () => ({ catalog: { versionIdFor: async () => 'V1' }, runAction }) }));
vi.mock('@/lib/viasocket/config', () => {
  const operations = {
    'calendar.getEvent': { service: 'calendar', event: 'get-event', input: { calendarId: '{{calendarId}}', ids: ['{{calendarEventId}}'] }, output: { start: '$.data.start.dateTime', end: '$.data.end.dateTime' } },
    'gmail.sendEmail': { service: 'gmail', event: 'send', input: { to: '{{to}}', subject: '{{subject}}', body: '{{body}}' }, output: { messageRef: '$.id' } },
    'gmail.findSent': { service: 'gmail', event: '', optional: true, input: {}, output: {} },
  };
  return { config: { services: { calendar: { label: 'Google Calendar' }, sheets: { label: 'Google Sheets' }, gmail: { label: 'Gmail' } }, operations, options: {} },
    op: (n: keyof typeof operations) => { const o = operations[n]; if (!o?.event) throw new Error('setup'); return o; }, SetupError: class extends Error {} };
});
import { ViaSocketConnector, parseSheetTime } from '@/lib/viasocket/connector';

const links = { calendarId: 'cal1', calendarEventId: 'ev1', spreadsheetId: 's1', scheduleTab: 'Events', rosterTab: 'People', eventCode: 'ai-1', timezone: 'Asia/Kolkata', notifyGuests: false };
const conns = { calendar: { serviceId: 'a', scriptId: 'x' }, gmail: { serviceId: 'b', scriptId: 'y' } };

describe('template helpers', () => {
  it('keeps types for whole-string placeholders and nests arrays', () => {
    expect(fill({ a: '{{n}}', b: ['{{id}}'], c: 'x-{{id}}' }, { n: true, id: 'Q' })).toEqual({ a: true, b: ['Q'], c: 'x-Q' });
  });
  it('picks nested and indexed paths, undefined when missing', () => {
    expect(pick({ data: { items: [{ s: { t: '1' } }] } }, '$.data.items[0].s.t')).toBe('1');
    expect(pick({}, '$.a.b')).toBeUndefined(); expect(pick({}, '')).toBeUndefined();
  });
});

describe('sheet time parsing', () => {
  it('reads offsets as given and offset-less values in the event zone', () => {
    expect(parseSheetTime('2026-10-30T14:00:00+05:30', 'Asia/Kolkata')).toBe('2026-10-30T08:30:00.000Z');
    expect(parseSheetTime('2026-10-30 14:00', 'Asia/Kolkata')).toBe('2026-10-30T08:30:00.000Z');
    expect(() => parseSheetTime('soon', 'Asia/Kolkata')).toThrow(ConnectorError);
  });
});

describe('viaSocket connector error classification', () => {
  beforeEach(() => { calls.length = 0; });
  const c = () => new ViaSocketConnector(conns, links);
  it('reads times from the configured paths', async () => {
    impl = async () => ({ data: { start: { dateTime: '2026-10-30T14:00:00+05:30' }, end: { dateTime: '2026-10-30T15:00:00+05:30' } } });
    expect(await c().readCalendar()).toEqual({ start: '2026-10-30T08:30:00.000Z', end: '2026-10-30T09:30:00.000Z' });
    expect(calls[0]).toEqual(['x', 'V1', { calendarId: 'cal1', ids: ['ev1'] }]);
  });
  it.each([[401, 'disconnected'], [403, 'disconnected'], [400, 'definite'], [429, 'definite'], [500, 'uncertain'], [null, 'uncertain']])('HTTP %s from a send is "%s" (a 5xx must never be treated as "not sent")', async (status, kind) => {
    impl = async () => { throw new ViaSocketError('boom', { status: status as number | null }); };
    const err = await c().sendEmail({ to: 'a@b.co', subject: 's', body: 'b', idempotencyKey: 'k' }).catch(e => e);
    expect(err).toMatchObject({ kind });
  });
  it('treats a revoked-token message as disconnected even without a status', async () => {
    impl = async () => { throw new ViaSocketError('Token revoked by user', { status: 400 }); };
    expect(await c().readCalendar().catch(e => e)).toMatchObject({ kind: 'disconnected' });
  });
  it('reports a missing connection as disconnected, and exposes findSent only when configured', async () => {
    expect(await new ViaSocketConnector({}, links).readCalendar().catch(e => e)).toMatchObject({ kind: 'disconnected' });
    expect(c().findSent).toBeUndefined();
  });
});
