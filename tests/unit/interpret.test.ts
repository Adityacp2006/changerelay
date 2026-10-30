import { describe, expect, it } from 'vitest';
import { InterpretedRequestSchema, parseRequestHeuristic, resolveInterpretation } from '@/lib/core/interpret';
import { buildSampleWorld } from '@/lib/core/sample';
import { NOW } from './helpers';

const world = buildSampleWorld(NOW);
const second = { ...world.event, id: 'evt_ai_ethics', title: 'AI Ethics Talk', calendarStart: world.event.calendarStart, calendarEnd: world.event.calendarEnd };

describe('3. natural-language requests', () => {
  it('parses the headline example and resolves "tomorrow" in the event timezone', () => {
    const req = parseRequestHeuristic("Move tomorrow's AI workshop from 2 p.m. to 4 p.m. and notify the participants.")!;
    expect(req).toMatchObject({ eventDay: { type: 'tomorrow' }, fromTime: '14:00', newStartTime: '16:00', notify: true });
    const r = resolveInterpretation(req, [world.event], NOW);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') { expect(r.newStart).toBe(world.event.calendarStart.replace('08:30', '10:30')); expect((Date.parse(r.newEnd) - Date.parse(r.newStart)) / 60000).toBe(60); }
  });
  it('asks a specific question when more than one event matches', () => {
    const req = parseRequestHeuristic('Move tomorrow\'s AI workshop to 4 pm')!;
    const r = resolveInterpretation(req, [world.event, { ...second, title: 'AI Workshop: Advanced' }], NOW);
    expect(r.status).toBe('clarify');
    if (r.status === 'clarify') expect(r.options).toHaveLength(2);
  });
  it('asks instead of guessing when the stated current time is wrong or no event matches', () => {
    const wrongFrom = resolveInterpretation(parseRequestHeuristic('Move tomorrow\'s AI workshop from 9 am to 11 am')!, [world.event], NOW);
    expect(wrongFrom.status).toBe('clarify');
    const none = resolveInterpretation(parseRequestHeuristic('Move the pottery class to 4 pm')!, [world.event], NOW);
    expect(none.status).toBe('clarify');
  });
  it('rejects model output that is not exactly the strict schema (extra keys, bad times)', () => {
    expect(InterpretedRequestSchema.safeParse({ eventHint: 'x', eventDay: null, fromTime: null, newStartTime: '25:00', newEndTime: null, newDay: null, notify: true }).success).toBe(false);
    expect(InterpretedRequestSchema.safeParse({ eventHint: 'x', eventDay: null, fromTime: null, newStartTime: '16:00', newEndTime: null, newDay: null, notify: true, recipients: ['evil@x.com'] }).success).toBe(false);
  });
  it('returns null (use the form) for text it cannot understand', () => {
    expect(parseRequestHeuristic('what is the weather')).toBeNull();
  });
});
