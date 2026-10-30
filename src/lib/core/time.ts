import { DateTime, Duration } from 'luxon';

export class TimeError extends Error {}

/** Parse a local wall-clock date+time in an IANA zone to a UTC ISO instant. Rejects invalid and nonexistent (DST gap) times. */
export function localToUtc(date: string, time: string, zone: string): string {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone });
  if (!dt.isValid) throw new TimeError(`"${date} ${time}" is not a valid date and time in ${zone}.`);
  // Luxon silently shifts times inside a DST gap; detect and reject.
  const [h, m] = time.split(':').map(Number);
  if (dt.hour !== h || dt.minute !== m) throw new TimeError(`${time} does not exist on ${date} in ${zone} (clock change).`);
  return dt.toUTC().toISO()!;
}

export function isValidZone(zone: string): boolean {
  return DateTime.local().setZone(zone).isValid;
}

export function durationMinutes(startIso: string, endIso: string): number {
  return DateTime.fromISO(endIso).diff(DateTime.fromISO(startIso), 'minutes').minutes;
}

/**
 * Compute new start/end. If newEndLocal is omitted the original duration is preserved.
 * Duration is measured in absolute time, so a move across a clock change keeps the same length.
 */
export function resolveNewTimes(args: {
  zone: string; oldStart: string; oldEnd: string;
  newDate?: string; newStartTime: string; newEndTime?: string;
}): { newStart: string; newEnd: string } {
  const { zone, oldStart, oldEnd, newStartTime, newEndTime } = args;
  const date = args.newDate ?? DateTime.fromISO(oldStart, { zone: 'utc' }).setZone(zone).toISODate()!;
  const newStart = localToUtc(date, newStartTime, zone);
  let newEnd: string;
  if (newEndTime) {
    newEnd = localToUtc(date, newEndTime, zone);
    if (DateTime.fromISO(newEnd) <= DateTime.fromISO(newStart)) throw new TimeError('The end time must be after the start time.');
  } else {
    const mins = durationMinutes(oldStart, oldEnd);
    if (!(mins > 0)) throw new TimeError('The current event has no valid duration; enter an end time.');
    newEnd = DateTime.fromISO(newStart).plus(Duration.fromObject({ minutes: mins })).toUTC().toISO()!;
  }
  return { newStart, newEnd };
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return DateTime.fromISO(aStart) < DateTime.fromISO(bEnd) && DateTime.fromISO(bStart) < DateTime.fromISO(aEnd);
}

export function sameInstant(a: string, b: string): boolean {
  return DateTime.fromISO(a).toMillis() === DateTime.fromISO(b).toMillis();
}

/** "Thu 30 Oct, 4:00–5:00 pm" in the event's zone. */
export function formatRange(startIso: string, endIso: string, zone: string): string {
  const s = DateTime.fromISO(startIso).setZone(zone), e = DateTime.fromISO(endIso).setZone(zone);
  const day = s.toFormat('ccc d LLL');
  const t = (d: DateTime) => d.toFormat('h:mm a').toLowerCase();
  return s.hasSame(e, 'day') ? `${day}, ${t(s)}–${t(e)}` : `${day}, ${t(s)} – ${e.toFormat('ccc d LLL')}, ${t(e)}`;
}

export function zoneLabel(zone: string, atIso: string): string {
  return `${zone} (${DateTime.fromISO(atIso).setZone(zone).toFormat("'UTC'ZZ")})`;
}

export function nowIso(): string { return new Date().toISOString(); }
