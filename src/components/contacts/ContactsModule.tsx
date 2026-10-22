import { useMemo, useState } from 'react';
import type { Contact, ContactField, ContactGroup, AuthUser, MessageLog } from '../../types';
import { store } from '../../lib/store';
import { sendMessage } from '../../lib/api';
import { newMessageId } from '../../lib/schedule';
import { canDeleteRecords, canManageFields, canSeeFullPhones } from '../../lib/permissions';
import {
  canMessageContact,
  canSeeContactPhone,
  displayPhone,
  erasedContactPatch,
  isErasedContact,
  scrubMessageLog,
} from '../../lib/privacy';
import { activeFields } from '../../lib/customFields';
import { fmtDate, serviceLabel } from '../../lib/services';
import { fillWelcome, type WelcomeOptions } from '../../lib/welcome';
import { MESSAGE_TEMPLATES, fillName } from '../../lib/messageTemplates';
import { senderFields } from '../../lib/sender';
import { useToast } from '../ui/Toast';
import Select from '../ui/Select';
import { logMetric } from '../../lib/metrics';
import SmsCounter from '../ui/SmsCounter';
import ContactFormModal, { TAG_OPTIONS } from './ContactFormModal';
import FieldsManager from './FieldsManager';
import GroupsManager from './GroupsManager';
import ImportContactsModal from './ImportContactsModal';

interface Props {
  user: AuthUser;
  contacts: Contact[];
  groups: ContactGroup[];
  onContactsChange: (c: Contact[]) => void;
  onGroupsChange: (g: ContactGroup[]) => void;
  onLogsChange: (l: MessageLog[]) => void;
  onLogAdded: (l: MessageLog) => void;
}

/** `yes:<fieldId>` / `no:<fieldId>` filter on an admin-defined yes/no field. */
type SpiritualFilter = '' | 'born-again' | 'not-born-again' | 'baptised' | 'not-baptised' | 'cell' | 'no-cell' | `yes:${string}` | `no:${string}`;

