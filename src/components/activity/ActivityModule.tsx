import { useEffect, useMemo, useState } from 'react';
import type { ActivityEntry, ServiceType } from '../../types';
import { loadActivity } from '../../lib/cloud';
import { store } from '../../lib/store';
import { serviceLabel } from '../../lib/services';

const LIMIT = 500;

const ENTITIES: { id: string; label: string; noun: string }[] = [
  { id: 'contacts', label: 'Contacts', noun: 'contact' },
  { id: 'contact_groups', label: 'Groups', noun: 'group' },
  { id: 'events', label: 'Schedules', noun: 'schedule' },
  { id: 'message_logs', label: 'Message history', noun: 'message record for' },
  { id: 'contact_fields', label: 'Contact fields', noun: 'contact field' },
  { id: 'welcome_templates', label: 'Welcome templates', noun: 'welcome template' },
  { id: 'users', label: 'Users', noun: 'user' },
];

const PERIODS: { id: string; label: string; days?: number }[] = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All time' },
];

const VERB: Record<string, string> = {
  created: 'added',
  updated: 'changed',
  deleted: 'deleted',
  archived: 'archived',
  restored: 'restored',
  paused: 'paused',
  resumed: 'resumed',
  removed: 'removed',
  queued: 'queued reminders for',
  skipped: 'skipped reminders for',
};

const ACTION_BADGE: Record<string, string> = {
  created: 'badge-green', registered: 'badge-green', restored: 'badge-green', resumed: 'badge-green', queued: 'badge-blue',
  updated: 'badge-gold', paused: 'badge-amber', archived: 'badge-amber', skipped: 'badge-amber',
  deleted: 'badge-red', removed: 'badge-red',
};

const FIELD_LABEL: Record<string, string> = {
  met_location: 'Where met', met_date: 'Date met', born_again: 'Born again', salvation_date: 'Salvation date',
  salvation_place: 'Salvation place', baptism_date: 'Baptism date', baptism_place: 'Baptism place',
  in_cell_fellowship: 'In a cell fellowship', cell_name: 'Cell', attendance_commitment: 'Will attend',
  committed_services: 'Committed to', committed_special_event: 'Special event', custom: 'Extra fields',
  group_ids: 'Groups', day_of_week: 'Day', lead_time_hours: 'Reminder times', message_template: 'Message',
  audience_type: 'Audience', audience_value: 'Audience group/tag', ask_date: 'Ask date', ask_place: 'Ask place',
  added_by: 'Added by', added_at: 'Added on', built_in: 'Built in', created_by: 'Created by', text: 'Wording',
};

function fieldLabel(key: string) {
  return FIELD_LABEL[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}

function show(key: string, v: unknown, groupNames: Map<string, string>): string {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) {
    if (key === 'group_ids') return v.map((id) => groupNames.get(String(id)) ?? 'deleted group').join(', ');
    if (key === 'committed_services') return v.map((s) => serviceLabel(s as ServiceType)).join(', ');
    if (key === 'lead_time_hours') return v.map((h) => (h >= 24 ? `${h / 24}d` : `${h}h`)).join(', ') + ' before';
    return v.join(', ');
  }
  if (typeof v === 'object') return 'updated';
  const s = String(v);
  return s.length > 80 ? s.slice(0, 77) + '…' : s;
}

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function sentence(e: ActivityEntry) {
  if (e.action === 'registered') return 'created their own account';
  const noun = ENTITIES.find((x) => x.id === e.entity)?.noun ?? e.entity;
  return `${VERB[e.action] ?? e.action} ${noun}`;
}

