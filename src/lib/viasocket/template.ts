/** Tiny, dependency-free templating for action inputs and output mapping. */

export function fill(tpl: unknown, vars: Record<string, unknown>): unknown {
  if (typeof tpl === 'string') {
    const whole = tpl.match(/^\{\{\s*(\w+)\s*\}\}$/);
    if (whole) return vars[whole[1]];                                   // keeps type (booleans, numbers)
    return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(vars[k] ?? ''));
  }
  if (Array.isArray(tpl)) return tpl.map(t => fill(t, vars));
  if (tpl && typeof tpl === 'object') return Object.fromEntries(Object.entries(tpl).map(([k, v]) => [k, fill(v, vars)]).filter(([, v]) => v !== undefined));
  return tpl;
}

/** "$.data.items[0].start.dateTime" → value. Returns undefined when absent. */
export function pick(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  const parts = path.replace(/^\$\.?/, '').split('.').filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    const m = p.match(/^([^\[]+)((?:\[\d+\])*)$/);
    if (!m || cur == null) return undefined;
    cur = (cur as Record<string, unknown>)[m[1]];
    for (const idx of m[2].matchAll(/\[(\d+)\]/g)) { if (!Array.isArray(cur)) return undefined; cur = cur[Number(idx[1])]; }
  }
  return cur;
}
