// Bulk contact import from CSV or Excel: read the sheet, match columns to contact
// fields, then validate every row before anything is saved.

import type { CountryCode } from 'libphonenumber-js';
import { getCountryCallingCode } from 'libphonenumber-js';
import type { Contact, ContactField, CustomValue } from '../types';
import { parsePhone } from './phone';
import { activeFields, parseDateCell, parseYesNo } from './customFields';

export type Cell = string | number | boolean | Date | null;
export interface Sheet { headers: string[]; rows: Cell[][] }

export const MAX_ROWS = 5000;

// ── Reading files ─────────────────────────────────────────────────────────────

function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.slice(0, clean.indexOf('\n') >>> 0);
  const delim = [',', ';', '\t'].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const blank = (c: Cell) => c === null || c === undefined || String(c).trim() === '';

export async function readSpreadsheet(file: File): Promise<Sheet> {
  const name = file.name.toLowerCase();
  let grid: Cell[][];
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    grid = parseCsv(await file.text());
  } else if (name.endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/browser');
    grid = (await readSheet(file)) as unknown as Cell[][];
  } else if (name.endsWith('.xls')) {
    throw new Error('Old Excel (.xls) files are not supported. In Excel choose File → Save As → Excel Workbook (.xlsx), or CSV.');
  } else {
    throw new Error('Choose a .xlsx (Excel) or .csv file.');
  }
  const nonEmpty = grid.filter((r) => r.some((c) => !blank(c)));
  if (nonEmpty.length < 2) throw new Error('The file needs a header row and at least one contact.');
  const [head, ...rows] = nonEmpty;
  const width = Math.max(head.length, ...rows.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => String(head[i] ?? '').trim() || `Column ${i + 1}`);
  if (rows.length > MAX_ROWS) throw new Error(`The file has ${rows.length} contacts. Import at most ${MAX_ROWS} at a time.`);
  return { headers, rows };
}

// ── Column targets ────────────────────────────────────────────────────────────

export type TargetKind = 'text' | 'date' | 'yesno' | 'phone' | 'tags' | 'choice';

export interface Target {
  key: string;
  label: string;
  kind: TargetKind;
  group: 'Contact' | 'Where we met' | 'Spiritual status' | 'More details';
  synonyms?: string[];
}

const BASE_TARGETS: Target[] = [
  { key: 'name', label: 'Name', kind: 'text', group: 'Contact', synonyms: ['full name', 'contact name', 'names', 'name of convert'] },
  { key: 'firstName', label: 'First name', kind: 'text', group: 'Contact', synonyms: ['firstname', 'given name', 'other names'] },
  { key: 'lastName', label: 'Last name', kind: 'text', group: 'Contact', synonyms: ['surname', 'lastname', 'family name'] },
  { key: 'phone', label: 'Phone', kind: 'phone', group: 'Contact', synonyms: ['phone number', 'mobile', 'mobile number', 'telephone', 'tel', 'gsm', 'gsm number', 'whatsapp number', 'number', 'phone no'] },
  { key: 'tags', label: 'Tags', kind: 'tags', group: 'Contact', synonyms: ['tag', 'category', 'group'] },
  { key: 'notes', label: 'Notes', kind: 'text', group: 'Contact', synonyms: ['note', 'comment', 'comments', 'remarks', 'prayer points', 'prayer request'] },
  { key: 'metLocation', label: 'Location met', kind: 'text', group: 'Where we met', synonyms: ['where met', 'location', 'met at', 'place met', 'venue', 'outreach location'] },
  { key: 'metDate', label: 'Date met', kind: 'date', group: 'Where we met', synonyms: ['met date', 'date', 'met on', 'outreach date'] },
  { key: 'bornAgain', label: 'Born again', kind: 'yesno', group: 'Spiritual status', synonyms: ['saved', 'born-again', 'gave life to christ'] },
  { key: 'salvationDate', label: 'Salvation date', kind: 'date', group: 'Spiritual status', synonyms: ['date saved', 'date of salvation', 'born again date'] },
  { key: 'salvationPlace', label: 'Salvation place', kind: 'text', group: 'Spiritual status', synonyms: ['place saved', 'where saved', 'place of salvation', 'born again place'] },
  { key: 'baptised', label: 'Baptised', kind: 'yesno', group: 'Spiritual status', synonyms: ['baptized', 'water baptism', 'baptism', 'water baptised'] },
  { key: 'baptismDate', label: 'Baptism date', kind: 'date', group: 'Spiritual status', synonyms: ['date baptised', 'date baptized', 'date of baptism', 'baptised date', 'baptized date'] },
  { key: 'baptismPlace', label: 'Baptism place', kind: 'text', group: 'Spiritual status', synonyms: ['place baptised', 'place baptized', 'where baptised', 'where baptized', 'place of baptism', 'baptised place', 'baptized place'] },
  { key: 'inCellFellowship', label: 'Cell fellowship', kind: 'yesno', group: 'Spiritual status', synonyms: ['wsf', 'in cell fellowship', 'cell member', 'in wsf'] },
  { key: 'cellName', label: 'Cell name', kind: 'text', group: 'Spiritual status', synonyms: ['wsf name', 'cell', 'wsf area', 'cell fellowship name'] },
];

