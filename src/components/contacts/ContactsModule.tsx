import { useState } from 'react';
import type { Contact, AuthUser, MessageLog, WhatsAppStatus } from '../../types';
import { store } from '../../lib/store';
import { sendMessage } from '../../lib/mockApi';
import { checkWhatsApp, providerName } from '../../lib/whatsapp';
import { canDeleteRecords } from '../../lib/permissions';
import { fmtDate, serviceLabel } from '../../lib/services';
import { fillWelcome, type WelcomeOptions } from '../../lib/welcome';
import { useToast } from '../ui/Toast';
import ContactFormModal, { TAG_OPTIONS, WaBadge } from './ContactFormModal';

interface Props {
  user: AuthUser;
  contacts: Contact[];
  onContactsChange: (c: Contact[]) => void;
  onLogAdded: (l: MessageLog) => void;
}

type SpiritualFilter = '' | 'born-again' | 'not-born-again' | 'baptised' | 'not-baptised' | 'cell' | 'no-cell';

// ── Send Modal ──────────────────────────────────────────────────────────────
function SendModal({ contact, user, onClose, onSent }: {
  contact: Contact;
  user: AuthUser;
  onClose: () => void;
  onSent: (log: MessageLog) => void;
}) {
  const { toast } = useToast();
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState<'sms' | 'whatsapp' | null>(null);

  const canWa = contact.whatsappStatus === 'active';

  async function send(channel: 'sms' | 'whatsapp') {
    if (!msg.trim()) return;
    setSending(channel);
    const result = await sendMessage(contact.phone, channel, msg, { whatsappStatus: contact.whatsappStatus });
    const log: MessageLog = {
      id: 'ml' + Date.now(),
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: contact.phone,
      channel,
      content: msg,
      status: result.success ? 'delivered' : 'failed',
      sentAt: new Date().toISOString(),
      sentBy: user.name,
      kind: 'direct',
    };
    setSending(null);
    if (result.success) toast('success', `Sent via ${channel === 'sms' ? 'SMS' : 'WhatsApp'}`, contact.name);
    else toast('error', 'Message failed', result.error ?? 'Please try again.');
    onSent(log);
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
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button>
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
          {!canWa && contact.whatsappStatus !== 'unknown' && (
            <p className="alert alert-navy">WhatsApp not detected on this number — SMS only.</p>
          )}
          {contact.whatsappStatus === 'unknown' && (
            <p className="alert alert-amber">WhatsApp status unverified. Use Edit → Check WhatsApp to enable WhatsApp delivery.</p>
          )}
        </div>
        <div className="modal-footer" style={{ gap: '8px' }}>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-sms" disabled={!msg.trim() || sending !== null} onClick={() => send('sms')}>
            {sending === 'sms' ? 'Sending…' : 'Send SMS'}
          </button>
          <button className="btn btn-wa" disabled={!msg.trim() || sending !== null || !canWa} onClick={() => send('whatsapp')}
            title={!canWa ? 'WhatsApp not active on this number' : ''}>
            {sending === 'whatsapp' ? 'Sending…' : 'Send WhatsApp'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SpiritualBadges({ c }: { c: Contact }) {
  const items: { label: string; cls: string }[] = [];
  if (c.bornAgain === true) items.push({ label: 'Born again', cls: 'badge-green' });
  if (c.bornAgain === false) items.push({ label: 'Not born again', cls: 'badge-gray' });
  if (c.baptised) items.push({ label: 'Baptised', cls: 'badge-blue' });
  if (c.inCellFellowship) items.push({ label: 'WSF', cls: 'badge-gold' });
  if (items.length === 0) return <span style={{ color: 'var(--text-4)', fontSize: '12.5px' }}>Not recorded</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
      {items.map((i) => <span key={i.label} className={`badge ${i.cls}`} style={{ fontSize: '11px' }}>{i.label}</span>)}
    </div>
  );
}

// ── Main module ─────────────────────────────────────────────────────────────
export default function ContactsModule({ user, contacts, onContactsChange, onLogAdded }: Props) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [sendTarget, setSendTarget] = useState<Contact | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterWa, setFilterWa] = useState<WhatsAppStatus | ''>('');
  const [filterSpiritual, setFilterSpiritual] = useState<SpiritualFilter>('');
  const [showArchived, setShowArchived] = useState(false);

  const canDelete = canDeleteRecords(user);
  const active = contacts.filter((c) => !c.archived);
  const archived = contacts.filter((c) => c.archived);
  const pool = showArchived ? archived : active;

  const filtered = pool.filter((c) => {
    const q = search.toLowerCase();
    if (q && ![c.name, c.phone, c.notes, c.metLocation ?? '', c.cellName ?? ''].some((v) => v.toLowerCase().includes(q))) return false;
    if (filterTag && !c.tags.includes(filterTag)) return false;
    if (filterWa && c.whatsappStatus !== filterWa) return false;
    switch (filterSpiritual) {
      case 'born-again': if (c.bornAgain !== true) return false; break;
      case 'not-born-again': if (c.bornAgain === true) return false; break;
      case 'baptised': if (!c.baptised) return false; break;
      case 'not-baptised': if (c.baptised) return false; break;
      case 'cell': if (!c.inCellFellowship) return false; break;
      case 'no-cell': if (c.inCellFellowship) return false; break;
    }
    return true;
  });

  const unverified = active.filter((c) => c.whatsappStatus === 'unknown');
  const hasFilters = !!(search || filterTag || filterWa || filterSpiritual);

  /** Store is the source of truth so concurrent async updates don't clobber each other. */
  function updateContact(id: string, patch: Partial<Contact>) {
    const list = store.getContacts().map((c) => (c.id === id ? { ...c, ...patch } : c));
    store.saveContacts(list);
    onContactsChange(list);
    return list.find((c) => c.id === id)!;
  }

  function addLog(log: MessageLog) {
    store.saveLogs([log, ...store.getLogs()]);
    onLogAdded(log);
  }

  async function runWaCheck(contact: Contact): Promise<Contact> {
    updateContact(contact.id, { whatsappStatus: 'checking' });
    const result = await checkWhatsApp(contact.phone);
    const updated = updateContact(contact.id, {
      whatsappStatus: result.status,
      whatsappCheckSource: result.source,
      whatsappCheckedAt: new Date().toISOString(),
    });
    if (result.status === 'error') {
      toast('error', 'WhatsApp check failed', result.message ?? `${providerName(result.provider)} could not check this number.`);
    }
    return updated;
  }

  async function handleCheckWa(contact: Contact) {
    setChecking(contact.id);
    const updated = await runWaCheck(contact);
    setChecking(null);
    if (updated.whatsappStatus === 'error') return;
    const suffix = updated.whatsappCheckSource === 'demo' ? ' (demo result)' : '';
    toast(updated.whatsappStatus === 'active' ? 'success' : 'info',
      (updated.whatsappStatus === 'active' ? 'On WhatsApp' : 'Not on WhatsApp') + suffix, contact.name);
  }

  async function handleBulkCheck() {
    toast('info', `Checking ${unverified.length} contacts…`);
    for (const c of unverified) {
      setChecking(c.id);
      await runWaCheck(c);
    }
    setChecking(null);
    toast('success', 'Verification complete');
  }

  async function sendWelcome(contact: Contact, opts: WelcomeOptions) {
    let current = contact;
    let channel: 'sms' | 'whatsapp' = 'sms';

    if (opts.channel !== 'sms') {
      current = await runWaCheck(contact);
      if (current.whatsappStatus === 'active') channel = 'whatsapp';
      else if (opts.channel === 'whatsapp') {
        toast('error', 'Welcome message not sent', `${contact.name} is not on WhatsApp. Use Send → SMS instead.`);
        return;
      }
    }

    const text = fillWelcome(opts.text, current);
    const result = await sendMessage(current.phone, channel, text, { whatsappStatus: current.whatsappStatus });
    const now = new Date().toISOString();
    addLog({
      id: 'ml' + Date.now(),
      contactId: current.id,
      contactName: current.name,
      contactPhone: current.phone,
      channel,
      content: text,
      status: result.success ? 'delivered' : 'failed',
      sentAt: now,
      sentBy: user.name,
      kind: 'welcome',
    });
    if (result.success) {
      updateContact(current.id, { welcomeSentAt: now, lastContacted: now });
      toast('success', `Welcome sent via ${channel === 'sms' ? 'SMS' : 'WhatsApp'}`, current.name);
    } else {
      toast('error', 'Welcome message failed', `${result.error ?? 'Delivery failed'}. Retry with Send.`);
    }
  }

  function handleAdd(c: Contact, welcome?: WelcomeOptions) {
    const list = [c, ...store.getContacts()];
    store.saveContacts(list);
    onContactsChange(list);
    setAddOpen(false);
    toast('success', 'Contact added', c.name);
    if (welcome) void sendWelcome(c, welcome);
  }

  function handleEdit(updated: Contact) {
    updateContact(updated.id, updated);
    setEditId(null);
    toast('success', 'Contact updated', updated.name);
  }

  function openExisting(c: Contact) {
    setAddOpen(false);
    if (c.archived && !showArchived) setShowArchived(true);
    setEditId(c.id);
  }

  function archiveContact(id: string) {
    const c = contacts.find((x) => x.id === id);
    updateContact(id, { archived: !c?.archived });
    toast('info', c?.archived ? 'Contact restored' : 'Contact archived', c?.name);
  }

  function deleteContact(id: string) {
    const c = contacts.find((x) => x.id === id);
    if (!confirm(`Permanently delete ${c?.name}? This cannot be undone.`)) return;
    const list = store.getContacts().filter((x) => x.id !== id);
    store.saveContacts(list);
    store.saveAttendance(store.getAttendance().filter((a) => a.contactId !== id));
    onContactsChange(list);
    toast('info', 'Contact deleted', c?.name);
  }

  function handleSent(log: MessageLog) {
    addLog(log);
    if (log.status === 'delivered') updateContact(log.contactId, { lastContacted: log.sentAt });
  }

  const editContact = editId ? contacts.find((c) => c.id === editId) : undefined;

  return (
    <div className="page">
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
              <button className="btn btn-outline" onClick={handleBulkCheck} disabled={checking !== null}>
                ↻ Verify {unverified.length}
              </button>
            )}
            <button className="btn btn-primary" onClick={() => setAddOpen(true)}>+ Add contact</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', paddingBottom: '14px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, location, notes…" className="input" style={{ paddingLeft: '32px' }} />
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none', display: 'flex' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
            </span>
          </div>
          <select value={filterSpiritual} onChange={(e) => setFilterSpiritual(e.target.value as SpiritualFilter)} className="input" style={{ width: 'auto', minWidth: '150px' }}>
            <option value="">All spiritual status</option>
            <option value="born-again">Born again</option>
            <option value="not-born-again">Not born again / unknown</option>
            <option value="baptised">Baptised</option>
            <option value="not-baptised">Not baptised</option>
            <option value="cell">In a cell fellowship</option>
            <option value="no-cell">Not in a cell fellowship</option>
          </select>
          <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} className="input" style={{ width: 'auto', minWidth: '120px' }}>
            <option value="">All tags</option>
            {TAG_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterWa} onChange={(e) => setFilterWa(e.target.value as WhatsAppStatus | '')} className="input" style={{ width: 'auto', minWidth: '130px' }}>
            <option value="">All WhatsApp</option>
            <option value="active">On WhatsApp</option>
            <option value="inactive">SMS only</option>
            <option value="unknown">Unverified</option>
          </select>
          <button className={`chip ${showArchived ? 'chip-on' : ''}`} onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? '← Active contacts' : 'Show archived'}
          </button>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterTag(''); setFilterWa(''); setFilterSpiritual(''); }}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }} className="table-scroll">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div style={{ color: 'var(--text-4)', display: 'flex', justifyContent: 'center' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
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
                <th>Met</th>
                <th>Spiritual status</th>
                <th>Committed to</th>
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
                        fontSize: '11px', fontWeight: 700, color: 'var(--navy)', fontFamily: 'Inter, sans-serif',
                      }}>
                        {c.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontWeight: 600, color: 'var(--text)', fontSize: '13.5px' }}>{c.name}</p>
                        {c.notes && <p style={{ fontSize: '12px', color: 'var(--text-3)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.notes}</p>}
                      </div>
                    </div>
                  </td>
                  <td>
                    <p className="mono" style={{ fontSize: '13px', color: 'var(--text-2)' }}>{c.phone}</p>
                    <div style={{ marginTop: '3px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      <WaBadge status={c.whatsappStatus} />
                      {c.whatsappCheckSource === 'demo' && c.whatsappStatus !== 'checking' && (
                        <span className="badge badge-gray" style={{ fontSize: '10.5px' }} title="Simulated — connect a WhatsApp provider for real results">demo</span>
                      )}
                    </div>
                  </td>
                  <td style={{ fontSize: '12.5px' }}>
                    <p style={{ color: 'var(--text-2)', maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.metLocation || '—'}</p>
                    <p style={{ color: 'var(--text-3)' }}>{c.metDate ? fmtDate(c.metDate) : fmtDate(c.addedAt)}</p>
                  </td>
                  <td><SpiritualBadges c={c} /></td>
                  <td style={{ fontSize: '12.5px', color: 'var(--text-2)' }}>
                    {c.attendanceCommitment === 'yes' && c.committedServices?.length
                      ? c.committedServices.map((s) => serviceLabel(s, c.committedSpecialEvent)).join(', ')
                      : c.attendanceCommitment === 'no' ? <span style={{ color: 'var(--text-3)' }}>Not at this time</span>
                      : c.attendanceCommitment === 'undecided' ? <span style={{ color: 'var(--text-3)' }}>Undecided</span>
                      : <span style={{ color: 'var(--text-4)' }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'right', paddingRight: '24px' }}>
                    <div className="action-row" style={{ justifyContent: 'flex-end' }}>
                      {!c.archived && (
                        <button className="btn btn-outline btn-sm" onClick={() => setSendTarget(c)}>Send</button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditId(c.id)}>Edit</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => archiveContact(c.id)} style={{ color: 'var(--text-3)' }}>
                        {c.archived ? 'Restore' : 'Archive'}
                      </button>
                      {canDelete && (
                        <button className="btn btn-danger btn-sm" onClick={() => deleteContact(c.id)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {addOpen && (
        <ContactFormModal
          mode="add"
          contacts={contacts}
          user={user}
          onSave={handleAdd}
          onClose={() => setAddOpen(false)}
          onOpenExisting={openExisting}
        />
      )}

      {editContact && (
        <ContactFormModal
          key={editContact.id}
          mode="edit"
          contact={editContact}
          contacts={contacts}
          user={user}
          onSave={handleEdit}
          onClose={() => setEditId(null)}
          onOpenExisting={openExisting}
          onCheckWa={handleCheckWa}
          checking={checking}
        />
      )}

      {sendTarget && (
        <SendModal contact={sendTarget} user={user} onClose={() => setSendTarget(null)} onSent={handleSent} />
      )}
    </div>
  );
}
