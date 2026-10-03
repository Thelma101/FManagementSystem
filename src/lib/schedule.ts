import type { Contact, ScheduledEvent } from '../types';

/** Event times are Nigerian time (WAT, UTC+1, no daylight saving) wherever the browser or server is. */
const UTC_OFFSET_MS = 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const CHURCH_NAME = 'Living Faith Church';

type EventTiming = Pick<ScheduledEvent, 'frequency' | 'dayOfWeek' | 'time' | 'date' | 'leadTimeHours'>;

/** Epoch ms of the given Nigerian wall-clock time. */
function watToUtc(year: number, month: number, day: number, h: number, m: number): number {
  return Date.UTC(year, month, day, h, m) - UTC_OFFSET_MS;
}

/** Occurrences of the event in order, starting with the first one after `fromMs`. */
function* occurrences(ev: EventTiming, fromMs: number): Generator<number> {
  const [h, m] = (ev.time || '09:00').split(':').map(Number);
  const start = ev.date ? watToUtc(+ev.date.slice(0, 4), +ev.date.slice(5, 7) - 1, +ev.date.slice(8, 10), 0, 0) : -Infinity;
  const from = Math.max(fromMs, start - 1);
  const local = new Date(from + UTC_OFFSET_MS);
  let y = local.getUTCFullYear();
  let mo = local.getUTCMonth();
  let d = local.getUTCDate();

  if (ev.frequency === 'monthly') {
    const dom = ev.date ? +ev.date.slice(8, 10) : d;
    for (let i = 0; i < 600; i++) {
      const lastDay = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
      const t = watToUtc(y, mo, Math.min(dom, lastDay), h, m);
      if (t > from) yield t;
      if (++mo === 12) { mo = 0; y++; }
    }
    return;
  }

  const step = ev.frequency === 'weekly' ? 7 : 1;
  if (ev.frequency === 'weekly') {
    const want = Math.max(0, DAYS.indexOf(ev.dayOfWeek ?? 'Sunday'));
    d += (want - local.getUTCDay() + 7) % 7;
  }
  for (let t = watToUtc(y, mo, d, h, m); ; t += step * DAY) {
    if (t > from) yield t;
  }
}

export interface NextSend {
  /** When the reminder goes out. */
  at: number;
  /** When the event itself happens. */
  occurrence: number;
  leadHours: number;
}

/** The first reminder after `afterMs` (now by default). */
export function nextSend(ev: EventTiming, afterMs = Date.now()): NextSend | null {
  const leads = ev.leadTimeHours.length ? ev.leadTimeHours : [0];
  const maxLead = Math.max(...leads) * HOUR;
  let best: NextSend | null = null;
  for (const occurrence of occurrences(ev, afterMs)) {
    // A later occurrence can't produce an earlier reminder once it's this far out.
    if (best && occurrence - maxLead > best.at) break;
    for (const leadHours of leads) {
      const at = occurrence - leadHours * HOUR;
      if (at > afterMs && (!best || at < best.at)) best = { at, occurrence, leadHours };
    }
    if (occurrence - afterMs > 400 * DAY) break;
  }
  return best;
}

export type Audience = { type: 'all' } | { type: 'group'; value: string } | { type: 'tag'; value: string };

export function audienceOf(ev: Pick<ScheduledEvent, 'audienceType' | 'audienceValue'>): Audience {
  if ((ev.audienceType === 'group' || ev.audienceType === 'tag') && ev.audienceValue) return { type: ev.audienceType, value: ev.audienceValue };
  return { type: 'all' };
}

export function audienceMembers<C extends Pick<Contact, 'archived' | 'tags' | 'groupIds'>>(contacts: C[], audience: Audience): C[] {
  return contacts.filter((c) => {
    if (c.archived) return false;
    if (audience.type === 'group') return (c.groupIds ?? []).includes(audience.value);
    if (audience.type === 'tag') return c.tags.includes(audience.value);
    return true;
  });
}

export function fillReminder(template: string, contactName: string): string {
  return template
    .replace(/\{name\}/g, contactName.trim().split(/\s+/)[0] || 'friend')
    .replace(/\{church\}/g, CHURCH_NAME);
}

/** Unique enough to double as the SMS provider's message id for delivery reports. */
export function newMessageId(prefix = 'ml'): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
