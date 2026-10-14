import { validateConfig, validateSpec } from './engine.ts';
import type { Dataset } from './engine';
import type { Session } from '../app/terminal';

export function parseSessionBackup(text: string): { session: Session; data: Dataset } {
  if (new TextEncoder().encode(text).length > 12000000) throw new Error('Cadangan maksimal 12 MB.');
  const backup = JSON.parse(text);
  const invalid = () => { throw new Error('Cadangan sesi tidak valid.'); };
  const s = backup?.session, d = backup?.data;
  if (backup?.version !== 1 || !s || !d || typeof d.id !== 'string' || d.id.length > 100 ||
    s.datasetId !== d.id || typeof d.name !== 'string' || d.name.length > 150 ||
    !Array.isArray(d.candles) || !d.candles.length || d.candles.length > 50000 ||
    !Number.isInteger(d.minutes) || d.minutes < 1 || typeof d.timezone !== 'string') invalid();
  validateSpec(d.symbol);
  let previous = -Infinity;
  for (const bar of d.candles) {
    if (!bar || !Number.isInteger(bar.time) || bar.time <= previous ||
      ![bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) ||
      Math.min(bar.open, bar.high, bar.low, bar.close) <= 0 || bar.high < Math.max(bar.open, bar.close) ||
      bar.low > Math.min(bar.open, bar.close) || bar.volume < 0 ||
      (bar.spread !== undefined && (!Number.isFinite(bar.spread) || bar.spread < 0))) invalid();
    previous = bar.time;
  }
  if (typeof s.id !== 'string' || !s.id || s.id.length > 100 || typeof s.name !== 'string' || s.name.length > 150 ||
    !Number.isInteger(s.index) || s.index < 0 || s.index >= d.candles.length ||
    !Number.isInteger(s.timeframe) || s.timeframe < d.minutes || s.timeframe % d.minutes !== 0 ||
    typeof s.journal !== 'string' || s.journal.length > 100000 || typeof s.source !== 'string' || s.source.length > 24000 ||
    !Array.isArray(s.branches) || !s.branches.length || s.branches.length > 50 ||
    !Array.isArray(s.drawings) || s.drawings.length > 1000) invalid();
  validateConfig(s.config, d.symbol);
  let events = 0;
  const ids = new Set();
  for (const branch of s.branches) {
    if (!branch || typeof branch.id !== 'string' || ids.has(branch.id) || typeof branch.name !== 'string' ||
      !Number.isInteger(branch.furthest) || branch.furthest < 0 || branch.furthest >= d.candles.length || !Array.isArray(branch.events)) invalid();
    ids.add(branch.id); events += branch.events.length;
    for (const event of branch.events) {
      if (!event || !Number.isInteger(event.index) || event.index < 0 || event.index >= d.candles.length ||
        !['order', 'close', 'cancel', 'modify', 'deposit', 'config'].includes(event.kind)) invalid();
      if (event.kind === 'order' && (!event.order || typeof event.order.id !== 'string' ||
        !['buy', 'sell'].includes(event.order.side) || !['market', 'limit', 'stop'].includes(event.order.type) ||
        !Number.isFinite(event.order.lot) || event.order.lot <= 0)) invalid();
      if (event.kind === 'deposit' && !Number.isFinite(event.amount)) invalid();
      if (event.kind === 'config') {
        if (!event.config || typeof event.config !== 'object') invalid();
        validateConfig({ ...s.config, ...event.config }, d.symbol);
      }
    }
  }
  if (!ids.has(s.active) || events > 10000) invalid();
  for (const drawing of s.drawings) {
    if (!drawing || typeof drawing.id !== 'string' ||
      !['horizontal', 'vertical', 'trend', 'rectangle', 'text', 'fib', 'risk'].includes(drawing.type) ||
      !drawing.a || ![drawing.a.time, drawing.a.price].every(Number.isFinite) ||
      (drawing.b && ![drawing.b.time, drawing.b.price].every(Number.isFinite)) ||
      (drawing.text !== undefined && (typeof drawing.text !== 'string' || drawing.text.length > 1000))) invalid();
  }
  return { session: s as Session, data: d as Dataset };
}
