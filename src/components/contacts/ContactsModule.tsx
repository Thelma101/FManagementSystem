import { useState } from 'react';
import type { Contact, AuthUser, MessageLog, WhatsAppStatus } from '../../types';
import { store } from '../../lib/store';
import { checkWhatsApp, sendMessage } from '../../lib/mockApi';
import { parsePhone } from '../../lib/phone';
import { useToast } from '../ui/Toast';
import PhoneInput from '../ui/PhoneInput';

interface Props {
  user: AuthUser;
  contacts: Contact[];
  onContactsChange: (c: Contact[]) => void;
  onLogAdded: (l: MessageLog) => void;
}

const TAG_OPTIONS = ['harvest-field', 'soul-winning', 'follow-up', 'youth', 'wsf', 'new-convert'];

function WaBadge({ status }: { status: WhatsAppStatus }) {
  if (status === 'active')   return <span className="badge badge-green">WhatsApp</span>;
  if (status === 'inactive') return <span className="badge badge-gray">SMS only</span>;
  if (status === 'checking') return <span className="badge badge-amber">Checking…</span>;
  if (status === 'error')    return <span className="badge badge-red">Error</span>;
  return <span className="badge badge-amber">Unverified</span>;
}

// ── Edit Contact Modal ──────────────────────────────────────────────────────
function EditModal({ contact, contacts, onSave, onClose, onCheckWa, checking }: {
  contact: Contact;
  contacts: Contact[];
  onSave: (updated: Contact) => void;
  onClose: () => void;
  onCheckWa: (c: Contact) => Promise<void>;
  checking: string | null;
}) {
  const [form, setForm] = useState({
    name: contact.name,
    phone: contact.phone,
    phoneValid: true as boolean,
    tags: [...contact.tags],
    notes: contact.notes,
  });
  const [error, setError] = useState('');

  function toggleTag(t: string) {
    setForm((f) => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parsePhone(form.phone);
    if (!parsed.valid || !parsed.e164) {
      setError(parsed.error ?? 'Enter a valid phone number.');
      return;
    }
    const duplicate = contacts.find((c) => c.phone === parsed.e164 && c.id !== contact.id);
    if (duplicate) { setError('Another contact already uses this number.'); return; }
    onSave({ ...contact, name: form.name.trim(), phone: parsed.e164, tags: form.tags, notes: form.notes.trim() });
  }

  const isChecking = checking === contact.id || contact.whatsappStatus === 'checking';

  return (
    <div className="overlay">
      <div className="modal" style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.2rem', fontWeight: 500 }}>Edit Contact</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSave}>
          <div className="modal-body">
            {/* WhatsApp status + check — in the edit modal where it belongs */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', borderRadius: '8px',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>WhatsApp status:</span>
                <WaBadge status={contact.whatsappStatus} />
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={isChecking}
                onClick={() => onCheckWa(contact)}
              >
                {isChecking ? 'Checking…' : 'Check WhatsApp'}
              </button>
            </div>
            <div>
              <label className="label">Full Name *</label>
              <input required className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Phone Number *</label>
              <PhoneInput
                value={form.phone}
                onChange={(e164, meta) => {
                  setForm((f) => ({ ...f, phone: e164, phoneValid: meta.valid }));
                  if (meta.valid) setError('');
                }}
              />
            </div>
            <div>
              <label className="label">Tags</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {TAG_OPTIONS.map((t) => (
                  <button key={t} type="button" onClick={() => toggleTag(t)}
                    className={`chip ${form.tags.includes(t) ? 'chip-on' : ''}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="input" rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Follow-up notes…" />
            </div>
            {error && <p className="field-error">{error}</p>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save changes</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Send Modal ──────────────────────────────────────────────────────────────
function SendModal({ contact, onClose, onSent }: {
  contact: Contact;
  onClose: () => void;
  onSent: (log: MessageLog, channel: 'sms' | 'whatsapp' | 'both') => void;
}) {
  const { toast } = useToast();
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState<'sms' | 'whatsapp' | null>(null);

  const canWa = contact.whatsappStatus === 'active';

  async function send(channel: 'sms' | 'whatsapp') {
    if (!msg.trim()) return;
    setSending(channel);
    const result = await sendMessage(contact.phone, channel, msg);
    const log: MessageLog = {
      id: 'ml' + Date.now(),
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: contact.phone,
      channel,
      content: msg,
      status: result.success ? 'delivered' : 'failed',
      sentAt: new Date().toISOString(),
      sentBy: 'You',
    };
    setSending(null);
    toast('success', `Sent via ${channel === 'sms' ? 'SMS' : 'WhatsApp'}`, contact.name);
    onSent(log, channel);
    onClose();
  }

  return (
    <div className="overlay">
      <div className="modal" style={{ maxWidth: '420px' }}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.2rem', fontWeight: 500 }}>Send Message</h2>
            <p style={{ fontSize: '12.5px', color: 'var(--text-3)', marginTop: '2px' }}>
              to {contact.name} · <span className="mono" style={{ fontSize: '12px' }}>{contact.phone}</span>
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div>
            <label className="label">Message</label>
            <textarea
              className="input"
              rows={5}
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder={`Dear ${contact.name.split(' ')[0]}, you are warmly invited…`}
              autoFocus
            />
            <p style={{ fontSize: '11.5px', color: msg.length > 160 ? 'var(--amber)' : 'var(--text-3)', textAlign: 'right', marginTop: '3px' }}>
              {msg.length} chars{msg.length > 160 ? ' — may split into 2 SMS' : ''}
            </p>
          </div>

          {/* WhatsApp status note */}
          {!canWa && contact.whatsappStatus !== 'unknown' && (
            <p style={{ fontSize: '12.5px', color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '9px 12px' }}>
              WhatsApp not detected on this number — SMS only available.
            </p>
          )}
          {contact.whatsappStatus === 'unknown' && (
            <p style={{ fontSize: '12.5px', color: 'var(--amber)', background: 'var(--amber-bg)', border: '1px solid #f0d9b0', borderRadius: '7px', padding: '9px 12px' }}>
              WhatsApp status unverified. Check the contact to enable WhatsApp delivery.
            </p>
          )}
        </div>
        <div className="modal-footer" style={{ gap: '8px' }}>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-sms"
            disabled={!msg.trim() || sending !== null}
            onClick={() => send('sms')}
          >
            {sending === 'sms' ? 'Sending…' : 'Send SMS'}
          </button>
          <button
            className="btn btn-wa"
            disabled={!msg.trim() || sending !== null || !canWa}
            onClick={() => send('whatsapp')}
            title={!canWa ? 'WhatsApp not active on this number' : ''}
          >
            {sending === 'whatsapp' ? 'Sending…' : 'Send WhatsApp'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main module ─────────────────────────────────────────────────────────────
export default function ContactsModule({ user, contacts, onContactsChange, onLogAdded }: Props) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Contact | null>(null);
  const [sendTarget, setSendTarget] = useState<Contact | null>(null);
  const [addForm, setAddForm] = useState({ name: '', phone: '', phoneValid: false, tags: [] as string[], notes: '' });
  const [addError, setAddError] = useState('');
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterWa, setFilterWa] = useState<WhatsAppStatus | ''>('');
  const [showArchived, setShowArchived] = useState(false);

  const active = contacts.filter((c) => !c.archived);
  const archived = contacts.filter((c) => c.archived);
  const pool = showArchived ? archived : active;

  const filtered = pool.filter((c) => {
    const q = search.toLowerCase();
    if (q && !c.name.toLowerCase().includes(q) && !c.phone.includes(q) && !c.notes.toLowerCase().includes(q)) return false;
    if (filterTag && !c.tags.includes(filterTag)) return false;
    if (filterWa && c.whatsappStatus !== filterWa) return false;
    return true;
  });

  const unverified = active.filter((c) => c.whatsappStatus === 'unknown');

  function toggleAddTag(t: string) {
    setAddForm((f) => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    const parsed = parsePhone(addForm.phone);
    if (!parsed.valid || !parsed.e164) {
      setAddError(parsed.error ?? 'Enter a valid international phone number.');
      return;
    }
    if (contacts.some((c) => c.phone === parsed.e164)) {
      setAddError('This number already exists in your contacts.');
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 300));
    const c: Contact = {
      id: 'c' + Date.now(),
      name: addForm.name.trim(),
      phone: parsed.e164,
      whatsappStatus: 'unknown',
      addedBy: user.id,
      addedAt: new Date().toISOString(),
      tags: addForm.tags,
      notes: addForm.notes.trim(),
    };
    const updated = [c, ...contacts];
    store.saveContacts(updated);
    onContactsChange(updated);
    setAddForm({ name: '', phone: '', phoneValid: false, tags: [], notes: '' });
    setAddOpen(false);
    setSaving(false);
    toast('success', 'Contact added', `${c.name} saved. Use Edit → Check WhatsApp to verify.`);
  }

  async function handleCheckWa(contact: Contact) {
    setChecking(contact.id);
    const updating = contacts.map((c) => c.id === contact.id ? { ...c, whatsappStatus: 'checking' as WhatsAppStatus } : c);
    onContactsChange(updating);
    const status = await checkWhatsApp(contact.phone);
    const final = updating.map((c) => c.id === contact.id ? { ...c, whatsappStatus: status } : c);
    store.saveContacts(final);
    onContactsChange(final);
    setChecking(null);
    toast(status === 'active' ? 'success' : 'info',
      status === 'active' ? 'WhatsApp Active' : 'No WhatsApp', contact.name);
  }

  async function handleBulkCheck() {
    toast('info', `Checking ${unverified.length} contacts…`);
    for (const c of unverified) await handleCheckWa(c);
    toast('success', 'Verification complete');
  }

  function handleEdit(updated: Contact) {
    const list = contacts.map((c) => c.id === updated.id ? updated : c);
    store.saveContacts(list);
    onContactsChange(list);
    setEditTarget(null);
    toast('success', 'Contact updated');
  }

  function archiveContact(id: string) {
    const c = contacts.find((x) => x.id === id);
    const list = contacts.map((x) => x.id === id ? { ...x, archived: !x.archived } : x);
    store.saveContacts(list);
    onContactsChange(list);
    toast('info', c?.archived ? 'Contact restored' : 'Contact archived', c?.name);
  }

  function deleteContact(id: string) {
    const c = contacts.find((x) => x.id === id);
    if (!confirm(`Permanently delete ${c?.name}? This cannot be undone.`)) return;
    const list = contacts.filter((x) => x.id !== id);
    store.saveContacts(list);
    onContactsChange(list);
    toast('info', 'Contact deleted', c?.name);
  }

  function handleSent(log: MessageLog) {
    const allLogs = [log, ...store.getLogs()];
    store.saveLogs(allLogs);
    onLogAdded(log);
    const list = contacts.map((c) => c.id === log.contactId ? { ...c, lastContacted: new Date().toISOString() } : c);
    store.saveContacts(list);
    onContactsChange(list);
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: '16px' }}>
          <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '4px' }}>Soul Winning</p>
            <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.8rem', fontWeight: 500, color: 'var(--text)' }}>Contacts</h1>
            <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '2px' }}>
              {active.length} active · {archived.length} archived
              {unverified.length > 0 && <> · <span style={{ color: 'var(--amber)' }}>{unverified.length} unverified</span></>}
            </p>
          </div>
          <div className="action-row">
            {unverified.length > 0 && (
              <button className="btn btn-outline" onClick={handleBulkCheck}>
                ↻ Verify {unverified.length}
              </button>
            )}
            <button className="btn btn-primary" onClick={() => { setAddForm({ name: '', phone: '', phoneValid: false, tags: [], notes: '' }); setAddError(''); setAddOpen(true); }}>+ Add contact</button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '8px', paddingBottom: '14px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, notes…"
              className="input"
              style={{ paddingLeft: '32px' }}
            />
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none', display: 'flex' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
            </span>
          </div>
          <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} className="input" style={{ width: 'auto', minWidth: '120px' }}>
            <option value="">All tags</option>
            {TAG_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterWa} onChange={(e) => setFilterWa(e.target.value as WhatsAppStatus | '')} className="input" style={{ width: 'auto', minWidth: '130px' }}>
            <option value="">All status</option>
            <option value="active">WhatsApp Active</option>
            <option value="inactive">SMS Only</option>
            <option value="unknown">Unverified</option>
          </select>
          <button
            className={`chip ${showArchived ? 'chip-on' : ''}`}
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? '← Active contacts' : 'Show archived'}
          </button>
          {(search || filterTag || filterWa) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterTag(''); setFilterWa(''); }}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto' }} className="table-scroll">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div style={{ color: 'var(--text-4)', display: 'flex', justifyContent: 'center' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
              </svg>
            </div>
            <h3>{contacts.length === 0 ? 'No contacts yet' : 'No contacts match your filters'}</h3>
            <p style={{ fontSize: '13px' }}>{contacts.length === 0 ? 'Add your first soul from the harvest field.' : 'Try clearing your filters.'}</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ paddingLeft: '24px' }}>Contact</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Tags</th>
                <th>Added</th>
                <th style={{ textAlign: 'right', paddingRight: '24px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} style={{ opacity: c.archived ? 0.55 : 1 }}>
                  <td style={{ paddingLeft: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
                        background: 'var(--navy-light)', border: '1px solid #BFCFE9',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: 700, color: 'var(--navy)',
                        fontFamily: 'Inter, sans-serif',
                      }}>
                        {c.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p style={{ fontWeight: 600, color: 'var(--text)', fontSize: '13.5px' }}>{c.name}</p>
                        {c.notes && <p style={{ fontSize: '12px', color: 'var(--text-3)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.notes}</p>}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="mono" style={{ fontSize: '13px', color: 'var(--text-2)' }}>{c.phone}</span>
                  </td>
                  <td>
                    <WaBadge status={c.whatsappStatus} />
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {c.tags.slice(0, 2).map((t) => <span key={t} className="badge badge-gray" style={{ fontSize: '11px' }}>{t}</span>)}
                      {c.tags.length > 2 && <span className="badge badge-gray" style={{ fontSize: '11px' }}>+{c.tags.length - 2}</span>}
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-3)', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                    {new Date(c.addedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </td>
                  <td style={{ textAlign: 'right', paddingRight: '24px' }}>
                    <div className="action-row" style={{ justifyContent: 'flex-end' }}>
                      {!c.archived && (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setSendTarget(c)}
                          title="Send message"
                        >
                          Send
                        </button>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setEditTarget(c)}
                        title="Edit contact"
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => archiveContact(c.id)}
                        title={c.archived ? 'Restore contact' : 'Archive contact'}
                        style={{ color: 'var(--text-3)' }}
                      >
                        {c.archived ? 'Restore' : 'Archive'}
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteContact(c.id)}
                        title="Delete contact"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Contact Modal */}
      {addOpen && (
        <div className="overlay">
          <div className="modal" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.2rem', fontWeight: 500 }}>Add New Contact</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => { setAddOpen(false); setAddError(''); }}>✕</button>
            </div>
            <form onSubmit={handleAdd}>
              <div className="modal-body">
                <div>
                  <label className="label">Full name *</label>
                  <input required className="input" value={addForm.name}
                    onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Adaeze Okonkwo" autoFocus />
                </div>
                <div>
                  <label className="label">Phone number *</label>
                  <PhoneInput
                    value={addForm.phone}
                    onChange={(e164, meta) => {
                      setAddForm((f) => ({ ...f, phone: e164, phoneValid: meta.valid }));
                      if (meta.valid) setAddError('');
                    }}
                  />
                </div>
                <div>
                  <label className="label">Tags</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {TAG_OPTIONS.map((t) => (
                      <button key={t} type="button" onClick={() => toggleAddTag(t)}
                        className={`chip ${addForm.tags.includes(t) ? 'chip-on' : ''}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Notes</label>
                  <textarea className="input" rows={2} value={addForm.notes}
                    onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="How did you meet? Follow-up details…" />
                </div>
                {addError && <p className="field-error">{addError}</p>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => { setAddOpen(false); setAddError(''); }}>Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? 'Saving…' : 'Save contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editTarget && (() => {
        const liveContact = contacts.find((c) => c.id === editTarget.id) ?? editTarget;
        return (
          <EditModal
            contact={liveContact}
            contacts={contacts}
            onSave={handleEdit}
            onClose={() => setEditTarget(null)}
            onCheckWa={handleCheckWa}
            checking={checking}
          />
        );
      })()}

      {/* Send Modal */}
      {sendTarget && (
        <SendModal
          contact={sendTarget}
          onClose={() => setSendTarget(null)}
          onSent={handleSent}
        />
      )}
    </div>
  );
}
