/** Core domain types. All instants are ISO-8601 UTC strings; the event's IANA zone is kept for display/interpretation. */

export type Role = 'participant' | 'volunteer' | 'organiser';

export interface Person { id: string; name: string; email: string; role: Role }

export interface Assignment { person: string; eventId: string; start: string; end: string; label?: string }

export interface BusySlot { id: string; title: string; start: string; end: string }

export interface EventRecord {
  id: string;            // stable event_id used in the Sheet
  title: string;
  timezone: string;      // IANA
  location?: string;
  calendarStart: string; calendarEnd: string;   // from Calendar
  sheetStart: string; sheetEnd: string;         // from linked Sheet row
}

export interface ProposedTimes { newStart: string; newEnd: string }

export type ConflictSeverity = 'blocking' | 'warning' | 'info';
export type ConflictKind =
  | 'invalid_time' | 'past_time' | 'missing_data'
  | 'volunteer_overlap' | 'calendar_overlap' | 'source_mismatch' | 'availability_unchecked' | 'no_change';

export interface Conflict {
  id: string; kind: ConflictKind; severity: ConflictSeverity;
  title: string; detail: string;
  /** Which map card to highlight. */
  area: 'calendar' | 'sheet' | 'participants' | 'volunteers';
  people?: string[];
}

export interface FieldChange { target: 'calendar' | 'sheet'; field: 'start' | 'end'; from: string; to: string }

export type StepKind = 'calendar.update' | 'sheet.update' | 'email.send';
export type StepStatus = 'pending' | 'running' | 'verified' | 'failed' | 'needs_checking' | 'skipped';

export interface PlannedStep {
  key: string;            // stable within a plan: 'calendar', 'sheet', 'email:<personId>'
  kind: StepKind;
  label: string;
  required: boolean;      // required steps cannot be excluded
  recipient?: Person;
  excluded?: boolean;     // organiser opted out of an optional step
}

export interface MessageDraft { subject: string; body: string }

export interface Plan {
  eventId: string;
  timezone: string;
  baseline: { calendarStart: string; calendarEnd: string; sheetStart: string; sheetEnd: string };
  proposed: ProposedTimes;
  fieldChanges: FieldChange[];
  steps: PlannedStep[];
  drafts: { participant: MessageDraft; volunteer: MessageDraft };
  acknowledgedConflicts: string[];   // conflict ids the organiser accepted
  calendarGuestUpdates: 'none' | 'all';  // does Calendar itself notify guests?
}

export interface Approval { planHash: string; approvedAt: string; approvedBy: string }

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'needs_attention' | 'blocked_stale';

export interface RunStep {
  id: string; key: string; kind: StepKind; label: string; status: StepStatus;
  attempts: number; error?: string; plainError?: string;
  verification?: string;          // human-readable verification result
  messageRef?: string;            // provider reference for sent mail
  recipient?: Person;
  acknowledgedAt?: string;        // reserved: "Got it" links (not implemented in v0.1)
  updatedAt: string;
}

export interface Run {
  id: string; eventId: string; planHash: string; plan: Plan; approval: Approval;
  status: RunStatus; steps: RunStep[]; staleReason?: string;
  leaseOwner?: string | null; leaseUntil?: string | null;
  createdAt: string; updatedAt: string;
}
