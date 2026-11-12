import { useMemo, useState } from 'react';
import type { AuthUser, SupportEntry, Zone } from '../../types';
import { canManageUsers } from '../../lib/permissions';
import { store } from '../../lib/store';
import { useToast } from '../ui/Toast';

interface Props { user: AuthUser }

export default function SupportModule({ user }: Props) {
  const { toast } = useToast();
  const canEdit = canManageUsers(user);
  const [entries, setEntries] = useState<SupportEntry[]>(() =>
    [...store.getSupportDirectory()].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  const [zones, setZones] = useState<Zone[]>(() => store.getZones());
  const [zoneForm, setZoneForm] = useState({ code: '', name: '', state: 'Lagos', country: 'Nigeria' });

  const myZone = useMemo(() => zones.find((z) => z.id === user.zoneId), [zones, user.zoneId]);

  function saveSupport(next: SupportEntry[]) {
    store.saveSupportDirectory(next);
    setEntries([...next].sort((a, b) => a.sortOrder - b.sortOrder));
  }

  function patchEntry(id: string, patch: Partial<SupportEntry>) {
    if (!canEdit) return;
    saveSupport(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function addZone(e: React.FormEvent) {
    e.preventDefault();
    if (user.role !== 'superadmin') return;
    const code = zoneForm.code.trim().toUpperCase();
    const name = zoneForm.name.trim();
    if (!code || !name) {
      toast('warning', 'Code and name are required');
      return;
    }
    if (zones.some((z) => z.code.toLowerCase() === code.toLowerCase())) {
      toast('error', 'That zone code already exists');
      return;
    }
    const next: Zone[] = [
      ...zones,
      {
        id: `zone-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        code,
        name,
        country: zoneForm.country.trim() || 'Nigeria',
        state: zoneForm.state.trim(),
        active: true,
        createdAt: new Date().toISOString(),
      },
    ];
    store.saveZones(next);
    setZones(next);
    setZoneForm({ code: '', name: '', state: 'Lagos', country: 'Nigeria' });
    toast('success', 'Zone added', name);
  }

  return (
    <div className="page">
      <div className="page-header">
        <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '4px' }}>
          Governance
        </p>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.8rem', fontWeight: 500, color: 'var(--text)' }}>
          Support & zones
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '2px' }}>
          Zone directory and who to call for access, privacy and technical help.
          {myZone ? ` Your zone: ${myZone.name} (${myZone.code}).` : user.role === 'superadmin' ? ' Super Admin — all zones.' : ''}
        </p>
      </div>

      <div style={{ padding: '0 24px 24px', display: 'grid', gap: '20px', maxWidth: '920px' }}>
        <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '18px 20px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Support directory</h2>
          {entries.length === 0 && (
            <p style={{ color: 'var(--text-3)', fontSize: '13px' }}>No entries yet. Run database migration 0010, then refresh.</p>
          )}
          <div style={{ display: 'grid', gap: '12px' }}>
            {entries.map((entry) => (
              <div key={entry.id} style={{ display: 'grid', gap: '8px', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                <p style={{ gridColumn: '1 / -1', fontWeight: 600, color: 'var(--navy)' }}>{entry.label}</p>
                <input className="input" disabled={!canEdit} placeholder="Name" value={entry.name}
                  onChange={(e) => patchEntry(entry.id, { name: e.target.value })}
                  onBlur={() => canEdit && toast('success', 'Saved', entry.label)} />
                <input className="input" disabled={!canEdit} placeholder="Email" value={entry.email}
                  onChange={(e) => patchEntry(entry.id, { email: e.target.value })} />
                <input className="input" disabled={!canEdit} placeholder="Phone" value={entry.phone}
                  onChange={(e) => patchEntry(entry.id, { phone: e.target.value })}
                  style={{ gridColumn: '1 / -1' }} />
              </div>
            ))}
          </div>
        </section>

        <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '18px 20px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Zones</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>State</th>
                <th>Country</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.id}>
                  <td className="mono">{z.code}</td>
                  <td>{z.name}</td>
                  <td>{z.state || '—'}</td>
                  <td>{z.country}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {user.role === 'superadmin' && (
            <form onSubmit={addZone} style={{ marginTop: '16px', display: 'grid', gap: '10px', gridTemplateColumns: '1fr 1fr' }}>
              <input className="input" placeholder="Code e.g. LG-AJAH" value={zoneForm.code}
                onChange={(e) => setZoneForm((f) => ({ ...f, code: e.target.value }))} required />
              <input className="input" placeholder="Zone name" value={zoneForm.name}
                onChange={(e) => setZoneForm((f) => ({ ...f, name: e.target.value }))} required />
              <input className="input" placeholder="State" value={zoneForm.state}
                onChange={(e) => setZoneForm((f) => ({ ...f, state: e.target.value }))} />
              <input className="input" placeholder="Country" value={zoneForm.country}
                onChange={(e) => setZoneForm((f) => ({ ...f, country: e.target.value }))} />
              <button type="submit" className="btn btn-primary" style={{ gridColumn: '1 / -1', justifySelf: 'start' }}>
                Add zone
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
