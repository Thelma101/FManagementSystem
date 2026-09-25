import { useState } from 'react';
import type { ScheduledEvent, AuthUser, DayOfWeek } from '../../types';
import { store } from '../../lib/store';
import { canManageSchedules } from '../../lib/permissions';
import { useToast } from '../ui/Toast';

interface Props {
  user: AuthUser;
  events: ScheduledEvent[];
  onEventsChange: (e: ScheduledEvent[]) => void;
}

const DAYS: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const LEAD_OPTIONS = [
  { h: 1,   label: '1 hour' },
  { h: 2,   label: '2 hours' },
  { h: 6,   label: '6 hours' },
  { h: 12,  label: '12 hours' },
  { h: 24,  label: '1 day' },
  { h: 48,  label: '2 days' },
  { h: 72,  label: '3 days' },
  { h: 168, label: '1 week' },
];

type Freq = 'daily' | 'weekly' | 'monthly';

type FormState = {
  name: string; description: string; frequency: Freq;
  dayOfWeek: DayOfWeek; monthDay: number;
  datetime: string;
  leadTimeHours: number[];
  messageTemplate: string;
  channels: ('sms' | 'whatsapp')[];
};

const EMPTY: FormState = {
  name: '', description: '', frequency: 'weekly',
  dayOfWeek: 'Saturday', monthDay: 1,
  datetime: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
  leadTimeHours: [24], messageTemplate: '', channels: ['sms', 'whatsapp'],
};

function freqBadge(f: Freq) {
  if (f === 'daily')  return <span className="badge badge-blue">Daily</span>;
  if (f === 'weekly') return <span className="badge badge-gold">Weekly</span>;
  return <span className="badge badge-purple">Monthly</span>;
}

