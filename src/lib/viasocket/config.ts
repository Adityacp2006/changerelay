import raw from '../../../config/viasocket-actions.json';

export type OpName = keyof typeof raw.operations;
export interface Operation { service: 'calendar' | 'sheets' | 'gmail'; event: string; optional?: boolean; input: Record<string, unknown>; output: Record<string, string> }

export const config = raw as unknown as {
  services: Record<'calendar' | 'sheets' | 'gmail', { slug: string; label: string }>;
  operations: Record<string, Operation>;
  options: Record<string, { operation: string; fieldKey: string; parentKey?: string }>;
  sheetTimeFormat: string;
};

export class SetupError extends Error { constructor(public op: string) { super(`The viaSocket action for "${op}" isn't configured yet. See README → "Configure viaSocket actions".`); } }

export const op = (name: string): Operation => {
  const o = config.operations[name];
  if (!o || !o.event) throw new SetupError(name);
  return o;
};

/** For the setup screen: which required operations are still unconfigured. */
export function setupGaps(): { operation: string; optional: boolean }[] {
  return Object.entries(config.operations).filter(([, o]) => !o.event).map(([operation, o]) => ({ operation, optional: !!o.optional }));
}