// ── Send Modal ──────────────────────────────────────────────────────────────
function SendModal({ contact, user, onClose, onSent }: {
  contact: Contact;
  user: AuthUser;
  onClose: () => void;
  onSent: (log: MessageLog) => void;
}) {
  const { toast } = useToast();
  const [templateId, setTemplateId] = useState('');
  const [sending, setSending] = useState<'sms' | 'whatsapp' | null>(null);
  const template = MESSAGE_TEMPLATES.find((t) => t.id === templateId);
  const msg = template ? fillName(template.text, contact.name) : '';

  async function send(channel: 'sms' | 'whatsapp') {
    if (!msg.trim()) return;
    setSending(channel);
    const id = newMessageId();
    const result = await sendMessage(contact.phone, channel, msg, id);
    const log: MessageLog = {
      id,
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: contact.phone,
      channel,
      content: msg,
      status: result.status,
      statusDetail: result.error,
      sentAt: new Date().toISOString(),
      ...senderFields(user),
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
            <label className="label">Template</label>
            <Select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)} autoFocus>
              <option value="">Choose a template…</option>
              {MESSAGE_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </div>
          {msg ? (
            <>
              <p style={{ fontSize: '12.5px', color: 'var(--text-3)' }}>The wording is fixed. {'{name}'} is filled from this record.</p>
              <div style={{ background: '#dcf8c6', borderRadius: '12px 12px 4px 12px', padding: '10px 13px', fontSize: '13px', lineHeight: 1.6, color: '#1a1a1a' }}>
                {msg}
              </div>
              <SmsCounter text={msg} />
            </>
          ) : null}
        </div>
        <div className="modal-footer" style={{ gap: '8px' }}>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-sms" disabled={!msg.trim() || sending !== null} onClick={() => send('sms')}>
            {sending === 'sms' ? 'Sending…' : 'Send SMS'}
          </button>
          <button className="btn btn-wa" disabled={!msg.trim() || sending !== null} onClick={() => send('whatsapp')}>
            {sending === 'whatsapp' ? 'Sending…' : 'Send WhatsApp'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SpiritualBadges({ c, fields }: { c: Contact; fields: ContactField[] }) {
  const items: { label: string; cls: string }[] = [];
  if (c.bornAgain === true) items.push({ label: 'Born again', cls: 'badge-green' });
  if (c.bornAgain === false) items.push({ label: 'Not born again', cls: 'badge-gray' });
  if (c.bornAgain === true && c.baptised) items.push({ label: 'Baptised', cls: 'badge-blue' });
  if (c.inCellFellowship) items.push({ label: 'WSF', cls: 'badge-gold' });
  for (const f of fields) {
    if (f.type === 'yesno' && c.custom?.[f.id]?.value === true) items.push({ label: f.label, cls: 'badge-navy' });
  }
  if (items.length === 0) return <span style={{ color: 'var(--text-4)', fontSize: '12.5px' }}>Not recorded</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
      {items.map((i) => <span key={i.label} className={`badge ${i.cls}`} style={{ fontSize: '11px' }}>{i.label}</span>)}
    </div>
  );
}

// ── Main module ─────────────────────────────────────────────────────────────
export default function ContactsModule({ user, contacts, groups, onContactsChange, onGroupsChange, onLogsChange, onLogAdded }: Props) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [sendTarget, setSendTarget] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterSpiritual, setFilterSpiritual] = useState<SpiritualFilter>('');
  const [filterAssigned, setFilterAssigned] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [allFields, setAllFields] = useState(() => store.getFields());

  const canDelete = canDeleteRecords(user);
  const fields = activeFields(allFields);
  const yesNoFields = fields.filter((f) => f.type === 'yesno');
  const active = contacts.filter((c) => !c.archived);
  const archived = contacts.filter((c) => c.archived);
  const pool = showArchived ? archived : active;
  const scoped = canSeeFullPhones(user)
    ? pool
    : pool.filter((c) => c.assignedTo === user.id || c.addedBy === user.id);
  const tagOptions = useMemo(
    () => [...new Set([...TAG_OPTIONS, ...contacts.flatMap((c) => c.tags)])].sort(),
    [contacts],
  );
  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const staff = useMemo(() => store.getUsers(), []);
  const staffName = useMemo(() => new Map(staff.map((u) => [u.id, u.name])), [staff]);

  const filtered = scoped.filter((c) => {
    const q = search.toLowerCase();
    if (q && ![c.name, displayPhone(user, c), c.notes, c.metLocation ?? '', c.homeLocation ?? '', c.closestChurch ?? '', c.cellName ?? ''].some((v) => v.toLowerCase().includes(q))) return false;
    if (filterTag && !c.tags.includes(filterTag)) return false;
    if (filterGroup === 'none' ? c.groupIds?.some((g) => groupName.has(g)) : filterGroup && !c.groupIds?.includes(filterGroup)) return false;
    if (filterAssigned === 'none' ? c.assignedTo : filterAssigned && c.assignedTo !== filterAssigned) return false;
    switch (filterSpiritual) {
      case 'born-again': if (c.bornAgain !== true) return false; break;
      case 'not-born-again': if (c.bornAgain === true) return false; break;
      case 'baptised': if (!c.baptised) return false; break;
      case 'not-baptised': if (c.baptised) return false; break;
      case 'cell': if (!c.inCellFellowship) return false; break;
      case 'no-cell': if (c.inCellFellowship) return false; break;
      default:
        if (filterSpiritual) {
          const [want, fieldId] = filterSpiritual.split(':');
          const yes = c.custom?.[fieldId]?.value === true;
          if (want === 'yes' ? !yes : yes) return false;
        }
    }
    return true;
  });

  const hasFilters = !!(search || filterTag || filterGroup || filterSpiritual || filterAssigned);

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

  async function sendWelcome(current: Contact, opts: WelcomeOptions) {
    const channel = opts.channel;
    const text = fillWelcome(opts.text, current);
    const id = newMessageId();
    const result = await sendMessage(current.phone, channel, text, id);
    const now = new Date().toISOString();
    addLog({
      id,
      contactId: current.id,
      contactName: current.name,
      contactPhone: current.phone,
      channel,
      content: text,
      status: result.status,
      statusDetail: result.error,
      sentAt: now,
      ...senderFields(user),
      kind: 'welcome',
    });
    logMetric('sent', 'message_logs', channel === 'sms' ? 'Welcome SMS' : 'Welcome WhatsApp', current.name, id);
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
    if (!canSeeContactPhone(user, c)) {
      toast('info', 'Already on record', 'Ask an Admin if you need this contact opened.');
      return;
    }
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
    if (!confirm(`Permanently delete ${c?.name}? Use this for a duplicate or test record. If the person asked to be forgotten, use Erase instead.`)) return;
    const list = store.getContacts().filter((x) => x.id !== id);
    store.saveContacts(list);
    store.saveAttendance(store.getAttendance().filter((a) => a.contactId !== id));
    onContactsChange(list);
    toast('info', 'Contact deleted', c?.name);
  }

  function eraseContact(id: string) {
    const c = contacts.find((x) => x.id === id);
    if (!c || isErasedContact(c)) return;
    if (!confirm(
      `Erase ${c.name} because they asked to be forgotten?\n\nName, phone, notes, locations and message wording will be permanently blanked. Anonymous attendance counts stay. This cannot be undone.`,
    )) return;
    const list = store.getContacts().map((x) => (x.id === id ? erasedContactPatch(x) : x));
    store.saveContacts(list);
    onContactsChange(list);
    const nextLogs = store.getLogs().map((log) => (log.contactId === id ? scrubMessageLog(log) : log));
    store.saveLogs(nextLogs);
    onLogsChange(nextLogs);
    toast('info', 'Record erased', 'Personal details were removed at their request.');
  }

  function handleSent(log: MessageLog) {
    addLog(log);
    logMetric('sent', 'message_logs', log.channel === 'whatsapp' ? 'WhatsApp' : 'SMS', log.contactName, log.id);
    if (log.status === 'delivered' || log.status === 'sent') updateContact(log.contactId, { lastContacted: log.sentAt });
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
              {canSeeFullPhones(user)
                ? `${active.length} active · ${archived.length} archived`
                : `${scoped.length} on your list · people you added or follow up`}
            </p>
          </div>
          <div className="action-row">
            {canManageFields(user) && (
              <button className="btn btn-outline" onClick={() => setFieldsOpen(true)} title="Add questions such as Bible school">Fields</button>
            )}
            <button className="btn btn-outline" onClick={() => setGroupsOpen(true)} title="Create groups such as Choir or Youth">Groups</button>
            <button className="btn btn-outline" onClick={() => setImportOpen(true)}>Import</button>
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
          <Select value={filterSpiritual} onChange={(e) => setFilterSpiritual(e.target.value as SpiritualFilter)} className="input" style={{ width: 'auto', minWidth: '150px' }}>
            <option value="">All spiritual status</option>
            <option value="born-again">Born again</option>
            <option value="not-born-again">Not born again / unknown</option>
            <option value="baptised">Baptised</option>
            <option value="not-baptised">Not baptised</option>
            <option value="cell">In a cell fellowship</option>
            <option value="no-cell">Not in a cell fellowship</option>
            {yesNoFields.map((f) => (
              <optgroup key={f.id} label={f.label}>
                <option value={`yes:${f.id}`}>{f.label}: yes</option>
                <option value={`no:${f.id}`}>{f.label}: no / unknown</option>
              </optgroup>
            ))}
          </Select>
          <Select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} className="input" style={{ width: 'auto', minWidth: '120px' }}>
            <option value="">All tags</option>
            {tagOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)} className="input" style={{ width: 'auto', minWidth: '120px' }}>
            <option value="">All groups</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            {groups.length > 0 && <option value="none">Not in any group</option>}
          </Select>
          <Select value={filterAssigned} onChange={(e) => setFilterAssigned(e.target.value)} className="input" style={{ width: 'auto', minWidth: '150px' }}>
            <option value="">All follow-up</option>
            <option value={user.id}>Assigned to me</option>
            {staff.filter((u) => u.id !== user.id).map((u) => (
              <option key={u.id} value={u.id}>Assigned to {u.name}</option>
            ))}
            <option value="none">Not assigned</option>
          </Select>
          <button className={`chip ${showArchived ? 'chip-on' : ''}`} onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? '← Active contacts' : 'Show archived'}
          </button>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterTag(''); setFilterGroup(''); setFilterSpiritual(''); setFilterAssigned(''); }}>
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
            <h3>{scoped.length === 0 ? (canSeeFullPhones(user) ? 'No contacts yet' : 'Nobody on your list yet') : 'No contacts match your filters'}</h3>
            <p style={{ fontSize: '13px' }}>{scoped.length === 0 ? 'Add your first soul from the harvest field.' : 'Try clearing your filters.'}</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ paddingLeft: '24px' }}>Contact</th>
                <th>Phone</th>
                <th>Met / lives</th>
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
                        background: 'var(--navy-light)', border: '1px solid #D0D0D0',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: 700, color: 'var(--navy)', fontFamily: 'Inter, sans-serif',
                      }}>
                        {c.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontWeight: 600, color: 'var(--text)', fontSize: '13.5px' }}>{c.name}</p>
                        {c.notes && <p style={{ fontSize: '12px', color: 'var(--text-3)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.notes}</p>}
                        {c.assignedTo && (
                          <p style={{ fontSize: '11.5px', color: 'var(--gold-dark)', marginTop: '2px' }}>
                            Follow-up: {staffName.get(c.assignedTo) ?? 'staff'}
                          </p>
                        )}
                        {c.groupIds?.some((g) => groupName.has(g)) && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '3px' }}>
                            {c.groupIds.filter((g) => groupName.has(g)).map((g) => (
                              <span key={g} className="badge badge-purple" style={{ fontSize: '10.5px' }}>{groupName.get(g)}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <p className="mono" style={{ fontSize: '13px', color: 'var(--text-2)' }}>{displayPhone(user, c)}</p>
                  </td>
                  <td style={{ fontSize: '12.5px' }}>
                    <p style={{ color: 'var(--text-2)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.metLocation}>
                      Met: {c.metLocation || '—'}
                    </p>
                    <p style={{ color: 'var(--text-2)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.homeLocation}>
                      Lives: {c.homeLocation || '—'}
                    </p>
                    <p style={{ color: 'var(--text-3)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.closestChurch}>
                      Church: {c.closestChurch || '—'}
                    </p>
                    <p style={{ color: 'var(--text-3)' }}>{c.metDate ? fmtDate(c.metDate) : fmtDate(c.addedAt)}</p>
                  </td>
                  <td><SpiritualBadges c={c} fields={yesNoFields} /></td>
                  <td style={{ fontSize: '12.5px', color: 'var(--text-2)' }}>
                    {c.attendanceCommitment === 'yes' && c.committedServices?.length
                      ? c.committedServices.map((s) => serviceLabel(s, c.committedSpecialEvent)).join(', ')
                      : c.attendanceCommitment === 'no' ? <span style={{ color: 'var(--text-3)' }}>Not at this time</span>
                      : c.attendanceCommitment === 'undecided' ? <span style={{ color: 'var(--text-3)' }}>Undecided</span>
                      : <span style={{ color: 'var(--text-4)' }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'right', paddingRight: '24px' }}>
                    <div className="action-row" style={{ justifyContent: 'flex-end' }}>
                      {!c.archived && canMessageContact(user, c) && (
                        <button className="btn btn-outline btn-sm" onClick={() => setSendTarget(c)}>Send</button>
                      )}
                      {canSeeContactPhone(user, c) && !isErasedContact(c) && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditId(c.id)}>Edit</button>
                      )}
                      {!isErasedContact(c) && (
                        <button className="btn btn-ghost btn-sm" onClick={() => archiveContact(c.id)} style={{ color: 'var(--text-3)' }}>
                          {c.archived ? 'Restore' : 'Archive'}
                        </button>
                      )}
                      {canDelete && !isErasedContact(c) && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => eraseContact(c.id)}
                          title="Blank personal details because the person asked to be forgotten"
                        >
                          Erase
                        </button>
                      )}
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
          groups={groups}
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
          groups={groups}
          user={user}
          onSave={handleEdit}
          onClose={() => setEditId(null)}
          onOpenExisting={openExisting}
        />
      )}

      {sendTarget && (
        <SendModal contact={sendTarget} user={user} onClose={() => setSendTarget(null)} onSent={handleSent} />
      )}

      {fieldsOpen && (
        <FieldsManager
          user={user}
          onClose={() => setFieldsOpen(false)}
          onChange={(next) => {
            setAllFields(next);
            if (filterSpiritual.includes(':') && !activeFields(next).some((f) => filterSpiritual.endsWith(':' + f.id))) setFilterSpiritual('');
          }}
        />
      )}

      {groupsOpen && (
        <GroupsManager
          user={user}
          groups={groups}
          shown={filtered}
          filtered={hasFilters}
          onClose={() => setGroupsOpen(false)}
          onGroupsChange={(next) => {
            onGroupsChange(next);
            if (filterGroup && filterGroup !== 'none' && !next.some((g) => g.id === filterGroup)) setFilterGroup('');
          }}
          onContactsChange={onContactsChange}
        />
      )}

      {importOpen && (
        <ImportContactsModal
          user={user}
          onClose={() => setImportOpen(false)}
          onImported={(all) => onContactsChange(all)}
        />
      )}
    </div>
  );
}
