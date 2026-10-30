import { describe, expect, it } from 'vitest';
import { resolveNewTimes, localToUtc, TimeError } from '@/lib/core/time';

describe('timezone and duration handling', () => {
  const zone = 'Asia/Kolkata';
  const old = { oldStart: localToUtc('2026-10-30', '14:00', zone), oldEnd: localToUtc('2026-10-30', '15:00', zone) };
  it('interprets wall-clock times in the event zone (IST = UTC+5:30)', () => {
    expect(localToUtc('2026-10-30', '16:00', zone)).toBe('2026-10-30T10:30:00.000Z');
  });
  it('preserves the original duration when no end is given', () => {
    const r = resolveNewTimes({ zone, ...old, newStartTime: '16:00' });
    expect(r.newStart).toBe('2026-10-30T10:30:00.000Z');
    expect(r.newEnd).toBe('2026-10-30T11:30:00.000Z');
  });
  it('preserves a 90-minute duration', () => {
    const r = resolveNewTimes({ zone, oldStart: old.oldStart, oldEnd: localToUtc('2026-10-30', '15:30', zone), newStartTime: '16:00' });
    expect(r.newEnd).toBe('2026-10-30T12:00:00.000Z');
  });
  it('uses an explicit end time when provided and rejects end <= start', () => {
    expect(resolveNewTimes({ zone, ...old, newStartTime: '16:00', newEndTime: '18:00' }).newEnd).toBe('2026-10-30T12:30:00.000Z');
    expect(() => resolveNewTimes({ zone, ...old, newStartTime: '16:00', newEndTime: '15:00' })).toThrow(TimeError);
  });
  it('rejects invalid dates and nonexistent DST times', () => {
    expect(() => localToUtc('2026-02-31', '10:00', zone)).toThrow(TimeError);
    expect(() => localToUtc('2026-03-08', '02:30', 'America/New_York')).toThrow(TimeError);
  });
  it('keeps the same elapsed duration across a clock change', () => {
    const z = 'America/New_York';
    const r = resolveNewTimes({ zone: z, oldStart: localToUtc('2026-03-07', '13:00', z), oldEnd: localToUtc('2026-03-07', '14:00', z), newDate: '2026-03-09', newStartTime: '13:00' });
    expect((Date.parse(r.newEnd) - Date.parse(r.newStart)) / 60000).toBe(60);
  });
});
