import { describe, expect, it } from 'vitest';
import { setup, NOW } from './helpers';
import { detectConflicts, unresolvedConflicts } from '@/lib/core/conflicts';

describe('conflict detection', () => {
  it('finds the known volunteer overlap', () => {
    const { conflicts } = setup('happy', { ack: false });
    const v = conflicts.find(c => c.kind === 'volunteer_overlap');
    expect(v?.people).toEqual(['Rohan Desai']);
    expect(v?.severity).toBe('warning');
  });
  it('does not flag the volunteer when moved to a clear slot', () => {
    const { conflicts } = setup('happy', { newStart: '11:00', ack: false });
    expect(conflicts.some(c => c.kind === 'volunteer_overlap')).toBe(false);
  });
  it('says availability was not checked rather than guessing', () => {
    const { conflicts } = setup('happy', { ack: false });
    expect(conflicts.some(c => c.kind === 'availability_unchecked' && c.area === 'participants')).toBe(true);
  });
  it('reports an unreadable organiser calendar as unchecked, not clear', () => {
    const { world, t } = setup();
    const c = detectConflicts({ event: world.event, newStart: t.newStart, newEnd: t.newEnd, people: world.people, assignments: [], organiserBusy: null, now: NOW });
    expect(c.find(x => x.id === 'cal-unchecked')?.detail).toContain('Availability not checked');
  });
  it('flags Calendar/Sheet disagreement and overlapping calendar events', () => {
    const { world, t } = setup();
    const e = { ...world.event, sheetStart: '2026-10-30T07:00:00.000Z', sheetEnd: '2026-10-30T08:00:00.000Z' };
    const c = detectConflicts({ event: e, newStart: t.newStart, newEnd: t.newEnd, people: [], assignments: [],
      organiserBusy: [{ id: 'x', title: 'Club sync', start: t.newStart, end: t.newEnd }], now: NOW });
    expect(c.map(x => x.kind)).toEqual(expect.arrayContaining(['source_mismatch', 'calendar_overlap']));
  });
  it('blocks invalid ranges, past times and no-ops; warnings need acknowledgement', () => {
    const { world, t } = setup();
    const bad = detectConflicts({ event: world.event, newStart: t.newEnd, newEnd: t.newStart, people: [], assignments: [], organiserBusy: [], now: NOW });
    expect(bad[0].severity).toBe('blocking');
    const past = detectConflicts({ event: world.event, newStart: '2020-01-01T00:00:00Z', newEnd: '2020-01-01T01:00:00Z', people: [], assignments: [], organiserBusy: [], now: NOW });
    expect(past.some(c => c.kind === 'past_time')).toBe(true);
    const noop = detectConflicts({ event: world.event, newStart: world.event.calendarStart, newEnd: world.event.calendarEnd, people: [], assignments: [], organiserBusy: [], now: NOW });
    expect(noop.some(c => c.kind === 'no_change')).toBe(true);
    const s = setup('happy', { ack: false });
    expect(unresolvedConflicts(s.conflicts, []).length).toBe(1);
    expect(unresolvedConflicts(s.conflicts, [s.conflicts.find(c => c.kind === 'volunteer_overlap')!.id]).length).toBe(0);
  });
});