export function importTargets(fields: ContactField[]): Target[] {
  const extra = activeFields(fields).flatMap((f): Target[] => {
    const main: Target = {
      key: `custom:${f.id}`, label: f.label, group: 'More details', synonyms: [`attended ${f.label}`],
      kind: f.type === 'yesno' ? 'yesno' : f.type === 'date' ? 'date' : f.type === 'choice' ? 'choice' : 'text',
    };
    const out = [main];
    if (f.type === 'yesno' && f.askDate) out.push({ key: `custom:${f.id}:date`, label: `${f.label} date`, kind: 'date', group: 'More details', synonyms: [`date of ${f.label}`, `${f.label} year`] });
    if (f.type === 'yesno' && f.askPlace) out.push({ key: `custom:${f.id}:place`, label: `${f.label} place`, kind: 'text', group: 'More details', synonyms: [`place of ${f.label}`, `${f.label} location`, `where ${f.label}`] });
    return out;
  });
  return [...BASE_TARGETS, ...extra];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Suggests a target for each column by exact (normalised) name; each target is used once. */
export function autoMap(headers: string[], targets: Target[]): (string | '')[] {
  const used = new Set<string>();
  return headers.map((h) => {
    const n = norm(h);
    const t = targets.find((t) => !used.has(t.key) && [t.label, ...(t.synonyms ?? [])].some((s) => norm(s) === n));
    if (!t) return '';
    used.add(t.key);
    return t.key;
  });
}

// ── Validation ────────────────────────────────────────────────────────────────

export type RowStatus = 'ready' | 'duplicate' | 'error';

export interface RowResult {
  line: number;
  status: RowStatus;
  name: string;
  phone: string;
  problems: string[];
  warnings: string[];
  contact?: Contact;
}

export interface ImportOptions {
  country: CountryCode;
  tag?: string;
  userId: string;
}

function cellText(c: Cell): string {
  if (c === null || c === undefined) return '';
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c).trim();
}

function phoneText(c: Cell, country: CountryCode): string {
  let s = typeof c === 'number' ? String(Math.round(c)) : cellText(c);
  s = s.replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  const dial = getCountryCallingCode(country);
  // "2348031234567" typed without the plus sign
  if (!s.startsWith('+') && s.startsWith(dial) && s.length > 10 + dial.length - 1) s = '+' + s;
  return s;
}

