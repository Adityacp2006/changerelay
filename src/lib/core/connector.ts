/** The only surface the executor uses to touch the outside world. Implemented by viaSocket (live) and a simulator (sample). */

export type ErrorKind =
  | 'definite'      // the provider rejected the request; nothing happened
  | 'uncertain'     // timeout / unknown result; the action may have happened
  | 'disconnected'; // the connection is missing, revoked or expired

export class ConnectorError extends Error {
  constructor(message: string, public kind: ErrorKind) { super(message); this.name = 'ConnectorError'; }
}

export interface SendEmailInput { to: string; subject: string; body: string; idempotencyKey: string }

export interface Connector {
  readCalendar(): Promise<{ start: string; end: string }>;
  writeCalendar(start: string, end: string, notifyGuests: boolean): Promise<void>;
  readSheet(eventId: string): Promise<{ start: string; end: string }>;
  writeSheet(eventId: string, start: string, end: string): Promise<void>;
  sendEmail(input: SendEmailInput): Promise<{ messageRef?: string }>;
  /** Optional: check whether a message with this key was already sent. Absent when the integration cannot support it. */
  findSent?(input: { idempotencyKey: string; to: string; subject: string }): Promise<{ found: boolean; messageRef?: string }>;
}
