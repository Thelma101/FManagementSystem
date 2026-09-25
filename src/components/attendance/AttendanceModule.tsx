import { useMemo, useState } from 'react';
import type { AttendanceRecord, AuthUser, Contact, ServiceType } from '../../types';
import { store } from '../../lib/store';
import { SERVICE_OPTIONS, SPECIAL_EVENTS, addWeeks, fmtWeekRange, weekStartOf } from '../../lib/services';
import { useToast } from '../ui/Toast';

interface Props {
  user: AuthUser;
  contacts: Contact[];
}

function Check({ on, disabled, onClick, label }: { on: boolean; disabled?: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" className={`att-check${on ? ' on' : ''}`} disabled={disabled} onClick={onClick}
      aria-pressed={on} aria-label={label} title={label}>
      {on && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </button>
  );
}

export default function AttendanceModule({ user, contacts }: Props) {
  const { toast } = useToast();
  const thisWeek = weekStartOf(new Date());
  const [week, setWeek] = useState(thisWeek);
  const [records, setRecords] = useState<AttendanceRecord[]>(() => store.getAttendance());
  const [search, setSearch] = useState('');
  const [onlyCommitted, setOnlyCommitted] = useState(false);

  const weekRecords = useMemo(() => records.filter((r) => r.weekStart === week), [records, week]);

  // Special event for this week: taken from existing records, or chosen by the user
  const recordedEvent = weekRecords.find((r) => r.serviceType === 'special-event')?.specialEvent;
  const [chosenEvent, setChosenEvent] = useState<Record<string, string>>({});
  const specialEvent = recordedEvent ?? chosenEvent[week] ?? '';
  const [otherOpen, setOtherOpen] = useState(false);
  const [customEvent, setCustomEvent] = useState('');

  const activeContacts = contacts.filter((c) => !c.archived);
  const visible = activeContacts.filter((c) => {
    const q = search.toLowerCase();
    if (q && !c.name.toLowerCase().includes(q) && !c.phone.includes(q)) return false;
    if (onlyCommitted && c.attendanceCommitment !== 'yes') return false;
    return true;
  });

  function has(contactId: string, type: ServiceType) {
    return weekRecords.some((r) => r.contactId === contactId && r.serviceType === type);
  }

  function persist(next: AttendanceRecord[]) {
    store.saveAttendance(next);
    setRecords(next);
  }

  function toggle(contact: Contact, type: ServiceType) {
    if (type === 'special-event' && !specialEvent) {
      toast('warning', 'Choose the special event first', 'Select the event held this week above the table.');
      return;
    }
    const existing = weekRecords.find((r) => r.contactId === contact.id && r.serviceType === type);
    if (existing) {
      persist(records.filter((r) => r.id !== existing.id));
      return;
    }
    persist([
      ...records,
      {
        id: 'a' + Date.now() + Math.random().toString(36).slice(2, 6),
        contactId: contact.id,
        weekStart: week,
        serviceType: type,
        specialEvent: type === 'special-event' ? specialEvent : undefined,
        recordedBy: user.name,
        recordedAt: new Date().toISOString(),
      },
    ]);
  }

  function markAll(type: ServiceType) {
    if (type === 'special-event' && !specialEvent) {
      toast('warning', 'Choose the special event first');
      return;
    }
    const missing = visible.filter((c) => !has(c.id, type));
    if (missing.length === 0) {
      // Everyone already marked → clear the column for the visible contacts
      const ids = new Set(visible.map((c) => c.id));
      persist(records.filter((r) => !(r.weekStart === week && r.serviceType === type && ids.has(r.contactId))));
      return;
    }
    const now = new Date().toISOString();
    persist([
      ...records,
      ...missing.map((c, i) => ({
        id: `a${Date.now()}${i}`,
        contactId: c.id,
        weekStart: week,
        serviceType: type,
        specialEvent: type === 'special-event' ? specialEvent : undefined,
        recordedBy: user.name,
        recordedAt: now,
      })),
    ]);
  }

  function changeSpecialEvent(value: string) {
    if (weekRecords.some((r) => r.serviceType === 'special-event')) {
      if (!confirm('Change the special event for all attendance already recorded this week?')) return;
      persist(records.map((r) => (r.weekStart === week && r.serviceType === 'special-event' ? { ...r, specialEvent: value } : r)));
    }
    setChosenEvent((m) => ({ ...m, [week]: value }));
  }

  const totals = SERVICE_OPTIONS.map((s) => ({
    ...s,
    count: weekRecords.filter((r) => r.serviceType === s.id).length,
  }));
  const attendedAny = new Set(weekRecords.map((r) => r.contactId)).size;
  const eventOptions = specialEvent && !SPECIAL_EVENTS.includes(specialEvent) ? [...SPECIAL_EVENTS, specialEvent] : SPECIAL_EVENTS;

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: '16px', gap: '12px' }}>
          <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '4px' }}>Follow-up</p>
            <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.8rem', fontWeight: 500, color: 'var(--text)' }}>Service Attendance</h1>
            <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '2px' }}>
              {attendedAny} of {activeContacts.length} contacts attended at least one service this week
            </p>
          </div>
          <div className="action-row">
            <button className="btn btn-outline btn-sm" onClick={() => setWeek(addWeeks(week, -1))} aria-label="Previous week">←</button>
            <div style={{ textAlign: 'center', minWidth: '170px' }}>
              <p style={{ fontSize: '13.5px', fontWeight: 600 }}>{fmtWeekRange(week)}</p>
              <p style={{ fontSize: '11.5px', color: 'var(--text-3)' }}>{week === thisWeek ? 'This week' : 'Service week'}</p>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => setWeek(addWeeks(week, 1))} disabled={week >= thisWeek} aria-label="Next week">→</button>
            {week !== thisWeek && <button className="btn btn-ghost btn-sm" onClick={() => setWeek(thisWeek)}>Today</button>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', paddingBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input" style={{ flex: 1, minWidth: '180px' }} placeholder="Search contacts…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input" style={{ width: 'auto', minWidth: '240px' }} value={specialEvent} aria-label="Special event this week"
            onChange={(e) => { if (e.target.value === '__other') setOtherOpen(true); else changeSpecialEvent(e.target.value); }}>
            <option value="">No special event this week</option>
            {eventOptions.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
            <option value="__other">Other event…</option>
          </select>
          {otherOpen && (
            <form style={{ display: 'flex', gap: '6px' }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!customEvent.trim()) return;
                changeSpecialEvent(customEvent.trim());
                setCustomEvent('');
                setOtherOpen(false);
              }}>
              <input className="input" autoFocus placeholder="Event name" value={customEvent} onChange={(e) => setCustomEvent(e.target.value)} style={{ width: '180px' }} />
              <button className="btn btn-primary btn-sm" type="submit">Set</button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setOtherOpen(false); setCustomEvent(''); }}>✕</button>
            </form>
          )}
          <button className={`chip ${onlyCommitted ? 'chip-on' : ''}`} onClick={() => setOnlyCommitted(!onlyCommitted)}>
            Committed to attend only
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }} className="table-scroll">
        {visible.length === 0 ? (
          <div className="empty-state"><h3>No contacts to show</h3><p style={{ fontSize: '13px' }}>Try clearing the search or filter.</p></div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ paddingLeft: '24px' }}>Contact</th>
                {SERVICE_OPTIONS.map((s) => (
                  <th key={s.id} className="att-cell" style={{ minWidth: '96px' }}>
                    <button type="button" onClick={() => markAll(s.id)} title="Mark / clear everyone shown"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit' }}>
                      {s.id === 'special-event' && specialEvent ? specialEvent : s.short}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id}>
                  <td style={{ paddingLeft: '24px' }}>
                    <p style={{ fontWeight: 600, fontSize: '13.5px' }}>{c.name}</p>
                    <p style={{ fontSize: '11.5px', color: 'var(--text-3)' }}>
                      {c.attendanceCommitment === 'yes' && c.committedServices?.length
                        ? `Committed: ${c.committedServices.map((s) => SERVICE_OPTIONS.find((o) => o.id === s)?.short).join(', ')}`
                        : 'No commitment recorded'}
                    </p>
                  </td>
                  {SERVICE_OPTIONS.map((s) => (
                    <td key={s.id} className="att-cell">
                      <Check
                        on={has(c.id, s.id)}
                        disabled={s.id === 'special-event' && !specialEvent}
                        onClick={() => toggle(c, s.id)}
                        label={`${c.name} attended ${s.label}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ paddingLeft: '24px', fontWeight: 700, fontSize: '12.5px', color: 'var(--text-2)', background: 'var(--surface-2)' }}>Total attended</td>
                {totals.map((t) => (
                  <td key={t.id} className="att-cell" style={{ fontWeight: 700, background: 'var(--surface-2)' }}>{t.count}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
