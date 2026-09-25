import { useMemo, useState } from 'react';
import type { AttendanceRecord, Contact } from '../../types';
import { store } from '../../lib/store';
import {
  COMMITMENT_LABEL, SERVICE_OPTIONS, addWeeks, fmtDate, fmtWeekRange, fromIsoDate, serviceLabel, toIsoDate, weekStartOf,
} from '../../lib/services';
import { exportReport, type ExportFormat, type Report } from '../../lib/exporters';
import { useToast } from '../ui/Toast';

type ReportType = 'attendance-weekly' | 'attendance-contact' | 'weekly-summary' | 'contacts';

const REPORT_TYPES: { id: ReportType; label: string; hint: string }[] = [
  { id: 'attendance-weekly', label: 'Weekly attendance', hint: 'Did each person attend service each week, and which service type' },
  { id: 'attendance-contact', label: 'Attendance by contact', hint: 'Totals per person across the period, per service type' },
  { id: 'weekly-summary', label: 'Weekly summary', hint: 'Headcount per service type for every week' },
  { id: 'contacts', label: 'Contacts register', hint: 'Every contact with harvest, spiritual and commitment details' },
];

type Preset = 'this-week' | 'last-4' | 'last-12' | 'this-year' | 'custom';

const yesNo = (v?: boolean) => (v === undefined ? '—' : v ? 'Yes' : 'No');

function weeksBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let w = from; w <= to && out.length < 260; w = addWeeks(w, 1)) out.push(w);
  return out;
}

function committedText(c: Contact) {
  if (c.attendanceCommitment !== 'yes') return c.attendanceCommitment ? COMMITMENT_LABEL[c.attendanceCommitment] : '—';
  const list = (c.committedServices ?? []).map((s) => serviceLabel(s, s === 'special-event' ? c.committedSpecialEvent : undefined));
  return list.length ? list.join(', ') : 'Yes';
}

