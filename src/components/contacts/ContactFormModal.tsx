import { useMemo, useState } from 'react';
import type { AttendanceCommitment, AuthUser, Contact, ServiceType, WhatsAppStatus } from '../../types';
import { store } from '../../lib/store';
import { parsePhone } from '../../lib/phone';
import { COMMITMENT_LABEL, SERVICE_OPTIONS, SPECIAL_EVENTS, fmtDate, todayIso } from '../../lib/services';
import { PLACEHOLDERS, fillWelcome, type WelcomeChannel, type WelcomeOptions } from '../../lib/welcome';
import PhoneInput from '../ui/PhoneInput';
import { useToast } from '../ui/Toast';

export const TAG_OPTIONS = ['harvest-field', 'soul-winning', 'follow-up', 'youth', 'wsf', 'new-convert'];

export function WaBadge({ status }: { status: WhatsAppStatus }) {
  if (status === 'active') return <span className="badge badge-green">WhatsApp</span>;
  if (status === 'inactive') return <span className="badge badge-gray">SMS only</span>;
  if (status === 'checking') return <span className="badge badge-amber">Checking…</span>;
  if (status === 'error') return <span className="badge badge-red">Check failed</span>;
  return <span className="badge badge-amber">Unverified</span>;
}

function YesNo({ value, onChange }: { value?: boolean; onChange: (v: boolean | undefined) => void }) {
  return (
    <div className="seg" role="group">
      <button type="button" className={value === true ? 'on' : ''} onClick={() => onChange(value === true ? undefined : true)}>
        Yes
      </button>
      <button type="button" className={value === false ? 'on' : ''} onClick={() => onChange(value === false ? undefined : false)}>
        No
      </button>
    </div>
  );
}

type FormState = {
  name: string;
  phone: string;
  tags: string[];
  notes: string;
  metLocation: string;
  metDate: string;
  bornAgain?: boolean;
  salvationDate: string;
  salvationPlace: string;
  baptised?: boolean;
  baptismDate: string;
  inCellFellowship?: boolean;
  cellName: string;
  attendanceCommitment?: AttendanceCommitment;
  committedServices: ServiceType[];
  committedSpecialEvent: string;
};

function initialForm(c?: Contact): FormState {
  return {
    name: c?.name ?? '',
    phone: c?.phone ?? '',
    tags: c ? [...c.tags] : ['harvest-field'],
    notes: c?.notes ?? '',
    metLocation: c?.metLocation ?? '',
    metDate: c?.metDate ?? (c ? '' : todayIso()),
    bornAgain: c?.bornAgain,
    salvationDate: c?.salvationDate ?? '',
    salvationPlace: c?.salvationPlace ?? '',
    baptised: c?.baptised,
    baptismDate: c?.baptismDate ?? '',
    inCellFellowship: c?.inCellFellowship,
    cellName: c?.cellName ?? '',
    attendanceCommitment: c?.attendanceCommitment,
    committedServices: c?.committedServices ? [...c.committedServices] : [],
    committedSpecialEvent: c?.committedSpecialEvent ?? '',
  };
}

interface Props {
  mode: 'add' | 'edit';
  contact?: Contact;
  contacts: Contact[];
  user: AuthUser;
  onSave: (contact: Contact, welcome?: WelcomeOptions) => void;
  onClose: () => void;
  onOpenExisting: (c: Contact) => void;
  onCheckWa?: (c: Contact) => Promise<void>;
  checking?: string | null;
}

