import { useEffect, useState, useMemo } from 'react';
import type { Contact, ContactGroup, MessageLog, MessageStatus, AuthUser } from '../../types';
import { store } from '../../lib/store';
import { sendMessage } from '../../lib/api';
import { refreshLogs } from '../../lib/cloud';
import { newMessageId } from '../../lib/schedule';
import { useToast } from '../ui/Toast';
import SmsCounter from '../ui/SmsCounter';
import { toGsm } from '../../lib/sms';
import { getSmsGatewayStatus, type SmsGatewayStatus } from '../../lib/smsGateway';

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

const TEMPLATES = [
  { label: 'Harvest Field Invite', text: 'Dear {name}, you are warmly invited to our Harvest Field meeting this Sunday at 9:00 AM. Come and experience God\'s power! - Living Faith Church' },
  { label: 'Midweek Service',      text: 'Dear {name}, our midweek Bible study holds this Wednesday at 5:30 PM. Come hungry for the Word! - Living Faith Church' },
  { label: 'WSF Meeting',          text: 'Dear {name}, WSF holds this Sunday at 8:00 AM, a special session for new believers. You are welcome! - Living Faith Church' },
  { label: 'Shiloh 2026',          text: 'Dear {name}, SHILOH 2026 holds December 7-11. Do not miss this divine encounter! - Living Faith Church' },
  { label: 'Follow-Up',            text: 'Dear {name}, we are thinking of you and trust you are well. We look forward to seeing you at our next service. God bless! - Living Faith Church' },
  { label: 'Youth Programme',      text: 'Dear {name}, our Youth Programme holds this Saturday! Bring a friend and celebrate God\'s grace. You are specially invited! - Living Faith Church' },
];

