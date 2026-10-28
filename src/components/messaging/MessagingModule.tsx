import { useEffect, useState, useMemo } from 'react';
import type { Contact, ContactGroup, MessageLog, MessageStatus, AuthUser } from '../../types';
import { store } from '../../lib/store';
import { sendMessage } from '../../lib/api';
import { refreshLogs } from '../../lib/cloud';
import { newMessageId } from '../../lib/schedule';
import { MESSAGE_TEMPLATES, fillName } from '../../lib/messageTemplates';
import { senderCaption, senderFields } from '../../lib/sender';
import { useToast } from '../ui/Toast';
import SmsCounter from '../ui/SmsCounter';
import Select from '../ui/Select';
import { getSmsGatewayStatus, type SmsGatewayStatus } from '../../lib/smsGateway';
import { canMessageContact, displayPhone, maskPhone } from '../../lib/privacy';
import { logMetric } from '../../lib/metrics';
import { canSeeFullPhones } from '../../lib/permissions';

const STATUS_LABEL: Record<MessageStatus, string> = { delivered: 'Delivered', sent: 'Sent', failed: 'Failed', pending: 'Unconfirmed' };
const STATUS_BADGE: Record<MessageStatus, string> = { delivered: 'badge-green', sent: 'badge-blue', failed: 'badge-red', pending: 'badge-amber' };

function statusHint(log: MessageLog): string {
  if (log.statusDetail) return log.statusDetail;
  if (log.status === 'sent') return log.channel === 'sms' ? 'Accepted for sending. Waiting for the delivery report.' : 'Accepted for sending. WhatsApp does not report delivery.';
  if (log.status === 'delivered') return 'Delivered to the phone';
  return '';
}

interface Props {
  user: AuthUser;
  contacts: Contact[];
  groups: ContactGroup[];
  logs: MessageLog[];
  onLogsChange: (l: MessageLog[]) => void;
  onContactsChange: (c: Contact[]) => void;
}