export default function ContactFormModal({
  mode, contact, contacts, user, onSave, onClose, onOpenExisting, onCheckWa, checking,
}: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(() => initialForm(contact));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Welcome message (add mode only)
  const [templates, setTemplates] = useState(() => store.getWelcomeTemplates());
  const [sendWelcome, setSendWelcome] = useState(true);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? 'custom');
  const [welcomeText, setWelcomeText] = useState(templates[0]?.text ?? '');
  const [welcomeChannel, setWelcomeChannel] = useState<WelcomeChannel>('auto');

  const users = useMemo(() => store.getUsers(), []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const duplicate = form.phone
    ? contacts.find((c) => c.phone === form.phone && c.id !== contact?.id)
    : undefined;

  const welcomePreview = fillWelcome(welcomeText, {
    name: form.name || 'Friend',
    metLocation: form.metLocation,
    metDate: form.metDate,
    committedServices: form.committedServices,
    committedSpecialEvent: form.committedSpecialEvent,
  });

  function toggleIn<T>(list: T[], item: T): T[] {
    return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  }

  function pickTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) setWelcomeText(t.text);
  }

  function saveAsTemplate() {
    const label = prompt('Name this welcome message template:');
    if (!label?.trim()) return;
    const t = { id: 'w' + Date.now(), label: label.trim(), text: welcomeText.trim() };
    const next = [...templates, t];
    store.saveWelcomeTemplates(next);
    setTemplates(next);
    setTemplateId(t.id);
    toast('success', 'Template saved', t.label);
  }

  function deleteTemplate() {
    const t = templates.find((x) => x.id === templateId);
    if (!t || t.builtIn) return;
    if (!confirm(`Delete the "${t.label}" template?`)) return;
    const next = templates.filter((x) => x.id !== t.id);
    store.saveWelcomeTemplates(next);
    setTemplates(next);
    pickTemplate(next[0]?.id ?? 'custom');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const parsed = parsePhone(form.phone);
    if (!parsed.valid || !parsed.e164) {
      setError(parsed.error ?? 'Enter a valid phone number.');
      return;
    }
    if (duplicate) {
      setError(`This number is already saved as ${duplicate.name}.`);
      return;
    }
    if (form.committedServices.includes('special-event') && !form.committedSpecialEvent) {
      setError('Select which special event they committed to.');
      return;
    }
    if (mode === 'add' && sendWelcome && !welcomeText.trim()) {
      setError('Write a welcome message or untick "Send a welcome message".');
      return;
    }

    setSaving(true);
    await new Promise((r) => setTimeout(r, 250));

    const base: Contact = contact ?? {
      id: 'c' + Date.now(),
      name: '',
      phone: '',
      whatsappStatus: 'unknown',
      addedBy: user.id,
      addedAt: new Date().toISOString(),
      tags: [],
      notes: '',
    };
    const phoneChanged = contact && contact.phone !== parsed.e164;
    const saved: Contact = {
      ...base,
      name: form.name.trim(),
      phone: parsed.e164,
      whatsappStatus: phoneChanged ? 'unknown' : base.whatsappStatus,
      whatsappCheckSource: phoneChanged ? undefined : base.whatsappCheckSource,
      whatsappCheckedAt: phoneChanged ? undefined : base.whatsappCheckedAt,
      tags: form.tags,
      notes: form.notes.trim(),
      metLocation: form.metLocation.trim() || undefined,
      metDate: form.metDate || undefined,
      bornAgain: form.bornAgain,
      salvationDate: form.bornAgain ? form.salvationDate || undefined : undefined,
      salvationPlace: form.bornAgain ? form.salvationPlace.trim() || undefined : undefined,
      baptised: form.baptised,
      baptismDate: form.baptised ? form.baptismDate || undefined : undefined,
      inCellFellowship: form.inCellFellowship,
      cellName: form.inCellFellowship ? form.cellName.trim() || undefined : undefined,
      attendanceCommitment: form.attendanceCommitment,
      committedServices: form.attendanceCommitment === 'yes' ? form.committedServices : [],
      committedSpecialEvent:
        form.attendanceCommitment === 'yes' && form.committedServices.includes('special-event')
          ? form.committedSpecialEvent
          : undefined,
    };

    setSaving(false);
    onSave(saved, mode === 'add' && sendWelcome ? { text: welcomeText.trim(), channel: welcomeChannel } : undefined);
  }

  const isChecking = contact && (checking === contact.id || contact.whatsappStatus === 'checking');
  const dupAddedBy = duplicate ? users.find((u) => u.id === duplicate.addedBy)?.name : undefined;

  return (
    <div className="overlay">
      <div className="modal modal-tall" style={{ maxWidth: '620px' }}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.2rem', fontWeight: 500 }}>
              {mode === 'add' ? 'Add New Contact' : 'Edit Contact'}
            </h2>
            <p style={{ fontSize: '12.5px', color: 'var(--text-3)', marginTop: '2px' }}>
              {mode === 'add' ? 'Record a soul from the harvest field' : contact?.name}
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* ── Basic details ─────────────────────────────────────────── */}
            <div className="form-section">
              <p className="form-section-title">Contact details</p>

              {mode === 'edit' && contact && onCheckWa && (
                <div className="field-row" style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>WhatsApp:</span>
                      <WaBadge status={contact.whatsappStatus} />
                    </div>
                    {contact.whatsappCheckedAt && (
                      <span style={{ fontSize: '11.5px', color: 'var(--text-3)' }}>
                        {contact.whatsappCheckSource === 'provider'
                          ? `Verified by provider on ${fmtDate(contact.whatsappCheckedAt)}`
                          : `Demo result (${fmtDate(contact.whatsappCheckedAt)}) — no provider connected`}
                      </span>
                    )}
                  </div>
                  <button type="button" className="btn btn-outline btn-sm" disabled={!!isChecking} onClick={() => onCheckWa(contact)}>
                    {isChecking ? 'Checking…' : 'Check WhatsApp'}
                  </button>
                </div>
              )}

              <div>
                <label className="label">Full name *</label>
                <input required className="input" value={form.name} onChange={(e) => set('name', e.target.value)}
                  placeholder="Adaeze Okonkwo" autoFocus={mode === 'add'} />
              </div>
              <div>
                <label className="label">Phone number *</label>
                <PhoneInput
                  value={form.phone}
                  onChange={(e164, meta) => {
                    set('phone', e164);
                    if (meta.valid) setError('');
                  }}
                />
              </div>

              {duplicate && (
                <div className="alert alert-amber" role="alert">
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: '2px' }}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
                  </svg>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600 }}>This number has already been saved</p>
                    <p>
                      It belongs to <strong>{duplicate.name}</strong>, added {fmtDate(duplicate.addedAt)}
                      {dupAddedBy ? ` by ${dupAddedBy}` : ''}
                      {duplicate.archived ? ' (currently archived)' : ''}.
                    </p>
                    <button type="button" className="btn btn-outline btn-xs" style={{ marginTop: '8px' }} onClick={() => onOpenExisting(duplicate)}>
                      Open existing contact
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Harvest field ─────────────────────────────────────────── */}
            <div className="form-section">
              <p className="form-section-title">Where we met</p>
              <div className="grid-2">
                <div>
                  <label className="label">Location met</label>
                  <input className="input" value={form.metLocation} onChange={(e) => set('metLocation', e.target.value)}
                    placeholder="e.g. Ota Market, Sango bus stop" />
                </div>
                <div>
                  <label className="label">Date met</label>
                  <input type="date" className="input" value={form.metDate} max={todayIso()} onChange={(e) => set('metDate', e.target.value)} />
                </div>
              </div>
            </div>

            {/* ── Spiritual status ──────────────────────────────────────── */}
            <div className="form-section">
              <p className="form-section-title">Spiritual status</p>

              <div className="field-row">
                <span>Born again?</span>
                <YesNo value={form.bornAgain} onChange={(v) => set('bornAgain', v)} />
              </div>
              {form.bornAgain && (
                <div className="grid-2">
                  <div>
                    <label className="label">Date of salvation</label>
                    <input type="date" className="input" value={form.salvationDate} max={todayIso()} onChange={(e) => set('salvationDate', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Where they received salvation</label>
                    <input className="input" value={form.salvationPlace} onChange={(e) => set('salvationPlace', e.target.value)}
                      placeholder="e.g. Harvest field outreach, Shiloh" />
                  </div>
                </div>
              )}

              <div className="field-row">
                <span>Baptised?</span>
                <YesNo value={form.baptised} onChange={(v) => set('baptised', v)} />
              </div>
              {form.baptised && (
                <div className="grid-2">
                  <div>
                    <label className="label">Date of baptism</label>
                    <input type="date" className="input" value={form.baptismDate} max={todayIso()} onChange={(e) => set('baptismDate', e.target.value)} />
                  </div>
                </div>
              )}

              <div className="field-row">
                <span>Belongs to a Cell Fellowship (WSF)?</span>
                <YesNo value={form.inCellFellowship} onChange={(v) => set('inCellFellowship', v)} />
              </div>
              {form.inCellFellowship && (
                <div>
                  <label className="label">Cell fellowship name / area</label>
                  <input className="input" value={form.cellName} onChange={(e) => set('cellName', e.target.value)} placeholder="e.g. Canaan Estate WSF" />
                </div>
              )}
            </div>

            {/* ── Service commitment ────────────────────────────────────── */}
            <div className="form-section">
              <p className="form-section-title">Service attendance</p>
              <div>
                <label className="label">Will they be attending service?</label>
                <div className="seg">
                  {(Object.keys(COMMITMENT_LABEL) as AttendanceCommitment[]).map((k) => (
                    <button key={k} type="button" className={form.attendanceCommitment === k ? 'on' : ''}
                      onClick={() => set('attendanceCommitment', form.attendanceCommitment === k ? undefined : k)}>
                      {COMMITMENT_LABEL[k]}
                    </button>
                  ))}
                </div>
              </div>
              {form.attendanceCommitment === 'yes' && (
                <>
                  <div>
                    <label className="label">Service(s) they committed to</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {SERVICE_OPTIONS.map((s) => (
                        <button key={s.id} type="button"
                          className={`chip ${form.committedServices.includes(s.id) ? 'chip-on' : ''}`}
                          onClick={() => set('committedServices', toggleIn(form.committedServices, s.id))}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {form.committedServices.includes('special-event') && (
                    <div>
                      <label className="label">Special event</label>
                      <select className="input" value={form.committedSpecialEvent} onChange={(e) => set('committedSpecialEvent', e.target.value)}>
                        <option value="">Select event…</option>
                        {SPECIAL_EVENTS.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Tags & notes ──────────────────────────────────────────── */}
            <div className="form-section">
              <p className="form-section-title">Tags & notes</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {TAG_OPTIONS.map((t) => (
                  <button key={t} type="button" onClick={() => set('tags', toggleIn(form.tags, t))}
                    className={`chip ${form.tags.includes(t) ? 'chip-on' : ''}`}>
                    {t}
                  </button>
                ))}
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)}
                  placeholder="Prayer points, family details, follow-up plans…" />
              </div>
            </div>

            {/* ── Welcome message ───────────────────────────────────────── */}
            {mode === 'add' && (
              <div className="form-section">
                <div className="field-row">
                  <p className="form-section-title">Welcome message</p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-2)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={sendWelcome} onChange={(e) => setSendWelcome(e.target.checked)} />
                    Send a welcome message
                  </label>
                </div>
                {sendWelcome && (
                  <>
                    <div className="grid-2">
                      <div>
                        <label className="label">Message template</label>
                        <select className="input" value={templateId} onChange={(e) => pickTemplate(e.target.value)}>
                          {templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                          <option value="custom">Write a custom message…</option>
                        </select>
                      </div>
                      <div>
                        <label className="label">Send via</label>
                        <select className="input" value={welcomeChannel} onChange={(e) => setWelcomeChannel(e.target.value as WelcomeChannel)}>
                          <option value="auto">WhatsApp if available, otherwise SMS</option>
                          <option value="sms">SMS only</option>
                          <option value="whatsapp">WhatsApp only</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="label">Message (edit freely for this person)</label>
                      <textarea className="input" rows={4} value={welcomeText}
                        onChange={(e) => { setWelcomeText(e.target.value); if (templateId !== 'custom' && templates.find((t) => t.id === templateId)?.text !== e.target.value) setTemplateId('custom'); }}
                        placeholder="Dear {name}, it was a joy meeting you at {location}…" />
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '5px', flexWrap: 'wrap' }}>
                        <p style={{ fontSize: '11.5px', color: 'var(--text-3)' }}>
                          Placeholders: {PLACEHOLDERS.map((p) => (
                            <code key={p.key} title={p.hint} className="mono" style={{ fontSize: '11px', marginRight: '6px' }}>{p.key}</code>
                          ))}
                        </p>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {templates.find((t) => t.id === templateId && !t.builtIn) && (
                            <button type="button" className="btn btn-ghost btn-xs" onClick={deleteTemplate}>Delete template</button>
                          )}
                          <button type="button" className="btn btn-outline btn-xs" disabled={!welcomeText.trim()} onClick={saveAsTemplate}>
                            Save as template
                          </button>
                        </div>
                      </div>
                    </div>
                    {welcomeText.trim() && (
                      <div style={{ background: '#dcf8c6', borderRadius: '12px 12px 4px 12px', padding: '10px 13px', fontSize: '13px', lineHeight: 1.6, color: '#1a1a1a' }}>
                        {welcomePreview}
                        <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '6px' }}>
                          {welcomePreview.length} characters{welcomePreview.length > 160 ? ' — an SMS will be sent in multiple parts' : ''}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {error && <div className="alert alert-red" role="alert">{error}</div>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={saving || !!duplicate} className="btn btn-primary">
              {saving ? 'Saving…' : mode === 'add' ? (sendWelcome ? 'Save & send welcome' : 'Save contact') : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