export default function ActivityModule() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [entity, setEntity] = useState('');
  const [actor, setActor] = useState('');
  const [period, setPeriod] = useState('30');
  const [search, setSearch] = useState('');
  const groupNames = useMemo(() => new Map(store.getGroups().map((g) => [g.id, g.name])), []);

  function load() {
    const days = PERIODS.find((p) => p.id === period)?.days;
    setLoading(true);
    setError('');
    loadActivity({ entity: entity || undefined, actor: actor || undefined, since: days ? new Date(Date.now() - days * 86400000).toISOString() : undefined }, LIMIT)
      .then(setEntries)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load the activity log'))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [entity, actor, period]);

  const people = useMemo(
    () => [...new Set([...store.getUsers().map((u) => u.name), 'Automatic reminders', ...entries.map((e) => e.actorName), actor].filter(Boolean))].sort(),
    [entries, actor],
  );

  const shown = entries.filter((e) => {
    const q = search.trim().toLowerCase();
    return !q || [e.actorName, e.label ?? '', e.detail ?? ''].some((v) => v.toLowerCase().includes(q));
  });

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: '16px' }}>
          <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '4px' }}>Admin</p>
            <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.8rem', fontWeight: 500, color: 'var(--text)' }}>Activity</h1>
            <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '2px' }}>
              Who added, changed or deleted what. Entries can't be edited or removed.
            </p>
          </div>
          <button className="btn btn-outline" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
        <div style={{ display: 'flex', gap: '8px', paddingBottom: '14px', flexWrap: 'wrap' }}>
          <input type="text" className="input" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search names and details…" style={{ flex: 1, minWidth: '180px' }} />
          <select className="input" value={entity} onChange={(e) => setEntity(e.target.value)} style={{ width: 'auto', minWidth: '150px' }}>
            <option value="">Everything</option>
            {ENTITIES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
          <select className="input" value={actor} onChange={(e) => setActor(e.target.value)} style={{ width: 'auto', minWidth: '150px' }}>
            <option value="">Everyone</option>
            {people.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 'auto', minWidth: '130px' }}>
            {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }} className="table-scroll">
        {error ? (
          <div className="empty-state"><h3>Couldn't load activity</h3><p style={{ fontSize: '13px' }}>{error}</p></div>
        ) : !loading && shown.length === 0 ? (
          <div className="empty-state"><h3>No activity found</h3><p style={{ fontSize: '13px' }}>Try a longer period or clear the filters.</p></div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ paddingLeft: '24px', width: '170px' }}>When</th>
                <th>What happened</th>
                <th style={{ paddingRight: '24px' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id}>
                  <td style={{ paddingLeft: '24px', fontSize: '12.5px', color: 'var(--text-3)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{fmtWhen(e.at)}</td>
                  <td style={{ verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className={`badge ${ACTION_BADGE[e.action] ?? 'badge-gray'}`} style={{ fontSize: '11px' }}>{e.action}</span>
                      <span style={{ fontSize: '13.5px' }}>
                        <strong>{e.actorName}</strong> {sentence(e)} {e.action !== 'registered' && e.label && <strong>{e.label}</strong>}
                      </span>
                    </div>
                  </td>
                  <td style={{ paddingRight: '24px', fontSize: '12.5px', color: 'var(--text-2)', verticalAlign: 'top' }}>
                    {e.detail && <p>{e.detail}</p>}
                    {e.changes && Object.entries(e.changes).map(([key, [before, after]]) => (
                      <p key={key} style={{ marginTop: '2px' }}>
                        <span style={{ color: 'var(--text-3)' }}>{fieldLabel(key)}:</span>{' '}
                        <span style={{ textDecoration: 'line-through', color: 'var(--text-3)' }}>{show(key, before, groupNames)}</span>
                        {' → '}
                        <span>{show(key, after, groupNames)}</span>
                      </p>
                    ))}
                    {!e.detail && !e.changes && <span style={{ color: 'var(--text-4)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {entries.length >= LIMIT && (
          <p style={{ padding: '12px 24px', fontSize: '12.5px', color: 'var(--text-3)' }}>
            Showing the latest {LIMIT} entries. Narrow the filters to see older ones.
          </p>
        )}
      </div>
    </div>
  );
}