export default function MessagingModule({ user, contacts, groups, logs, onLogsChange, onContactsChange }: Props) {
  const { toast } = useToast();
  const [tab, setTab] = useState<'compose' | 'history'>('compose');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [templateId, setTemplateId] = useState('');
  const [sending, setSending] = useState<'sms' | 'whatsapp' | null>(null);
  const [progress, setProgress] = useState(0);
  const [contactSearch, setContactSearch] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [logFilterCh, setLogFilterCh] = useState('');
  const [logFilterStatus, setLogFilterStatus] = useState('');
  const [gateway, setGateway] = useState<SmsGatewayStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (sending === null) void getSmsGatewayStatus().then(setGateway);
  }, [sending]);

  function reloadHistory() {
    setRefreshing(true);
    refreshLogs()
      .then(onLogsChange)
      .catch(() => toast('error', 'Could not refresh message history'))
      .finally(() => setRefreshing(false));
  }

  // Delivery reports and scheduled reminders arrive in the background.
  useEffect(() => {
    if (tab === 'history') reloadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const activeContacts = contacts.filter((c) => canMessageContact(user, c));
  const tags = useMemo(() => [...new Set(activeContacts.flatMap((c) => c.tags))].sort(), [activeContacts]);

  function addAudience(value: string) {
    const [kind, key] = [value.slice(0, value.indexOf(':')), value.slice(value.indexOf(':') + 1)];
    const members = activeContacts.filter((c) => {
      if (kind === 'assigned') return c.assignedTo === key;
      if (kind === 'group') return c.groupIds?.includes(key);
      return c.tags.includes(key);
    });
    if (!members.length) { toast('info', 'Nobody to add', 'No active contacts are in it yet.'); return; }
    setSelectedIds((s) => new Set([...s, ...members.map((c) => c.id)]));
    const name = kind === 'assigned' ? 'your follow-up list' : kind === 'group' ? groups.find((g) => g.id === key)?.name : key;
    toast('success', `Added ${members.length} from ${name}`);
  }

  const filteredContacts = activeContacts.filter((c) => {
    const q = contactSearch.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || displayPhone(user, c).toLowerCase().includes(q);
  });

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      const q = logSearch.toLowerCase();
      if (q && !l.contactName.toLowerCase().includes(q) && !l.content.toLowerCase().includes(q)) return false;
      if (logFilterCh && l.channel !== logFilterCh) return false;
      if (logFilterStatus && l.status !== logFilterStatus) return false;
      return true;
    }).sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
  }, [logs, logSearch, logFilterCh, logFilterStatus]);

  const template = MESSAGE_TEMPLATES.find((t) => t.id === templateId);
  const msgText = template?.text ?? '';
  const previewText = useMemo(() => {
    if (!msgText) return '';
    const sample = contacts.find((c) => selectedIds.has(c.id)) ?? activeContacts[0];
    return sample ? fillName(msgText, sample.name) : msgText;
  }, [msgText, selectedIds, contacts, activeContacts]);

  function toggleContact(id: string) {
    setSelectedIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectAll() { setSelectedIds(new Set(filteredContacts.map((c) => c.id))); }
  function clearAll() { setSelectedIds(new Set()); }

  async function broadcast(channel: 'sms' | 'whatsapp') {
    if (selectedIds.size === 0 || !msgText.trim()) return;
    setSending(channel);
    setProgress(0);
    const eligible = activeContacts.filter((c) => selectedIds.has(c.id));
    let success = 0;
    let stopped: string | undefined;
    const reached = new Set<string>();
    const newLogs: MessageLog[] = [];
    const now = new Date().toISOString();
    for (let i = 0; i < eligible.length; i++) {
      const c = eligible[i];
      const text = fillName(msgText, c.name);
      const id = newMessageId();
      const r = await sendMessage(c.phone, channel, text, id);
      newLogs.push({ id, contactId: c.id, contactName: c.name, contactPhone: c.phone, channel, content: text, status: r.status, statusDetail: r.error, sentAt: now, ...senderFields(user), kind: 'broadcast' });
      if (r.success) { success++; reached.add(c.id); }
      setProgress(Math.round(((i + 1) / eligible.length) * 100));
      if (r.fatal) { stopped = r.error; break; }
    }
    const allLogs = [...newLogs, ...store.getLogs()];
    store.saveLogs(allLogs);
    onLogsChange(allLogs);
    const updated = contacts.map((c) => reached.has(c.id) ? { ...c, lastContacted: now } : c);
    store.saveContacts(updated);
    onContactsChange(updated);
    setSending(null);
    setProgress(0);
    if (stopped) {
      toast('error', 'Sending stopped', `${stopped} ${success} of ${eligible.length} sent.`);
      return;
    }
    setSelectedIds(new Set());
    logMetric('sent', 'message_logs', `${success} of ${eligible.length} via ${channel === 'sms' ? 'SMS' : 'WhatsApp'}`, template?.label);
    toast(success ? 'success' : 'error', `Sent via ${channel === 'sms' ? 'SMS' : 'WhatsApp'}`, `${success} of ${eligible.length} sent`);
    setTab('history');
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: '0' }}>
          <div style={{ paddingBottom: '0' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '4px' }}>Outreach</p>
            <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.8rem', fontWeight: 500, color: 'var(--text)' }}>Messaging</h1>
          </div>
          <div style={{ display: 'flex', gap: '24px', paddingTop: '4px' }}>
            {[{ label: canSeeFullPhones(user) ? 'Sent' : 'You sent', val: logs.length }, { label: 'Successful', val: logs.filter(l => l.status === 'delivered' || l.status === 'sent').length }].map((s) => (
              <div key={s.label} style={{ textAlign: 'right' }}>
                <p style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.4rem', color: 'var(--gold)' }}>{s.val}</p>
                <p style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0', marginTop: '16px' }}>
          {(['compose', 'history'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '8px 18px', fontSize: '13.5px', fontWeight: tab === t ? 600 : 400,
              background: 'none', border: 'none', cursor: 'pointer',
              color: tab === t ? 'var(--navy)' : 'var(--text-3)',
              borderBottom: `2px solid ${tab === t ? 'var(--navy)' : 'transparent'}`,
              marginBottom: '-1px', transition: 'color 0.14s',
              fontFamily: 'Inter, sans-serif',
            }}>
              {t === 'compose' ? 'Compose Broadcast' : 'Message History'}
              {t === 'history' && logs.length > 0 && (
                <span style={{ marginLeft: '6px', fontSize: '11px', background: 'var(--surface-2)', color: 'var(--text-3)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                  {logs.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="messaging-content">
        {tab === 'compose' ? (
          <div className="grid-compose">
            {/* Compose */}
            <div style={{ overflowY: 'auto', padding: '24px 28px', borderRight: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '560px' }}>
                {/* Templates */}
                <div>
                  <p className="label" style={{ marginBottom: '8px' }}>Template</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {MESSAGE_TEMPLATES.map((t) => (
                      <button key={t.id} type="button" onClick={() => setTemplateId(t.id)}
                        className={`chip ${templateId === t.id ? 'chip-on' : ''}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: '12.5px', color: 'var(--text-3)', marginTop: '8px' }}>
                    Pick a template.
                  </p>
                </div>

                {msgText && (
                  <div>
                    <label className="label">Message</label>
                    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px', background: 'var(--surface-2)', fontSize: '13.5px', lineHeight: 1.6, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>
                      {msgText}
                    </div>
                    <SmsCounter text={previewText || msgText} hasPlaceholders={msgText.includes('{name}')} />
                  </div>
                )}

                {/* Recipients */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label className="label" style={{ margin: 0 }}>
                      Recipients <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>({selectedIds.size} selected)</span>
                    </label>
                    <div style={{ display: 'flex', gap: '8px', fontSize: '12.5px' }}>
                      <button onClick={selectAll} style={{ color: 'var(--navy)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>Select all</button>
                      <button onClick={clearAll} style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Clear</button>
                    </div>
                  </div>
                  {!canSeeFullPhones(user) && (
                    <p style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '6px' }}>
                      You can message people you added or who are on your follow-up list.
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <input type="text" className="input" value={contactSearch} onChange={(e) => setContactSearch(e.target.value)}
                      placeholder="Filter contacts…" style={{ flex: 1, minWidth: '160px' }} />
                    <Select className="input" value="" onChange={(e) => e.target.value && addAudience(e.target.value)}
                      style={{ width: 'auto', minWidth: '190px' }} aria-label="Add a follow-up list, group or tag">
                      <option value="">+ Add people…</option>
                      <option value={`assigned:${user.id}`}>
                        My follow-up list ({activeContacts.filter((c) => c.assignedTo === user.id).length})
                      </option>
                      {groups.length > 0 && (
                        <optgroup label="Groups">
                          {groups.map((g) => (
                            <option key={g.id} value={`group:${g.id}`}>
                              {g.name} ({activeContacts.filter((c) => c.groupIds?.includes(g.id)).length})
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {tags.length > 0 && (
                        <optgroup label="Tags">
                          {tags.map((t) => (
                            <option key={t} value={`tag:${t}`}>{t} ({activeContacts.filter((c) => c.tags.includes(t)).length})</option>
                          ))}
                        </optgroup>
                      )}
                    </Select>
                  </div>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)' }}>
                    {filteredContacts.map((c) => (
                      <label key={c.id} style={{
                        display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', cursor: 'pointer',
                        borderBottom: '1px solid var(--border)', background: selectedIds.has(c.id) ? 'var(--navy-xlight)' : 'transparent',
                        transition: 'background 0.1s',
                      }}>
                        <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleContact(c.id)}
                          style={{ accentColor: 'var(--navy)', width: '14px', height: '14px', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '13.5px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
                          <p className="mono" style={{ fontSize: '12px', color: 'var(--text-3)' }}>{displayPhone(user, c)}</p>
                        </div>
                      </label>
                    ))}
                    {filteredContacts.length === 0 && (
                      <p style={{ padding: '16px', textAlign: 'center', color: 'var(--text-3)', fontSize: '13px' }}>No contacts found</p>
                    )}
                  </div>
                </div>

                {/* Progress */}
                {sending !== null && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--text-3)', marginBottom: '4px' }}>
                      <span>Sending via {sending === 'sms' ? 'SMS' : 'WhatsApp'}…</span>
                      <span style={{ color: 'var(--navy)', fontWeight: 600 }}>{progress}%</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}

                {/* Send buttons */}
                <div>
                  <p className="label" style={{ marginBottom: '8px' }}>Send channel</p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      className="btn btn-sms"
                      disabled={sending !== null || selectedIds.size === 0 || !msgText.trim()}
                      onClick={() => broadcast('sms')}
                      style={{ flex: 1, padding: '10px', fontSize: '14px', fontWeight: 600 }}
                    >
                      Send via SMS
                      {selectedIds.size > 0 && <span style={{ fontSize: '12px', fontWeight: 400, marginLeft: '4px' }}>({selectedIds.size})</span>}
                    </button>
                    <button
                      className="btn btn-wa"
                      disabled={sending !== null || selectedIds.size === 0 || !msgText.trim()}
                      onClick={() => broadcast('whatsapp')}
                      style={{ flex: 1, padding: '10px', fontSize: '14px', fontWeight: 600 }}
                    >
                      Send via WhatsApp
                      {selectedIds.size > 0 && <span style={{ fontSize: '12px', fontWeight: 400, marginLeft: '4px' }}>({selectedIds.size})</span>}
                    </button>
                  </div>
                  {gateway && (
                    <p style={{ fontSize: '12px', color: gateway.configured ? 'var(--text-3)' : 'var(--amber)', marginTop: '6px' }}>
                      {gateway.configured
                        ? `SMS goes out as "${gateway.sender}"${gateway.balance !== undefined ? ` · ${gateway.balance} SMS units left` : ''}.`
                        : 'Sending is not set up: add the SMS settings on the server before messages can go out.'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="compose-preview" style={{ padding: '24px 20px', overflowY: 'auto', background: 'var(--surface-2)' }}>
              <p className="label" style={{ marginBottom: '12px' }}>Message Preview</p>
              <div style={{ border: '2px solid var(--border)', borderRadius: '16px', padding: '16px 14px', background: 'var(--surface)', minHeight: '180px' }}>
                {previewText ? (
                  <>
                    <div style={{ background: '#dcf8c6', borderRadius: '12px 12px 4px 12px', padding: '10px 13px', maxWidth: '90%', marginLeft: 'auto' }}>
                      <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#1a1a1a' }}>{previewText}</p>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '6px', textAlign: 'right' }}>Delivered · Just now</p>
                  </>
                ) : (
                  <p style={{ color: 'var(--text-3)', fontSize: '13px', fontStyle: 'italic' }}>Pick a template to preview…</p>
                )}
              </div>

            </div>
          </div>
        ) : (
          /* History */
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap', background: 'var(--surface)' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                <input type="text" className="input" value={logSearch} onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Search by name or message content…" style={{ paddingLeft: '30px' }} />
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none', display: 'flex' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                  </svg>
                </span>
              </div>
              <Select className="input" value={logFilterCh} onChange={(e) => setLogFilterCh(e.target.value)} style={{ width: 'auto', minWidth: '130px' }}>
                <option value="">All channels</option>
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="both">SMS + WhatsApp</option>
              </Select>
              <Select className="input" value={logFilterStatus} onChange={(e) => setLogFilterStatus(e.target.value)} style={{ width: 'auto', minWidth: '130px' }}>
                <option value="">All statuses</option>
                {(Object.keys(STATUS_LABEL) as MessageStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </Select>
              <button className="btn btn-outline btn-sm" onClick={reloadHistory} disabled={refreshing} title="Check for new delivery reports">
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredLogs.length === 0 ? (
                <div className="empty-state">
                  <div style={{ color: 'var(--text-4)', display: 'flex', justifyContent: 'center' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                    </svg>
                  </div>
                  <h3>No messages match</h3>
                </div>
              ) : (
                <div>
                  {filteredLogs.map((log) => (
                    <article key={log.id} style={{
                      padding: '16px 24px',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                        <div>
                          <p style={{ fontWeight: 600 }}>{log.contactName}</p>
                          <p className="mono" style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                            {canSeeFullPhones(user) ? log.contactPhone : maskPhone(log.contactPhone)}
                          </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          <span className={`badge ${log.channel === 'whatsapp' || log.channel === 'both' ? 'badge-green' : 'badge-blue'}`}>
                            {log.channel === 'whatsapp' ? 'WhatsApp' : log.channel === 'both' ? 'Both' : 'SMS'}
                          </span>
                          <span className={`badge ${STATUS_BADGE[log.status] ?? 'badge-amber'}`} title={statusHint(log)}>
                            {STATUS_LABEL[log.status] ?? log.status}
                          </span>
                        </div>
                      </div>
                      <p style={{ fontSize: '13.5px', lineHeight: 1.55, color: 'var(--text)', marginTop: '10px', whiteSpace: 'pre-wrap' }}>
                        {log.content || '—'}
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '8px' }}>
                        {new Date(log.sentAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {' · '}
                        {senderCaption(log)}
                      </p>
                      {(log.status === 'failed' || log.status === 'pending') && log.statusDetail && (
                        <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '4px' }}>{log.statusDetail}</p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
