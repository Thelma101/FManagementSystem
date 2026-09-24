import { useState } from 'react';
import type { AuthUser } from '../../types';
import { store } from '../../lib/store';
import { useToast } from '../ui/Toast';

interface Props { currentUser: AuthUser; }

function genMfa() { return String(Math.floor(100000 + Math.random() * 900000)); }

export default function UsersModule({ currentUser }: Props) {
  const { toast } = useToast();
  const [users, setUsers] = useState<AuthUser[]>(store.getUsers());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'authorized' as AuthUser['role'] });
  const [error, setError] = useState('');

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (users.some((u) => u.email.toLowerCase() === form.email.trim().toLowerCase())) {
      setError('A user with this email already exists.');
      return;
    }
    const newUser: AuthUser = {
      id: 'u' + Date.now(), name: form.name.trim(),
      email: form.email.trim().toLowerCase(), role: form.role,
      passwordHash: form.password, mfaCode: genMfa(),
    };
    const updated = [...users, newUser];
    store.saveUsers(updated);
    setUsers(updated);
    setOpen(false);
    setForm({ name: '', email: '', password: '', role: 'authorized' });
    toast('success', 'Access granted', newUser.name);
  }

  function revokeUser(id: string) {
    if (id === currentUser.id) { toast('error', 'Cannot revoke your own account'); return; }
    const u = users.find((x) => x.id === id);
    if (!confirm(`Revoke access for ${u?.name}? They will no longer be able to sign in.`)) return;
    const updated = users.filter((x) => x.id !== id);
    store.saveUsers(updated);
    setUsers(updated);
    toast('info', 'Access revoked', u?.name);
  }

  const adminCount = users.filter((u) => u.role === 'admin').length;

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: '16px' }}>
          <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '4px' }}>
              Access Control
            </p>
            <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.8rem', fontWeight: 500, color: 'var(--text)' }}>
              Authorized Users
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '3px' }}>
              {users.length} user{users.length !== 1 ? 's' : ''} · {adminCount} admin{adminCount !== 1 ? 's' : ''}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => { setForm({ name: '', email: '', password: '', role: 'authorized' }); setError(''); setOpen(true); }}>
            + Grant access
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Users table */}
        <div className="card" style={{ marginBottom: '20px' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ paddingLeft: '20px' }}>User</th>
                <th>Email</th>
                <th>Role</th>
                <th style={{ textAlign: 'right', paddingRight: '20px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const initials = u.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
                const isAdmin  = u.role === 'admin';
                const isSelf   = u.id === currentUser.id;
                return (
                  <tr key={u.id}>
                    <td style={{ paddingLeft: '20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                          background: isAdmin
                            ? 'linear-gradient(135deg, #C8A84B, #8C6F1E)'
                            : 'var(--navy-light)',
                          border: `1px solid ${isAdmin ? 'var(--gold-border)' : '#BFCFE9'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '12px', fontWeight: 700,
                          color: isAdmin ? '#fff' : 'var(--navy)',
                          fontFamily: 'Inter, sans-serif',
                        }}>
                          {initials}
                        </div>
                        <div>
                          <p style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text)' }}>{u.name}</p>
                          {isSelf && (
                            <span style={{ fontSize: '11px', color: 'var(--navy)', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
                              You
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-2)', fontSize: '13px', fontFamily: 'JetBrains Mono, monospace' }}>
                      {u.email}
                    </td>
                    <td>
                      <span className={`badge ${isAdmin ? 'badge-gold' : 'badge-navy'}`}>
                        {isAdmin ? 'Admin' : 'Authorized'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: '20px' }}>
                      {!isSelf && (
                        <button className="btn btn-danger btn-sm" onClick={() => revokeUser(u.id)}>
                          Revoke access
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Security guidelines */}
        <div style={{
          padding: '18px 20px',
          borderRadius: '10px',
          background: 'var(--navy-xlight)',
          border: '1px solid #BFCFE9',
        }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '7px', flexShrink: 0,
              background: 'var(--navy-light)', border: '1px solid #BFCFE9',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy)',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--navy)', marginBottom: '8px', fontFamily: 'Inter, sans-serif' }}>
                Security Guidelines
              </p>
              <ul style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.85, paddingLeft: '18px' }}>
                <li>Share passwords through a private, secure channel — in person or via encrypted message.</li>
                <li>Revoke access immediately if a device is lost or a team member departs.</li>
                <li>Only Admin-role users can manage contacts, schedules, and other users.</li>
                <li>Regularly audit the users list to ensure only active members retain access.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Grant access modal */}
      {open && (
        <div className="overlay">
          <div className="modal" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <div>
                <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.25rem', fontWeight: 500 }}>
                  Grant Portal Access
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '2px' }}>
                  Add a new authorised team member
                </p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleAdd}>
              <div className="modal-body">
                <div>
                  <label className="label">Full name *</label>
                  <input required className="input" value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Sister Favour Adeyemi" autoFocus />
                </div>
                <div>
                  <label className="label">Email address *</label>
                  <input required type="email" className="input" value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="favour@fellowship.church" />
                </div>
                <div>
                  <label className="label">Temporary password *</label>
                  <input required className="input" value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="They should change this after first login" />
                </div>
                <div>
                  <label className="label">Role</label>
                  <select className="input" value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AuthUser['role'] }))}>
                    <option value="authorized">Authorized — view and send only</option>
                    <option value="admin">Admin — full access including user management</option>
                  </select>
                </div>
                {error && (
                  <div style={{ fontSize: '13px', color: 'var(--red)', background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: '7px', padding: '10px 14px' }}>
                    {error}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Grant access</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