function computeNextTrigger(form: FormState): string {
  const [datePart, timePart] = form.datetime.split('T');
  const [h, m] = (timePart || '09:00').split(':').map(Number);
  const now = new Date();
  if (form.frequency === 'daily') {
    const next = new Date(now); next.setHours(h, m, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }
  if (form.frequency === 'weekly') {
    const dayIdx = DAYS.indexOf(form.dayOfWeek);
    const next = new Date(now);
    next.setDate(now.getDate() + ((dayIdx - now.getDay() + 7) % 7 || 7));
    next.setHours(h, m, 0, 0);
    return next.toISOString();
  }
  if (datePart) return new Date(form.datetime).toISOString();
  const next = new Date(now.getFullYear(), now.getMonth(), form.monthDay, h, m);
  if (next <= now) next.setMonth(next.getMonth() + 1);
  return next.toISOString();
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtLead(h: number) {
  if (h >= 168) return `${h / 168}w`;
  if (h >= 24) return `${h / 24}d`;
  return `${h}h`;
}

const FREQ_LABEL: Record<Freq, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const FREQ_COLOR: Record<Freq, { bg: string; border: string }> = {
  daily:   { bg: 'var(--blue-bg)',   border: 'var(--blue-border)' },
  weekly:  { bg: 'var(--gold-light)', border: 'var(--gold-border)' },
  monthly: { bg: 'var(--purple-bg)', border: 'var(--purple-border)' },
};

export default function ScheduleModule({ user, events, onEventsChange }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ScheduledEvent | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [filterFreq, setFilterFreq] = useState<Freq | ''>('');

  function openAdd() { setForm({ ...EMPTY }); setEditTarget(null); setOpen(true); }

  function openEdit(ev: ScheduledEvent) {
    const timeStr = ev.time ?? '09:00';
    const dateStr = ev.date ?? new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    setForm({
      name: ev.name, description: ev.description,
      frequency: ev.frequency as Freq,
      dayOfWeek: ev.dayOfWeek ?? 'Saturday',
      monthDay: 1, datetime: `${dateStr}T${timeStr}`,
      leadTimeHours: [...ev.leadTimeHours],
      messageTemplate: ev.messageTemplate,
      channels: [...ev.channels],
    });
    setEditTarget(ev); setOpen(true);
  }

  function toggleLead(h: number) {
    setForm((f) => ({ ...f, leadTimeHours: f.leadTimeHours.includes(h) ? f.leadTimeHours.filter((x) => x !== h) : [...f.leadTimeHours, h].sort((a, b) => a - b) }));
  }

  function toggleChannel(ch: 'sms' | 'whatsapp') {
    setForm((f) => ({ ...f, channels: f.channels.includes(ch) ? f.channels.filter((c) => c !== ch) : [...f.channels, ch] }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.leadTimeHours.length) { toast('error', 'Select at least one reminder time'); return; }
    if (!form.channels.length) { toast('error', 'Select at least one channel'); return; }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 300));
    const [datePart, timePart] = form.datetime.split('T');
    const ev: ScheduledEvent = {
      id: editTarget ? editTarget.id : 'ev' + Date.now(),
      name: form.name.trim(), description: form.description.trim(),
      frequency: form.frequency,
      dayOfWeek: form.frequency === 'weekly' ? form.dayOfWeek : undefined,
      date: form.frequency !== 'daily' ? datePart : undefined,
      time: timePart ?? '09:00',
      leadTimeHours: form.leadTimeHours,
      messageTemplate: form.messageTemplate.trim(),
      channels: form.channels,
      active: editTarget ? editTarget.active : true,
      nextTrigger: computeNextTrigger(form),
      createdBy: editTarget ? editTarget.createdBy : user.name,
    };
    const updated = editTarget ? events.map((x) => x.id === editTarget.id ? ev : x) : [ev, ...events];
    store.saveEvents(updated);
    onEventsChange(updated);
    setSaving(false); setOpen(false);
    toast('success', editTarget ? 'Schedule updated' : 'Schedule created', ev.name);
  }

  function toggleActive(id: string) {
    const ev = events.find((e) => e.id === id);
    const updated = events.map((e) => e.id === id ? { ...e, active: !e.active } : e);
    store.saveEvents(updated); onEventsChange(updated);
    toast(ev?.active ? 'info' : 'success', ev?.active ? 'Schedule paused' : 'Schedule resumed', ev?.name);
  }

  function deleteEvent(id: string) {
    const ev = events.find((e) => e.id === id);
    if (!confirm(`Delete "${ev?.name}"?`)) return;
    const updated = events.filter((e) => e.id !== id);
    store.saveEvents(updated); onEventsChange(updated);
    toast('info', 'Deleted', ev?.name);
  }

  const filtered = events.filter((e) => !filterFreq || e.frequency === filterFreq);
  const liveCount = events.filter((e) => e.active).length;
  const pausedCount = events.filter((e) => !e.active).length;

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: '16px' }}>
          <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '4px' }}>Automation</p>
            <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.8rem', fontWeight: 500, color: 'var(--text)' }}>Scheduled Messages</h1>
            <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '3px' }}>
              <span style={{ color: 'var(--green)', fontWeight: 600 }}>{liveCount} active</span>
              {' · '}
              {pausedCount} paused
            </p>
          </div>
          <button className="btn btn-primary" onClick={openAdd}>+ New schedule</button>
        </div>
        {/* Filter */}
        <div style={{ display: 'flex', gap: '6px', paddingBottom: '14px' }}>
          {([['', 'All'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']] as [string, string][]).map(([val, label]) => (
            <button key={val} onClick={() => setFilterFreq(val as Freq | '')}
              className={`chip ${filterFreq === val ? 'chip-on' : ''}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="page-body" style={{ paddingTop: '20px' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div style={{ color: 'var(--text-4)', display: 'flex', justifyContent: 'center' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18"/>
              </svg>
            </div>
            <h3>No schedules yet</h3>
            <p style={{ fontSize: '13.5px' }}>Create your first automated schedule above.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filtered.map((ev) => {
              const fc = FREQ_COLOR[ev.frequency as Freq];
              return (
                <div key={ev.id} className="card" style={{ opacity: ev.active ? 1 : 0.65 }}>
                  <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                    {/* Frequency icon */}
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '10px', flexShrink: 0,
                      background: fc.bg, border: `1px solid ${fc.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '11px', fontWeight: 700, color: 'var(--text-2)',
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                    }}>
                      {FREQ_LABEL[ev.frequency as Freq].slice(0, 1)}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <h3 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1rem', fontWeight: 500, color: 'var(--text)' }}>{ev.name}</h3>
                        {freqBadge(ev.frequency as Freq)}
                        <span className={`badge ${ev.active ? 'badge-green' : 'badge-gray'}`}>
                          {ev.active ? '● Active' : '○ Paused'}
                        </span>
                      </div>
                      {ev.description && (
                        <p style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '12px', lineHeight: 1.5 }}>{ev.description}</p>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px 24px', fontSize: '13px' }}>
                        {[
                          {
                            label: 'Trigger',
                            value: ev.frequency === 'daily'
                              ? `Every day at ${ev.time}`
                              : ev.frequency === 'weekly'
                              ? `Every ${ev.dayOfWeek} at ${ev.time}`
                              : ev.date
                              ? `${new Date(ev.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} at ${ev.time}`
                              : ev.time,
                          },
                          { label: 'Next send', value: fmtDate(ev.nextTrigger) },
                          { label: 'Channels', value: ev.channels.map((c) => c === 'whatsapp' ? 'WhatsApp' : 'SMS').join(' · ') },
                          { label: 'Reminders', value: ev.leadTimeHours.map(fmtLead).join(', ') + ' before' },
                        ].map((col) => (
                          <div key={col.label}>
                            <p style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>{col.label}</p>
                            <p style={{ color: 'var(--text-2)', fontFamily: 'Inter, sans-serif' }}>{col.value}</p>
                          </div>
                        ))}
                      </div>

                      <p style={{ fontSize: '12.5px', color: 'var(--text-3)', marginTop: '12px', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        "{ev.messageTemplate.slice(0, 90)}{ev.messageTemplate.length > 90 ? '…' : ''}"
                      </p>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'flex-start' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openEdit(ev)}>Edit</button>
                      <button
                        className="btn btn-sm"
                        onClick={() => toggleActive(ev.id)}
                        style={{
                          background: 'transparent',
                          border: `1px solid ${ev.active ? 'var(--amber-border)' : 'var(--green-border)'}`,
                          color: ev.active ? 'var(--amber)' : 'var(--green)',
                        }}
                      >
                        {ev.active ? 'Pause' : 'Resume'}
                      </button>
                      {canManageSchedules(user) && (
                        <button className="btn btn-danger btn-sm" onClick={() => deleteEvent(ev.id)}>Delete</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {open && (
        <div className="overlay">
          <div className="modal" style={{ maxWidth: '520px', maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
              <div>
                <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.25rem', fontWeight: 500 }}>
                  {editTarget ? 'Edit Schedule' : 'New Scheduled Event'}
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '2px' }}>
                  Automate reminders for church activities
                </p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div>
                  <label className="label">Event name *</label>
                  <input required className="input" value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Sunday Worship Service" autoFocus />
                </div>

                <div>
                  <label className="label">Description</label>
                  <input className="input" value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Brief description of this event" />
                </div>

                <div>
                  <label className="label">Frequency</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {(['daily', 'weekly', 'monthly'] as Freq[]).map((f) => (
                      <button key={f} type="button" onClick={() => setForm((s) => ({ ...s, frequency: f }))}
                        className={`chip ${form.frequency === f ? 'chip-on' : ''}`}
                        style={{ flex: 1, justifyContent: 'center' }}>
                        {f === 'daily' ? 'Daily' : f === 'weekly' ? 'Weekly' : 'Monthly'}
                      </button>
                    ))}
                  </div>
                </div>

                {form.frequency === 'weekly' && (
                  <div>
                    <label className="label">Day of week</label>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      {DAYS.map((d) => (
                        <button key={d} type="button" onClick={() => setForm((f) => ({ ...f, dayOfWeek: d }))}
                          className={`chip ${form.dayOfWeek === d ? 'chip-on' : ''}`}>
                          {d.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="label">
                    {form.frequency === 'daily' ? 'Time' : form.frequency === 'weekly' ? 'Start date & time' : 'Date & time'}
                  </label>
                  <input
                    type="datetime-local" required className="input"
                    value={form.datetime}
                    onChange={(e) => setForm((f) => ({ ...f, datetime: e.target.value }))}
                  />
                  <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '4px' }}>
                    {form.frequency === 'daily' && 'Message fires at this time every day.'}
                    {form.frequency === 'weekly' && 'Time applies weekly; date sets the first send.'}
                    {form.frequency === 'monthly' && 'Message repeats on the same day each month.'}
                  </p>
                </div>

                <div>
                  <label className="label">Reminder lead times</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {LEAD_OPTIONS.map(({ h, label }) => (
                      <button key={h} type="button" onClick={() => toggleLead(h)}
                        className={`chip ${form.leadTimeHours.includes(h) ? 'chip-on' : ''}`}>
                        {label} before
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label">Channels</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" onClick={() => toggleChannel('sms')}
                      className={`btn btn-sm ${form.channels.includes('sms') ? 'btn-sms' : 'btn-outline'}`}
                      style={{ flex: 1 }}>
                      SMS
                    </button>
                    <button type="button" onClick={() => toggleChannel('whatsapp')}
                      className={`btn btn-sm ${form.channels.includes('whatsapp') ? 'btn-wa' : 'btn-outline'}`}
                      style={{ flex: 1 }}>
                      WhatsApp
                    </button>
                  </div>
                </div>

                <div>
                  <label className="label">
                    Message template *{' '}
                    <span style={{ fontWeight: 400, color: 'var(--text-3)', textTransform: 'none' }}>use {'{name}'} and {'{church}'}</span>
                  </label>
                  <textarea required rows={4} className="input" value={form.messageTemplate}
                    onChange={(e) => setForm((f) => ({ ...f, messageTemplate: e.target.value }))}
                    placeholder="Dear {name}, you are warmly invited to… — {church}" />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? 'Saving…' : editTarget ? 'Update schedule' : 'Create schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
