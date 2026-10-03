import type { ContactField, CustomValue, FieldType } from '../types';
import { fmtDate, toIsoDate } from './services';

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  yesno: 'Yes / No',
  text: 'Text',
  date: 'Date',
  choice: 'Pick from a list',
};

export function activeFields(fields: ContactField[]): ContactField[] {
  return fields.filter((f) => !f.archived).sort((a, b) => a.position - b.position);
}

export function describeField(f: ContactField): string {
  if (f.type === 'yesno') {
    const extras = [f.askDate && 'date', f.askPlace && 'place'].filter(Boolean);
    return extras.length ? `Yes / No, then ${extras.join(' and ')}` : 'Yes / No';
  }
  if (f.type === 'choice') return `One of: ${(f.options ?? []).join(', ') || '(no options yet)'}`;
  return FIELD_TYPE_LABEL[f.type];
}

/** Drops empty answers, and date/place on a "No", so stored data stays tidy. */
export function cleanCustom(fields: ContactField[], custom: Record<string, CustomValue> | undefined): Record<string, CustomValue> | undefined {
  if (!custom) return undefined;
  const out: Record<string, CustomValue> = {};
  for (const [id, v] of Object.entries(custom)) {
    const field = fields.find((f) => f.id === id);
    if (!field) {
      out[id] = v;
      continue;
    }
    const next: CustomValue = {};
    if (field.type === 'yesno') {
      if (typeof v.value === 'boolean') next.value = v.value;
      if (v.value === true && field.askDate && v.date) next.date = v.date;
      if (v.value === true && field.askPlace && v.place?.trim()) next.place = v.place.trim();
    } else if (typeof v.value === 'string' && v.value.trim()) {
      next.value = v.value.trim();
    }
    if (Object.keys(next).length) out[id] = next;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Main answer as text: "Yes", "No", the text/choice, or a formatted date. */
export function formatValue(field: ContactField, v?: CustomValue): string {
  if (!v || v.value === undefined || v.value === '') return '—';
  if (field.type === 'yesno') return v.value ? 'Yes' : 'No';
  if (field.type === 'date') return fmtDate(String(v.value));
  return String(v.value);
}

/** One-line summary, e.g. "Yes · 3 Mar 2025 · Canaan Land". */
export function summarizeValue(field: ContactField, v?: CustomValue): string {
  const main = formatValue(field, v);
  if (field.type !== 'yesno' || v?.value !== true) return main;
  return [main, v.date && fmtDate(v.date), v.place].filter(Boolean).join(' · ');
}

const YES = new Set(['y', 'yes', 'true', '1', 'x', '✓', '✔', 'done', 'attended', 'bapt', 'baptised', 'baptized']);
const NO = new Set(['n', 'no', 'false', '0', 'not', 'none', 'nil', 'never']);

/** Reads spreadsheet-style yes/no answers. Unknown or blank → undefined. */
export function parseYesNo(raw: unknown): boolean | undefined {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw === 1 ? true : raw === 0 ? false : undefined;
  const s = String(raw ?? '').trim().toLowerCase().replace(/[.!]$/, '');
  if (!s) return undefined;
  if (YES.has(s)) return true;
  if (NO.has(s) || s.startsWith('not ')) return false;
  return undefined;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function validDate(y: number, m: number, d: number): string | undefined {
  if (y < 100) y += y < 50 ? 2000 : 1900;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return undefined;
  return toIsoDate(dt);
}

/**
 * Reads a date from a spreadsheet cell: real dates, Excel serial numbers,
 * 2026-09-28, 28/09/2026 (day first, as written in Nigeria), 28 Sep 2026, Sep 28 2026.
 */
export function parseDateCell(raw: unknown): string | undefined {
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return undefined;
    // Spreadsheet readers give date-only cells as UTC midnight; read them in UTC so no timezone shifts the day.
    if (raw.getUTCHours() === 0 && raw.getUTCMinutes() === 0) return validDate(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
    return toIsoDate(raw);
  }
  if (typeof raw === 'number') {
    if (raw < 20000 || raw > 80000) return undefined;
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return validDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(raw ?? '').trim();
  if (!s) return undefined;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) return validDate(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-z]{3})[a-z]*\.?,?[\s-]+(\d{2,4})$/i);
  if (m && MONTHS.includes(m[2].toLowerCase())) return validDate(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
  m = s.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})$/i);
  if (m && MONTHS.includes(m[1].toLowerCase())) return validDate(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]);
  return undefined;
}