export function buildRows(sheet: Sheet, mapping: (string | '')[], targets: Target[], fields: ContactField[], existing: Contact[], opts: ImportOptions): RowResult[] {
  const existingByPhone = new Map(existing.map((c) => [c.phone, c]));
  const seen = new Map<string, number>();
  const now = new Date().toISOString();
  const byKey = new Map(targets.map((t) => [t.key, t]));

  return sheet.rows.flatMap((row, i): RowResult[] => {
    if (row.every(blank)) return [];
    const line = i + 2;
    const problems: string[] = [];
    const warnings: string[] = [];
    const values: Record<string, Cell> = {};
    mapping.forEach((key, col) => { if (key && !blank(row[col] ?? null)) values[key] = row[col] ?? null; });

    const text = (k: string) => (values[k] !== undefined ? cellText(values[k]) : '');
    const date = (k: string) => {
      if (values[k] === undefined) return undefined;
      const d = parseDateCell(values[k]);
      if (!d) warnings.push(`${byKey.get(k)?.label ?? k}: couldn't read "${cellText(values[k])}" as a date`);
      return d;
    };
    const yesno = (k: string) => {
      if (values[k] === undefined) return undefined;
      const v = parseYesNo(values[k]);
      if (v === undefined) warnings.push(`${byKey.get(k)?.label ?? k}: "${cellText(values[k])}" isn't Y or N`);
      return v;
    };

    const name = text('name') || [text('firstName'), text('lastName')].filter(Boolean).join(' ');
    if (!name) problems.push('No name');

    let phone = '';
    const rawPhone = values.phone;
    if (rawPhone === undefined) problems.push('No phone number');
    else {
      const parsed = parsePhone(phoneText(rawPhone, opts.country), opts.country);
      if (parsed.valid && parsed.e164) phone = parsed.e164;
      else problems.push(`Phone "${cellText(rawPhone)}" isn't a valid number`);
    }

    const shown = phone || cellText(rawPhone ?? null);
    if (problems.length) return [{ line, status: 'error', name, phone: shown, problems, warnings }];

    const dup = existingByPhone.get(phone);
    if (dup) return [{ line, status: 'duplicate', name, phone, problems: [`Already saved as ${dup.name}${dup.archived ? ' (archived)' : ''}`], warnings }];
    const firstLine = seen.get(phone);
    if (firstLine) return [{ line, status: 'duplicate', name, phone, problems: [`Same number as row ${firstLine} in this file`], warnings }];
    seen.set(phone, line);

    // A date or place implies "Yes" when the yes/no column is empty.
    const salvationDate = date('salvationDate'), salvationPlace = text('salvationPlace') || undefined;
    const baptismDate = date('baptismDate'), baptismPlace = text('baptismPlace') || undefined;
    const cellName = text('cellName') || undefined;
    const bornAgain = yesno('bornAgain') ?? (salvationDate || salvationPlace ? true : undefined);
    const baptised = yesno('baptised') ?? (baptismDate || baptismPlace ? true : undefined);
    const inCell = yesno('inCellFellowship') ?? (cellName ? true : undefined);

    const custom: Record<string, CustomValue> = {};
    for (const f of activeFields(fields)) {
      const k = `custom:${f.id}`;
      const v: CustomValue = {};
      if (f.type === 'yesno') {
        const d = f.askDate ? date(`${k}:date`) : undefined;
        const p = f.askPlace ? text(`${k}:place`) || undefined : undefined;
        const yn = yesno(k) ?? (d || p ? true : undefined);
        if (yn !== undefined) v.value = yn;
        if (yn && d) v.date = d;
        if (yn && p) v.place = p;
      } else if (f.type === 'date') {
        const d = date(k);
        if (d) v.value = d;
      } else if (f.type === 'choice') {
        const raw = text(k);
        if (raw) {
          const match = (f.options ?? []).find((o) => o.toLowerCase() === raw.toLowerCase());
          if (!match) warnings.push(`${f.label}: "${raw}" isn't one of the listed answers (kept as typed)`);
          v.value = match ?? raw;
        }
      } else if (text(k)) v.value = text(k);
      if (Object.keys(v).length) custom[f.id] = v;
    }

    const tags = [...new Set([...text('tags').split(/[,;|]/).map((t) => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean), ...(opts.tag ? [opts.tag] : [])])];

    const contact: Contact = {
      id: `c${Date.now().toString(36)}-${i}`,
      name,
      phone,
      whatsappStatus: 'unknown',
      addedBy: opts.userId,
      addedAt: now,
      tags,
      notes: text('notes'),
      metLocation: text('metLocation') || undefined,
      metDate: date('metDate'),
      bornAgain,
      salvationDate: bornAgain ? salvationDate : undefined,
      salvationPlace: bornAgain ? salvationPlace : undefined,
      baptised,
      baptismDate: baptised ? baptismDate : undefined,
      baptismPlace: baptised ? baptismPlace : undefined,
      inCellFellowship: inCell,
      cellName: inCell ? cellName : undefined,
      custom: Object.keys(custom).length ? custom : undefined,
    };
    return [{ line, status: 'ready', name, phone, problems: [], warnings, contact }];
  });
}

/** Header row for the downloadable template, matching the auto-mapping names. */
export function templateHeaders(fields: ContactField[]): string[] {
  return importTargets(fields).filter((t) => t.key !== 'firstName' && t.key !== 'lastName').map((t) => t.label);
}

export async function downloadTemplate(fields: ContactField[]): Promise<void> {
  const headers = templateHeaders(fields);
  const sample: Record<string, string> = {
    Name: 'Adaeze Okonkwo', Phone: '0803 123 4567', Tags: 'harvest-field', Notes: 'Prays for her family',
    'Location met': 'Ota Market', 'Date met': '28/09/2026', 'Born again': 'Y', 'Salvation date': '28/09/2026',
    'Salvation place': 'Ota Market outreach', Baptised: 'N', 'Baptism date': '', 'Baptism place': '',
    'Cell fellowship': 'Y', 'Cell name': 'Canaan Estate WSF',
  };
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  await writeXlsxFile(
    [
      headers.map((h) => ({ value: h, fontWeight: 'bold' as const })),
      headers.map((h) => ({ value: sample[h] ?? '' })),
    ],
    { columns: headers.map((h) => ({ width: Math.max(14, h.length + 4) })), stickyRowsCount: 1 },
  ).toFile('contacts-import-template.xlsx');
}
