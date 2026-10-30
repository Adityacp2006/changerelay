import { sha256 } from 'js-sha256';
import type { Approval, EventRecord, FieldChange, MessageDraft, Person, Plan, PlannedStep } from './types';
import { formatRange, zoneLabel } from './time';

/** Deterministic default announcement drafts. Editable by the organiser; AI may optionally redraft but never changes recipients. */
export function draftAnnouncements(args: {
  title: string; zone: string; oldStart: string; oldEnd: string; newStart: string; newEnd: string; location?: string; organiserName?: string;
}): { participant: MessageDraft; volunteer: MessageDraft } {
  const old = formatRange(args.oldStart, args.oldEnd, args.zone);
  const nu = formatRange(args.newStart, args.newEnd, args.zone);
  const where = args.location ? `\nLocation: ${args.location}` : '';
  const sign = `\n\n${args.organiserName ?? 'The organisers'}`;
  return {
    participant: {
      subject: `Time change: ${args.title}`,
      body: `Hello {{name}},\n\n${args.title} has moved.\n\nWas: ${old}\nNow: ${nu} (${zoneLabel(args.zone, args.newStart)})${where}\n\nIf the new time doesn't work for you, please reply to this email.${sign}`,
    },
    volunteer: {
      subject: `Volunteer schedule change: ${args.title}`,
      body: `Hi {{name}},\n\n${args.title} is now at ${nu} (was ${old}).${where}\n\nPlease check that this fits your assignments and reply if you can't cover the new time.${sign}`,
    },
  };
}

export function renderMessage(draft: MessageDraft, person: Person): MessageDraft {
  const first = person.name.split(' ')[0] || person.name;
  const r = (t: string) => t.replace(/\{\{\s*name\s*\}\}/g, first);
  return { subject: r(draft.subject), body: r(draft.body) };
}

export function buildPlan(args: {
  event: EventRecord; newStart: string; newEnd: string; recipients: Person[];
  organiserName?: string; calendarGuestUpdates?: 'none' | 'all';
}): Plan {
  const { event } = args;
  const fieldChanges: FieldChange[] = [
    { target: 'calendar', field: 'start', from: event.calendarStart, to: args.newStart },
    { target: 'calendar', field: 'end', from: event.calendarEnd, to: args.newEnd },
    { target: 'sheet', field: 'start', from: event.sheetStart, to: args.newStart },
    { target: 'sheet', field: 'end', from: event.sheetEnd, to: args.newEnd },
  ];
  const steps: PlannedStep[] = [
    { key: 'calendar', kind: 'calendar.update', label: 'Update the Calendar event', required: true },
    { key: 'sheet', kind: 'sheet.update', label: 'Update the schedule Sheet', required: true },
    ...args.recipients.map<PlannedStep>(p => ({
      key: `email:${p.id}`, kind: 'email.send', label: `Email ${p.name}`, required: false, recipient: p,
    })),
  ];
  return {
    eventId: event.id, timezone: event.timezone,
    baseline: { calendarStart: event.calendarStart, calendarEnd: event.calendarEnd, sheetStart: event.sheetStart, sheetEnd: event.sheetEnd },
    proposed: { newStart: args.newStart, newEnd: args.newEnd },
    fieldChanges, steps,
    drafts: draftAnnouncements({
      title: event.title, zone: event.timezone, oldStart: event.calendarStart, oldEnd: event.calendarEnd,
      newStart: args.newStart, newEnd: args.newEnd, location: event.location, organiserName: args.organiserName,
    }),
    acknowledgedConflicts: [],
    calendarGuestUpdates: args.calendarGuestUpdates ?? 'none',
  };
}

/** Stable JSON: sorted keys, so semantically equal plans hash equally. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

export function planHash(plan: Plan): string { return sha256(canonical(plan)); }

export function approve(plan: Plan, userId: string, at: string): Approval {
  return { planHash: planHash(plan), approvedAt: at, approvedBy: userId };
}

/** Approval is valid only for the exact saved plan. Any edit changes the hash and voids it. */
export function isApprovalValid(plan: Plan, approval: Approval | null | undefined): boolean {
  return !!approval && approval.planHash === planHash(plan);
}

export function setAck(plan: Plan, conflictId: string, on: boolean): Plan {
  const s = new Set(plan.acknowledgedConflicts);
  on ? s.add(conflictId) : s.delete(conflictId);
  return { ...plan, acknowledgedConflicts: [...s].sort() };
}

export function setStepExcluded(plan: Plan, key: string, excluded: boolean): Plan {
  return { ...plan, steps: plan.steps.map(s => s.key === key ? (s.required ? s : { ...s, excluded }) : s) };
}

export function editDraft(plan: Plan, which: 'participant' | 'volunteer', draft: MessageDraft): Plan {
  return { ...plan, drafts: { ...plan.drafts, [which]: draft } };
}

/** Who gets what, so the organiser can see Calendar vs Gmail audiences and avoid duplicates. */
export function audienceSummary(plan: Plan) {
  const mail = plan.steps.filter(s => s.kind === 'email.send' && !s.excluded && s.recipient);
  return {
    calendarNotifies: plan.calendarGuestUpdates === 'all' ? 'Everyone invited to the Calendar event' : 'Nobody (guest notifications are turned off for this update)',
    gmailRecipients: mail.map(s => s.recipient!),
    duplicateRisk: plan.calendarGuestUpdates === 'all' && mail.length > 0,
  };
}