function buildReport(type: ReportType, weeks: string[], contacts: Contact[], records: AttendanceRecord[]): Report {
  const period = weeks.length === 1 ? fmtWeekRange(weeks[0]) : `${fmtWeekRange(weeks[0]).split(' – ')[0]} – ${fmtWeekRange(weeks[weeks.length - 1]).split(' – ')[1]}`;
  const weekSet = new Set(weeks);
  const inRange = records.filter((r) => weekSet.has(r.weekStart) && contacts.some((c) => c.id === r.contactId));
  const byContactWeek = new Map<string, AttendanceRecord[]>();
  for (const r of inRange) {
    const k = `${r.contactId}|${r.weekStart}`;
    byContactWeek.set(k, [...(byContactWeek.get(k) ?? []), r]);
  }
  const serviceNames = (list: AttendanceRecord[]) =>
    SERVICE_OPTIONS.filter((s) => list.some((r) => r.serviceType === s.id))
      .map((s) => serviceLabel(s.id, list.find((r) => r.serviceType === s.id)?.specialEvent))
      .join(', ');

  const possible = contacts.length * weeks.length;
  const attendedPairs = byContactWeek.size;
  const rate = possible ? `${Math.round((attendedPairs / possible) * 100)}%` : '—';

  if (type === 'attendance-weekly') {
    const rows = [...weeks].reverse().flatMap((w) =>
      contacts.map((c) => {
        const list = byContactWeek.get(`${c.id}|${w}`) ?? [];
        return [fmtWeekRange(w), c.name, c.phone, list.length ? 'Yes' : 'No', list.length ? serviceNames(list) : '—', committedText(c)];
      }),
    );
    return {
      title: 'Weekly Service Attendance',
      subtitle: period,
      summary: [
        { label: 'Contacts', value: contacts.length },
        { label: 'Weeks', value: weeks.length },
        { label: 'Attendances recorded', value: inRange.length },
        { label: 'Attendance rate', value: rate },
      ],
      columns: [
        { header: 'Week', width: 22 }, { header: 'Contact', width: 22 }, { header: 'Phone', width: 17 },
        { header: 'Attended', width: 10 }, { header: 'Service(s) attended', width: 34 }, { header: 'Committed to', width: 28 },
      ],
      rows,
    };
  }

  if (type === 'attendance-contact') {
    const rows = contacts.map((c) => {
      const mine = inRange.filter((r) => r.contactId === c.id);
      const weeksAttended = new Set(mine.map((r) => r.weekStart)).size;
      const last = mine.map((r) => r.weekStart).sort().pop();
      return [
        c.name, c.phone, committedText(c), `${weeksAttended} / ${weeks.length}`,
        ...SERVICE_OPTIONS.map((s) => mine.filter((r) => r.serviceType === s.id).length),
        last ? fmtWeekRange(last) : 'Not yet',
      ];
    }).sort((a, b) => Number(String(b[3]).split(' ')[0]) - Number(String(a[3]).split(' ')[0]));
    return {
      title: 'Attendance by Contact',
      subtitle: period,
      summary: [
        { label: 'Contacts', value: contacts.length },
        { label: 'Attended at least once', value: new Set(inRange.map((r) => r.contactId)).size },
        { label: 'Attendance rate', value: rate },
      ],
      columns: [
        { header: 'Contact', width: 22 }, { header: 'Phone', width: 17 }, { header: 'Committed to', width: 26 },
        { header: 'Weeks attended', width: 12 },
        ...SERVICE_OPTIONS.map((s) => ({ header: s.short, width: 10 })),
        { header: 'Last attended', width: 22 },
      ],
      rows,
    };
  }

  if (type === 'weekly-summary') {
    const rows = [...weeks].reverse().map((w) => {
      const wk = inRange.filter((r) => r.weekStart === w);
      const unique = new Set(wk.map((r) => r.contactId)).size;
      const events = [...new Set(wk.filter((r) => r.serviceType === 'special-event').map((r) => r.specialEvent).filter(Boolean))].join(', ');
      return [
        fmtWeekRange(w),
        unique,
        contacts.length ? `${Math.round((unique / contacts.length) * 100)}%` : '—',
        ...SERVICE_OPTIONS.map((s) => wk.filter((r) => r.serviceType === s.id).length),
        events || '—',
      ];
    });
    return {
      title: 'Weekly Attendance Summary',
      subtitle: period,
      summary: [
        { label: 'Contacts', value: contacts.length },
        { label: 'Weeks', value: weeks.length },
        { label: 'Attendance rate', value: rate },
      ],
      columns: [
        { header: 'Week', width: 22 }, { header: 'People attended', width: 12 }, { header: 'Rate', width: 8 },
        ...SERVICE_OPTIONS.map((s) => ({ header: s.short, width: 10 })),
        { header: 'Special event(s)', width: 28 },
      ],
      rows,
    };
  }

  const pct = (n: number) => (contacts.length ? `${Math.round((n / contacts.length) * 100)}%` : '—');
  return {
    title: 'Contacts Register',
    subtitle: `${contacts.length} contacts`,
    summary: [
      { label: 'Born again', value: pct(contacts.filter((c) => c.bornAgain).length) },
      { label: 'Baptised', value: pct(contacts.filter((c) => c.baptised).length) },
      { label: 'In a Cell Fellowship', value: pct(contacts.filter((c) => c.inCellFellowship).length) },
      { label: 'Committed to attend', value: pct(contacts.filter((c) => c.attendanceCommitment === 'yes').length) },
    ],
    columns: [
      { header: 'Name', width: 22 }, { header: 'Phone', width: 17 }, { header: 'WhatsApp', width: 10 },
      { header: 'Where met', width: 20 }, { header: 'Date met', width: 12 },
      { header: 'Born again', width: 9 }, { header: 'Salvation date', width: 12 }, { header: 'Salvation place', width: 18 },
      { header: 'Baptised', width: 9 }, { header: 'Baptism date', width: 12 },
      { header: 'Cell Fellowship', width: 18 }, { header: 'Committed to', width: 26 },
      { header: 'Tags', width: 16 }, { header: 'Notes', width: 34 },
      { header: 'Added by', width: 16 }, { header: 'Added on', width: 12 }, { header: 'Welcome sent', width: 12 },
    ],
    rows: contacts.map((c) => [
      c.name, c.phone,
      c.whatsappStatus === 'active' ? 'Yes' : c.whatsappStatus === 'inactive' ? 'No' : 'Unchecked',
      c.metLocation || '—', fmtDate(c.metDate),
      yesNo(c.bornAgain), fmtDate(c.salvationDate), c.salvationPlace || '—',
      yesNo(c.baptised), fmtDate(c.baptismDate),
      c.inCellFellowship ? c.cellName || 'Yes' : yesNo(c.inCellFellowship),
      committedText(c),
      c.tags.join(', ') || '—', c.notes || '—',
      c.addedBy, fmtDate(c.addedAt), c.welcomeSentAt ? fmtDate(c.welcomeSentAt) : 'No',
    ]),
  };
}

