import type { AttendanceCommitment, ServiceType } from '../types';

export const SERVICE_OPTIONS: { id: ServiceType; label: string; short: string }[] = [
  { id: 'sunday', label: 'Sunday Service', short: 'Sunday' },
  { id: 'midweek', label: 'Midweek Service', short: 'Midweek' },
  { id: 'wsf', label: 'WSF (Cell Fellowship)', short: 'WSF' },
  { id: 'spiritual-emphasis', label: 'Spiritual Emphasis', short: 'Spiritual Emphasis' },
  { id: 'special-event', label: 'Special Event', short: 'Special Event' },
];

export const SPECIAL_EVENTS = [
  'Liberation Mandate Anniversary',
  'Annual Youth Alive Conference (AYAC)',
  'Shiloh',
];

export const COMMITMENT_LABEL: Record<AttendanceCommitment, string> = {
  yes: 'Yes, will attend',
  no: 'Not at this time',
  undecided: 'Undecided',
};

export function serviceLabel(id: ServiceType, specialEvent?: string): string {
  const opt = SERVICE_OPTIONS.find((s) => s.id === id);
  if (id === 'special-event' && specialEvent) return specialEvent;
  return opt?.short ?? id;
}

/** YYYY-MM-DD for a local date. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

/** Parse YYYY-MM-DD as a local date (avoids UTC day shifts). */
export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Sunday that starts the week containing `d`. */
export function weekStartOf(d: Date): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() - copy.getDay());
  return toIsoDate(copy);
}

export function addWeeks(weekStart: string, n: number): string {
  const d = fromIsoDate(weekStart);
  d.setDate(d.getDate() + n * 7);
  return toIsoDate(d);
}

export function fmtWeekRange(weekStart: string): string {
  const start = fromIsoDate(weekStart);
  const end = fromIsoDate(weekStart);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${start.toLocaleDateString('en-GB', opts)} – ${end.toLocaleDateString('en-GB', { ...opts, year: 'numeric' })}`;
}

export function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = iso.length === 10 ? fromIsoDate(iso) : new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