export default function MessagingModule({ user, contacts, groups, logs, onLogsChange, onContactsChange }: Props) {
  const { toast } = useToast();
  const [tab, setTab] = useState<'compose' | 'history'>('compose');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [msgText, setMsgText] = useState('');
  const [activeTemplate, setActiveTemplate] = useState<number | null>(null);
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

  const activeContacts = contacts.filter((c) => !c.archived);
  const tags = useMemo(() => [...new Set(activeContacts.flatMap((c) => c.tags))].sort(), [activeContacts]);

  function addAudience(value: string) {
    const [kind, key] = [value.slice(0, value.indexOf(':')), value.slice(value.indexOf(':') + 1)];
    const members = activeContacts.filter((c) => (kind === 'group' ? c.groupIds?.includes(key) : c.tags.includes(key)));
    if (!members.length) { toast('info', 'Nobody to add', 'No active contacts are in it yet.'); return; }
    setSelectedIds((s) => new Set([...s, ...members.map((c) => c.id)]));
    const name = kind === 'group' ? groups.find((g) => g.id === key)?.name : key;
    toast('success', `Added ${members.length} from ${name}`);
  }

  const filteredContacts = activeContacts.filter((c) => {
    const q = contactSearch.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.phone.includes(q);
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

  const previewText = useMemo(() => {
    if (!msgText) return '';
    const sample = contacts.find((c) => selectedIds.has(c.id)) ?? activeContacts[0];
    return sample ? msgText.replace(/{name}/g, sample.name.split(' ')[0]) : msgText;
  }, [msgText, selectedIds, contacts, activeContacts]);

  function applyTemplate(i: number) { setActiveTemplate(i); setMsgText(TEMPLATES[i].text); }
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
      const text = msgText.replace(/{name}/g, c.name.split(' ')[0]);
      const id = newMessageId();
      const r = await sendMessage(c.phone, channel, text, id);
      newLogs.push({ id, contactId: c.id, contactName: c.name, contactPhone: c.phone, channel, content: text, status: r.status, statusDetail: r.error, sentAt: now, sentBy: user.name, kind: 'broadcast' });
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
            {[{ label: 'Sent', val: logs.length }, { label: 'Successful', val: logs.filter(l => l.status === 'delivered' || l.status === 'sent').length }].map((s) => (
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
                  <p className="label" style={{ marginBottom: '8px' }}>Quick Templates</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {TEMPLATES.map((t, i) => (
                      <button key={i} type="button" onClick={() => applyTemplate(i)}
                        className={`chip ${activeTemplate === i ? 'chip-on' : ''}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <label className="label" style={{ margin: 0 }}>Message <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>— use {'{name}'} for personalisation</span></label>
                  </div>
                  <textarea
                    rows={6}
                    className="input"
                    value={msgText}
                    onChange={(e) => { setMsgText(e.target.value); setActiveTemplate(null); }}
                    placeholder="Dear {name}, you are warmly invited to…"
                  />
                  <SmsCounter text={previewText || msgText} onFix={() => { setMsgText(toGsm(msgText)); setActiveTemplate(null); }} hasPlaceholders={msgText.includes('{name}')} />
                </div>

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
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <input type="text" className="input" value={contactSearch} onChange={(e) => setContactSearch(e.target.value)}
                      placeholder="Filter contacts…" style={{ flex: 1, minWidth: '160px' }} />
                    {(groups.length > 0 || tags.length > 0) && (
                      <select className="input" value="" onChange={(e) => e.target.value && addAudience(e.target.value)}
                        style={{ width: 'auto', minWidth: '170px' }} aria-label="Add a whole group or tag">
                        <option value="">+ Add a group or tag…</option>
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
                      </select>
                    )}
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
                          <p className="mono" style={{ fontSize: '12px', color: 'var(--text-3)' }}>{c.phone}</p>
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
                        ? `SMS goes out as "${gateway.sender}"; WhatsApp from the church's connected WhatsApp number${gateway.balance !== undefined ? ` · ${gateway.balance} SMS units left` : ''}.`
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
                  <p style={{ color: 'var(--text-3)', fontSize: '13px', fontStyle: 'italic' }}>Type a message to preview…</p>
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
              <select className="input" value={logFilterCh} onChange={(e) => setLogFilterCh(e.target.value)} style={{ width: 'auto', minWidth: '130px' }}>
                <option value="">All channels</option>
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="both">SMS + WhatsApp</option>
              </select>
              <select className="input" value={logFilterStatus} onChange={(e) => setLogFilterStatus(e.target.value)} style={{ width: 'auto', minWidth: '130px' }}>
                <option value="">All statuses</option>
                {(Object.keys(STATUS_LABEL) as MessageStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
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
                <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ paddingLeft: '24px' }}>Recipient</th>
                      <th>Channel</th>
                      <th className="col-message">Message</th>
                      <th>Date</th>
                      <th style={{ textAlign: 'right', paddingRight: '24px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log) => (
                      <tr key={log.id}>
                        <td style={{ paddingLeft: '24px' }}>
                          <p style={{ fontWeight: 600 }}>{log.contactName}</p>
                          <p className="mono" style={{ fontSize: '12px', color: 'var(--text-3)' }}>{log.contactPhone}</p>
                        </td>
                        <td>
                          <span className={`badge ${log.channel === 'whatsapp' || log.channel === 'both' ? 'badge-green' : 'badge-blue'}`}>
                            {log.channel === 'whatsapp' ? 'WhatsApp' : log.channel === 'both' ? 'Both' : 'SMS'}
                          </span>
                        </td>
                        <td className="col-message" style={{ maxWidth: '280px' }}>
                          <p style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' }}>
                            {log.content}
                          </p>
                        </td>
                        <td style={{ color: 'var(--text-3)', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                          {new Date(log.sentAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          <p style={{ fontSize: '11.5px', color: 'var(--text-4)' }}>{log.kind === 'scheduled' ? log.sentBy : `by ${log.sentBy}`}</p>
                        </td>
                        <td style={{ textAlign: 'right', paddingRight: '24px', maxWidth: '220px' }}>
                          <span className={`badge ${STATUS_BADGE[log.status] ?? 'badge-amber'}`} title={statusHint(log)}>
                            {STATUS_LABEL[log.status] ?? log.status}
                          </span>
                          {(log.status === 'failed' || log.status === 'pending') && log.statusDetail && (
                            <p style={{ fontSize: '11.5px', color: 'var(--text-3)', marginTop: '3px', whiteSpace: 'normal' }}>{log.statusDetail}</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