export default function ReportsModule({ contacts }: { contacts: Contact[] }) {
  const { toast } = useToast();
  const thisWeek = weekStartOf(new Date());
  const [type, setType] = useState<ReportType>('attendance-weekly');
  const [preset, setPreset] = useState<Preset>('last-4');
  const [customFrom, setCustomFrom] = useState(addWeeks(thisWeek, -3));
  const [customTo, setCustomTo] = useState(thisWeek);
  const [scope, setScope] = useState<'active' | 'committed' | 'all'>('active');
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  const [fromWeek, toWeek] = useMemo((): [string, string] => {
    switch (preset) {
      case 'this-week': return [thisWeek, thisWeek];
      case 'last-4': return [addWeeks(thisWeek, -3), thisWeek];
      case 'last-12': return [addWeeks(thisWeek, -11), thisWeek];
      case 'this-year': return [weekStartOf(new Date(new Date().getFullYear(), 0, 1)), thisWeek];
      default: {
        const a = weekStartOf(fromIsoDate(customFrom));
        const b = weekStartOf(fromIsoDate(customTo));
        return a <= b ? [a, b] : [b, a];
      }
    }
  }, [preset, customFrom, customTo, thisWeek]);

  const scoped = contacts.filter((c) => {
    if (scope === 'all') return true;
    if (c.archived) return false;
    return scope === 'committed' ? c.attendanceCommitment === 'yes' : true;
  });

  const report = useMemo(
    () => buildReport(type, weeksBetween(fromWeek, toWeek), scoped, store.getAttendance()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, fromWeek, toWeek, scope, contacts],
  );

  async function download(format: ExportFormat) {
    setBusy(format);
    try {
      const file = await exportReport(report, format);
      toast('success', 'Report downloaded', file);
    } catch (err) {
      console.error(err);
      toast('error', 'Export failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  }

  const PREVIEW_ROWS = 50;
  const isDateless = type === 'contacts';

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '4px' }}>Insights</p>
            <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.8rem', fontWeight: 500, color: 'var(--text)' }}>Reports</h1>
            <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '2px' }}>{REPORT_TYPES.find((r) => r.id === type)?.hint}</p>
          </div>
          <div className="action-row">
            {([['xlsx', 'Excel'], ['pdf', 'PDF'], ['docx', 'Word']] as const).map(([fmt, label]) => (
              <button key={fmt} className={`btn btn-sm ${fmt === 'xlsx' ? 'btn-primary' : 'btn-outline'}`} disabled={busy !== null} onClick={() => download(fmt)}>
                {busy === fmt ? 'Preparing…' : `Download ${label}`}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', paddingBottom: '12px', flexWrap: 'wrap' }}>
          {REPORT_TYPES.map((r) => (
            <button key={r.id} className={`chip ${type === r.id ? 'chip-on' : ''}`} onClick={() => setType(r.id)}>{r.label}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px', paddingBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
          {!isDateless && (
            <>
              <select className="input" style={{ width: 'auto' }} value={preset} onChange={(e) => setPreset(e.target.value as Preset)} aria-label="Period">
                <option value="this-week">This week</option>
                <option value="last-4">Last 4 weeks</option>
                <option value="last-12">Last 12 weeks</option>
                <option value="this-year">This year</option>
                <option value="custom">Custom range…</option>
              </select>
              {preset === 'custom' && (
                <>
                  <input type="date" className="input" style={{ width: 'auto' }} value={customFrom} max={toIsoDate(new Date())} onChange={(e) => setCustomFrom(e.target.value)} aria-label="From" />
                  <span style={{ color: 'var(--text-3)', fontSize: '13px' }}>to</span>
                  <input type="date" className="input" style={{ width: 'auto' }} value={customTo} max={toIsoDate(new Date())} onChange={(e) => setCustomTo(e.target.value)} aria-label="To" />
                </>
              )}
            </>
          )}
          <select className="input" style={{ width: 'auto' }} value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} aria-label="Contacts">
            <option value="active">Active contacts</option>
            <option value="committed">Committed to attend</option>
            <option value="all">All incl. archived</option>
          </select>
          {!isDateless && <span style={{ fontSize: '12.5px', color: 'var(--text-3)' }}>{report.subtitle}</span>}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {report.summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '18px' }}>
            {report.summary.map((s) => (
              <div key={s.label} className="card" style={{ padding: '14px 16px' }}>
                <p style={{ fontSize: '11.5px', color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--navy)', marginTop: '4px' }}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-scroll">
            {report.rows.length === 0 ? (
              <div className="empty-state"><h3>No data for this selection</h3><p style={{ fontSize: '13px' }}>Try a wider period or different contacts.</p></div>
            ) : (
              <table className="table">
                <thead>
                  <tr>{report.columns.map((c) => <th key={c.header} style={{ whiteSpace: 'nowrap' }}>{c.header}</th>)}</tr>
                </thead>
                <tbody>
                  {report.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} style={{ fontSize: '12.5px', maxWidth: '280px' }}>
                          {cell === 'Yes' ? <span className="badge badge-green">Yes</span>
                            : cell === 'No' && report.columns[j].header === 'Attended' ? <span className="badge badge-gray">No</span>
                            : cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {report.rows.length > PREVIEW_ROWS && (
            <p style={{ padding: '10px 16px', fontSize: '12.5px', color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>
              Showing the first {PREVIEW_ROWS} of {report.rows.length} rows. The download includes everything.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
