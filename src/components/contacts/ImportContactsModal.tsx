import { useMemo, useState } from 'react';
import type { CountryCode } from 'libphonenumber-js';
import type { AuthUser, Contact } from '../../types';
import { store } from '../../lib/store';
import { getCountryOptions } from '../../lib/phone';
import {
  MAX_ROWS, autoMap, buildRows, downloadTemplate, importTargets, readSpreadsheet,
  type RowResult, type Sheet, type Target,
} from '../../lib/contactImport';
import { useToast } from '../ui/Toast';

interface Props {
  user: AuthUser;
  onClose: () => void;
  onImported: (all: Contact[], added: number) => void;
}

type Step = 'upload' | 'map' | 'review' | 'done';
const GROUPS: Target['group'][] = ['Contact', 'Where we met', 'Spiritual status', 'More details'];
const PREVIEW_ROWS = 200;

export default function ImportContactsModal({ user, onClose, onImported }: Props) {
  const { toast } = useToast();
  const fields = useMemo(() => store.getFields(), []);
  const targets = useMemo(() => importTargets(fields), [fields]);
  const countries = useMemo(() => getCountryOptions(), []);

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<(string | '')[]>([]);
  const [country, setCountry] = useState<CountryCode>('NG');
  const [tag, setTag] = useState('imported');
  const [results, setResults] = useState<RowResult[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState(0);
  const [show, setShow] = useState<'all' | 'ready' | 'skipped' | 'warnings'>('all');

  const mapped = new Set(mapping.filter(Boolean));
  const hasName = mapped.has('name') || mapped.has('firstName') || mapped.has('lastName');
  const ready = results.filter((r) => r.status === 'ready');
  const dups = results.filter((r) => r.status === 'duplicate');
  const errors = results.filter((r) => r.status === 'error');
  const warned = results.filter((r) => r.warnings.length > 0 && r.status === 'ready');

  async function pickFile(file?: File) {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const s = await readSpreadsheet(file);
      setSheet(s);
      setFileName(file.name);
      setMapping(autoMap(s.headers, targets));
      setStep('map');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  }

  function setColumn(col: number, key: string) {
    setMapping((m) => m.map((k, i) => (i === col ? key : key && k === key ? '' : k)));
  }

  function review() {
    if (!sheet) return;
    const cleanTag = tag.trim().toLowerCase().replace(/\s+/g, '-');
    setResults(buildRows(sheet, mapping, targets, fields, store.getContacts(), { country, tag: cleanTag || undefined, userId: user.id }));
    setShow('all');
    setStep('review');
  }

  function runImport() {
    const contacts = ready.map((r) => r.contact!);
    const existing = new Set(store.getContacts().map((c) => c.phone));
    const fresh = contacts.filter((c) => !existing.has(c.phone));
    const all = [...fresh, ...store.getContacts()];
    store.saveContacts(all);
    setImported(fresh.length);
    onImported(all, fresh.length);
    toast('success', `${fresh.length} contacts imported`);
    setStep('done');
  }

  const sample = (col: number) => {
    const v = sheet?.rows.find((r) => r[col] !== null && r[col] !== undefined && String(r[col]).trim() !== '')?.[col];
    if (v === undefined || v === null) return '';
    return v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  };

  const visible = results.filter((r) =>
    show === 'all' ? true : show === 'ready' ? r.status === 'ready' : show === 'skipped' ? r.status !== 'ready' : r.warnings.length > 0,
  );

  return (
    <div className="overlay">
      <div className="modal modal-tall" style={{ maxWidth: step === 'upload' || step === 'done' ? '560px' : '820px' }}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.2rem', fontWeight: 500 }}>Import contacts</h2>
            <p style={{ fontSize: '12.5px', color: 'var(--text-3)', marginTop: '2px' }}>
              {step === 'upload' && 'From an Excel (.xlsx) or CSV file'}
              {step === 'map' && `${fileName} · ${sheet?.rows.length ?? 0} rows · match each column`}
              {step === 'review' && `${fileName} · check before importing`}
              {step === 'done' && 'Finished'}
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          {step === 'upload' && (
            <>
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); void pickFile(e.dataTransfer.files[0]); }}
                style={{ border: '2px dashed var(--border)', borderRadius: '12px', padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: 'var(--surface-2)' }}
              >
                <input type="file" accept=".xlsx,.csv,.txt" style={{ display: 'none' }} onChange={(e) => void pickFile(e.target.files?.[0])} />
                <p style={{ fontWeight: 600, fontSize: '14px' }}>{busy ? 'Reading file…' : 'Choose a file or drop it here'}</p>
                <p style={{ fontSize: '12.5px', color: 'var(--text-3)', marginTop: '4px' }}>Excel (.xlsx) or CSV · first row must be column names · up to {MAX_ROWS.toLocaleString()} contacts</p>
              </label>
              {error && <div className="alert alert-red">{error}</div>}
              <div className="alert alert-navy" style={{ display: 'block' }}>
                <p style={{ fontWeight: 600, marginBottom: '4px' }}>Tips</p>
                <ul style={{ paddingLeft: '18px', fontSize: '12.5px', lineHeight: 1.7 }}>
                  <li>Only <strong>Name</strong> and <strong>Phone</strong> are required. Numbers like 0803 123 4567 are read as Nigerian unless you pick another country.</li>
                  <li>Yes/no columns accept Y, N, Yes, No, 1 or 0. Dates can be 28/09/2026 (day first) or 2026-09-28.</li>
                  <li>Numbers already saved are skipped, so importing the same file twice is safe.</li>
                </ul>
              </div>
              <button type="button" className="btn btn-outline" onClick={() => void downloadTemplate(fields)}>
                Download template (.xlsx) with all fields
              </button>
            </>
          )}

          {step === 'map' && sheet && (
            <>
              <div className="table-scroll" style={{ border: '1px solid var(--border)', borderRadius: '8px', overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr><th style={{ paddingLeft: '14px' }}>Column in your file</th><th>Example</th><th>Save as</th></tr>
                  </thead>
                  <tbody>
                    {sheet.headers.map((h, col) => (
                      <tr key={col}>
                        <td style={{ paddingLeft: '14px', fontWeight: 600 }}>{h}</td>
                        <td style={{ color: 'var(--text-3)', fontSize: '12.5px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sample(col) || '—'}</td>
                        <td>
                          <select className="input" value={mapping[col] ?? ''} onChange={(e) => setColumn(col, e.target.value)} style={{ minWidth: '200px' }}>
                            <option value="">Don't import</option>
                            {GROUPS.map((g) => {
                              const opts = targets.filter((t) => t.group === g);
                              return opts.length ? (
                                <optgroup key={g} label={g}>
                                  {opts.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                                </optgroup>
                              ) : null;
                            })}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid-2">
                <div>
                  <label className="label">Country for numbers without +code</label>
                  <select className="input" value={country} onChange={(e) => setCountry(e.target.value as CountryCode)}>
                    {countries.map((c) => <option key={c.iso} value={c.iso}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Add this tag to everyone imported</label>
                  <input className="input" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. shiloh-2026 (optional)" />
                </div>
              </div>
              {(!hasName || !mapped.has('phone')) && (
                <div className="alert alert-amber">Choose which column holds the {!hasName ? 'name' : ''}{!hasName && !mapped.has('phone') ? ' and the ' : ''}{!mapped.has('phone') ? 'phone number' : ''}.</div>
              )}
            </>
          )}

          {step === 'review' && (
            <>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {([
                  ['all', `All rows (${results.length})`],
                  ['ready', `Ready (${ready.length})`],
                  ['skipped', `Skipped (${dups.length + errors.length})`],
                  ['warnings', `Check (${warned.length})`],
                ] as const).map(([k, label]) => (
                  <button key={k} type="button" className={`chip ${show === k ? 'chip-on' : ''}`} onClick={() => setShow(k)}>{label}</button>
                ))}
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-3)' }}>
                {ready.length} will be imported. {dups.length > 0 && `${dups.length} already saved (skipped). `}
                {errors.length > 0 && `${errors.length} have a missing name or invalid phone (skipped). `}
                {warned.length > 0 && `${warned.length} have a value that couldn't be read; that value is left blank.`}
              </p>
              <div className="table-scroll" style={{ border: '1px solid var(--border)', borderRadius: '8px', maxHeight: '380px', overflow: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr><th style={{ paddingLeft: '14px' }}>Row</th><th>Name</th><th>Phone</th><th>Status</th><th>Details</th></tr>
                  </thead>
                  <tbody>
                    {visible.slice(0, PREVIEW_ROWS).map((r) => (
                      <tr key={r.line}>
                        <td style={{ paddingLeft: '14px', color: 'var(--text-3)' }}>{r.line}</td>
                        <td style={{ fontWeight: 500 }}>{r.name || '—'}</td>
                        <td className="mono" style={{ fontSize: '12.5px' }}>{r.phone || '—'}</td>
                        <td>
                          <span className={`badge ${r.status === 'ready' ? 'badge-green' : r.status === 'duplicate' ? 'badge-gray' : 'badge-red'}`}>
                            {r.status === 'ready' ? 'Ready' : r.status === 'duplicate' ? 'Already saved' : 'Error'}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px', color: r.problems.length ? 'var(--text-2)' : 'var(--amber)' }}>
                          {[...r.problems, ...r.warnings].join(' · ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {visible.length > PREVIEW_ROWS && (
                <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>Showing the first {PREVIEW_ROWS} of {visible.length} rows.</p>
              )}
            </>
          )}

          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <p style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.6rem', color: 'var(--navy)' }}>{imported}</p>
              <p style={{ fontWeight: 600 }}>contacts imported</p>
              <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '10px', lineHeight: 1.6 }}>
                Their WhatsApp status is "Unverified". Use <strong>Verify</strong> on the Contacts page to check them,
                and <strong>Messaging</strong> to send a welcome to everyone tagged “{tag.trim() || 'imported'}”.
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {step === 'upload' && <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>}
          {step === 'map' && (
            <>
              <button type="button" className="btn btn-outline" onClick={() => setStep('upload')}>Back</button>
              <button type="button" className="btn btn-primary" disabled={!hasName || !mapped.has('phone')} onClick={review}>Check rows</button>
            </>
          )}
          {step === 'review' && (
            <>
              <button type="button" className="btn btn-outline" onClick={() => setStep('map')}>Back</button>
              <button type="button" className="btn btn-primary" disabled={ready.length === 0} onClick={runImport}>
                Import {ready.length} contact{ready.length === 1 ? '' : 's'}
              </button>
            </>
          )}
          {step === 'done' && <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>}
        </div>
      </div>
    </div>
  );
}
