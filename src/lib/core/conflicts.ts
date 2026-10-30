import type { Assignment, BusySlot, Conflict, EventRecord, Person } from './types';
import { formatRange, overlaps, sameInstant } from './time';

export interface ConflictInput {
  event: EventRecord;
  newStart: string; newEnd: string;
  people: Person[];
  assignments: Assignment[];
  /** null = the organiser's calendar could not be read (check unavailable). */
  organiserBusy: BusySlot[] | null;
  now?: string;
}

/** Deterministic conflict detection. Nothing here is AI-generated. */
export function detectConflicts(i: ConflictInput): Conflict[] {
  const out: Conflict[] = [];
  const zone = i.event.timezone;
  const { newStart, newEnd } = i;

  if (!(new Date(newEnd) > new Date(newStart))) {
    out.push({ id: 'invalid-range', kind: 'invalid_time', severity: 'blocking', area: 'calendar',
      title: 'The end must be after the start', detail: 'Adjust the new times before continuing.' });
    return out;
  }
  if (i.now && new Date(newStart) < new Date(i.now)) {
    out.push({ id: 'past', kind: 'past_time', severity: 'blocking', area: 'calendar',
      title: 'The new time is in the past', detail: 'Pick a start time that has not happened yet.' });
  }
  if (sameInstant(newStart, i.event.calendarStart) && sameInstant(newEnd, i.event.calendarEnd)) {
    out.push({ id: 'no-change', kind: 'no_change', severity: 'blocking', area: 'calendar',
      title: 'Nothing would change', detail: 'The new time matches the current Calendar time.' });
  }
  if (!sameInstant(i.event.calendarStart, i.event.sheetStart) || !sameInstant(i.event.calendarEnd, i.event.sheetEnd)) {
    out.push({ id: 'source-mismatch', kind: 'source_mismatch', severity: 'warning', area: 'sheet',
      title: 'Calendar and Sheet already disagree',
      detail: `Calendar says ${formatRange(i.event.calendarStart, i.event.calendarEnd, zone)}; the Sheet says ${formatRange(i.event.sheetStart, i.event.sheetEnd, zone)}. Both will be set to the new time.` });
  }

  const volClash = i.assignments.filter(a => a.eventId !== i.event.id && overlaps(newStart, newEnd, a.start, a.end));
  for (const a of volClash) {
    out.push({ id: `vol-${a.person}-${a.start}`, kind: 'volunteer_overlap', severity: 'warning', area: 'volunteers', people: [a.person],
      title: `${a.person} has another assignment`,
      detail: `${a.label ?? 'Another assignment'} runs ${formatRange(a.start, a.end, zone)}, which overlaps the new time.` });
  }

  if (i.organiserBusy === null) {
    out.push({ id: 'cal-unchecked', kind: 'availability_unchecked', severity: 'info', area: 'calendar',
      title: 'Your calendar was not checked', detail: 'Availability not checked. Reconnect Calendar to check for overlapping events.' });
  } else {
    for (const b of i.organiserBusy.filter(b => overlaps(newStart, newEnd, b.start, b.end))) {
      out.push({ id: `cal-${b.id}`, kind: 'calendar_overlap', severity: 'warning', area: 'calendar',
        title: `Overlaps "${b.title}"`, detail: `That event runs ${formatRange(b.start, b.end, zone)} on your calendar.` });
    }
  }

  const unchecked = i.people.filter(p => p.role === 'participant');
  if (unchecked.length) {
    out.push({ id: 'participants-unchecked', kind: 'availability_unchecked', severity: 'info', area: 'participants',
      title: 'Participant availability not checked',
      detail: `We only check calendars you have connected. ${unchecked.length} participant${unchecked.length === 1 ? '' : 's'} will be told about the change but their availability is unknown.` });
  }
  return out;
}

/** Blocking items always stop execution; warnings must be acknowledged. */
export function unresolvedConflicts(conflicts: Conflict[], acknowledged: string[]): Conflict[] {
  return conflicts.filter(c => c.severity === 'blocking' || (c.severity === 'warning' && !acknowledged.includes(c.id)));
}
