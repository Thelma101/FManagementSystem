import { useEffect, useState } from 'react';
import type { AuthUser, UserRole } from '../../types';
import { store } from '../../lib/store';
import { ROLE_DESCRIPTION, ROLE_LABEL, assignableRoles, canManageUser } from '../../lib/permissions';
import { getWaIntegrationStatus, providerName, type WaIntegrationStatus } from '../../lib/whatsapp';
import { fmtDate } from '../../lib/services';
import { useToast } from '../ui/Toast';

interface Props { currentUser: AuthUser; }

function genMfa() { return String(Math.floor(100000 + Math.random() * 900000)); }

const ROLE_ORDER: UserRole[] = ['superadmin', 'admin', 'authorized'];
const ROLE_BADGE: Record<UserRole, string> = { superadmin: 'badge-gold', admin: 'badge-navy', authorized: 'badge-gray' };

interface Credentials { name: string; email: string; password: string; mfaCode: string; role: UserRole }

export default function UsersModule({ currentUser }: Props) {
  const { toast } = useToast();
  const [users, setUsers] = useState<AuthUser[]>(store.getUsers());
  const [open, setOpen] = useState(false);
  const allowedRoles = assignableRoles(currentUser);
  const blankForm = { name: '', email: '', password: '', role: 'authorized' as UserRole };
  const [form, setForm] = useState(blankForm);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Credentials | null>(null);
  const [wa, setWa] = useState<WaIntegrationStatus | null>(null);

  useEffect(() => { getWaIntegrationStatus().then(setWa); }, []);

  function persist(next: AuthUser[]) {
    store.saveUsers(next);
    setUsers(next);
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!allowedRoles.includes(form.role)) {
      setError(`You can't grant the ${ROLE_LABEL[form.role]} role.`);
      return;
    }
    if (users.some((u) => u.email.toLowerCase() === form.email.trim().toLowerCase())) {
      setError('A user with this email already exists.');
      return;
    }
    if (form.password.length < 6) {
      setError('Temporary password must be at least 6 characters.');
      return;
    }
    const newUser: AuthUser = {
      id: 'u' + Date.now(), name: form.name.trim(),
      email: form.email.trim().toLowerCase(), role: form.role,
      passwordHash: form.password, mfaCode: genMfa(),
      createdBy: currentUser.name, createdAt: new Date().toISOString(),
    };
    persist([...users, newUser]);
    setOpen(false);
    setForm(blankForm);
    setCreated({ name: newUser.name, email: newUser.email, password: form.password, mfaCode: newUser.mfaCode, role: newUser.role });
    toast('success', 'Access granted', newUser.name);
  }

  function changeRole(target: AuthUser, role: UserRole) {
    if (!canManageUser(currentUser, target) || !allowedRoles.includes(role)) return;
    if (!confirm(`Change ${target.name}'s role to ${ROLE_LABEL[role]}?`)) return;
    persist(users.map((u) => (u.id === target.id ? { ...u, role } : u)));
    toast('success', 'Role updated', `${target.name} is now ${ROLE_LABEL[role]}`);
  }

  function revokeUser(target: AuthUser) {
    if (!canManageUser(currentUser, target)) { toast('error', "You can't revoke this account"); return; }
    if (!confirm(`Revoke access for ${target.name}? They will no longer be able to sign in.`)) return;
    persist(users.filter((x) => x.id !== target.id));
    toast('info', 'Access revoked', target.name);
  }

  function copyCredentials(c: Credentials) {
    const text = `Fellowship Portal access\nURL: ${window.location.origin}\nEmail: ${c.email}\nTemporary password: ${c.password}\nVerification code: ${c.mfaCode}`;
    navigator.clipboard?.writeText(text).then(
      () => toast('success', 'Copied to clipboard'),
      () => toast('error', 'Could not copy — please copy manually'),
    );
  }

  const countByRole = (r: UserRole) => users.filter((u) => u.role === r).length;
  const sorted = [...users].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: '16px', gap: '12px' }}>
          <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '4px' }}>
              Access Control
            </p>
            <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.8rem', fontWeight: 500, color: 'var(--text)' }}>
              Portal Users
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '3px' }}>
              {ROLE_ORDER.map((r) => `${countByRole(r)} ${ROLE_LABEL[r]}${countByRole(r) !== 1 ? 's' : ''}`).join(' · ')}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => { setForm(blankForm); setError(''); setOpen(true); }}>
            + Grant access
          </button>
        </div>
      </div>

      <div className="page-body">
        {created && (
          <div className="alert alert-navy" style={{ marginBottom: '18px', display: 'block' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontWeight: 700, marginBottom: '6px' }}>Share these sign-in details with {created.name}</p>
                <p style={{ fontSize: '12.5px', marginBottom: '8px' }}>
                  They are shown only once. Send them privately (in person or an encrypted message).
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px', fontSize: '13px' }}>
                  <span>Role</span><strong>{ROLE_LABEL[created.role]}</strong>
                  <span>Email</span><code>{created.email}</code>
                  <span>Temporary password</span><code>{created.password}</code>
                  <span>Verification code</span><code>{created.mfaCode}</code>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button className="btn btn-outline btn-sm" onClick={() => copyCredentials(created)}>Copy</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setCreated(null)} aria-label="Dismiss">✕</button>
              </div>
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: '20px' }}>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Added</th>
                  <th style={{ textAlign: 'right', paddingRight: '20px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((u) => {
                  const initials = u.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
                  const elevated = u.role !== 'authorized';
                  const isSelf = u.id === currentUser.id;
                  const manageable = canManageUser(currentUser, u);
                  return (
                    <tr key={u.id}>
                      <td style={{ paddingLeft: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                            background: elevated ? 'linear-gradient(135deg, #C8A84B, #8C6F1E)' : 'var(--navy-light)',
                            border: `1px solid ${elevated ? 'var(--gold-border)' : '#BFCFE9'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '12px', fontWeight: 700, color: elevated ? '#fff' : 'var(--navy)', fontFamily: 'Inter, sans-serif',
                          }}>
                            {initials}
                          </div>
                          <div>
                            <p style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text)' }}>{u.name}</p>
                            {isSelf && <span style={{ fontSize: '11px', color: 'var(--navy)', fontWeight: 600 }}>You</span>}
                          </div>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-2)', fontSize: '13px', fontFamily: 'JetBrains Mono, monospace' }}>{u.email}</td>
                      <td>
                        {manageable && allowedRoles.length > 1 ? (
                          <select className="input" style={{ width: 'auto', padding: '4px 8px', fontSize: '12.5px' }} value={u.role}
                            onChange={(e) => changeRole(u, e.target.value as UserRole)} aria-label={`Role for ${u.name}`}>
                            {allowedRoles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                          </select>
                        ) : (
                          <span className={`badge ${ROLE_BADGE[u.role]}`}>{ROLE_LABEL[u.role]}</span>
                        )}
                      </td>
                      <td style={{ fontSize: '12.5px', color: 'var(--text-3)' }}>
                        {u.createdAt ? `${fmtDate(u.createdAt)}${u.createdBy ? ` by ${u.createdBy}` : ''}` : 'Original account'}
                      </td>
                      <td style={{ textAlign: 'right', paddingRight: '20px' }}>
                        {manageable && (
                          <button className="btn btn-danger btn-sm" onClick={() => revokeUser(u)}>Revoke access</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          <div className="card" style={{ padding: '18px 20px' }}>
            <p style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--navy)', marginBottom: '10px' }}>Who can do what</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {ROLE_ORDER.map((r) => (
                <div key={r} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <span className={`badge ${ROLE_BADGE[r]}`} style={{ minWidth: '104px', justifyContent: 'center' }}>{ROLE_LABEL[r]}</span>
                  <p style={{ fontSize: '12.5px', color: 'var(--text-2)', lineHeight: 1.5 }}>{ROLE_DESCRIPTION[r]}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: '18px 20px' }}>
            <p style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--navy)', marginBottom: '10px' }}>WhatsApp number verification</p>
            {wa === null ? (
              <p style={{ fontSize: '12.5px', color: 'var(--text-3)' }}>Checking connection…</p>
            ) : wa.configured ? (
              <p style={{ fontSize: '12.5px', color: 'var(--text-2)', lineHeight: 1.6 }}>
                <span className="badge badge-green" style={{ marginRight: '6px' }}>Connected</span>
                Numbers are verified live through <strong>{providerName(wa.provider)}</strong>.
              </p>
            ) : (
              <div style={{ fontSize: '12.5px', color: 'var(--text-2)', lineHeight: 1.6 }}>
                <p><span className="badge badge-amber" style={{ marginRight: '6px' }}>Demo mode</span>No verification provider is connected, so WhatsApp checks are simulated and marked "demo".</p>
                <p style={{ marginTop: '6px' }}>
                  To go live, create an account with <strong>WA Lookup</strong> or <strong>2Chat</strong> and set
                  <code> WA_CHECK_PROVIDER</code> and <code>WA_CHECK_API_KEY</code> on the server (see README).
                </p>
              </div>
            )}
          </div>

          <div className="card" style={{ padding: '18px 20px' }}>
            <p style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--navy)', marginBottom: '10px' }}>Security guidelines</p>
            <ul style={{ fontSize: '12.5px', color: 'var(--text-2)', lineHeight: 1.8, paddingLeft: '18px' }}>
              <li>Share passwords privately — in person or via encrypted message.</li>
              <li>Revoke access immediately if a device is lost or a member leaves.</li>
              <li>Keep at least two Super Admins so the portal is never locked out.</li>
              <li>Review this list regularly so only active members keep access.</li>
            </ul>
          </div>
        </div>
      </div>

      {open && (
        <div className="overlay">
          <div className="modal" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <div>
                <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.25rem', fontWeight: 500 }}>Grant Portal Access</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '2px' }}>Add a new team member</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleAdd}>
              <div className="modal-body">
                <div>
                  <label className="label">Full name *</label>
                  <input required className="input" value={form.name} autoFocus placeholder="Sister Favour Adeyemi"
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Email address *</label>
                  <input required type="email" className="input" value={form.email} placeholder="favour@fellowship.church"
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Temporary password *</label>
                  <input required className="input" value={form.password} minLength={6} placeholder="At least 6 characters"
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Role</label>
                  <select className="input" value={form.role} disabled={allowedRoles.length === 1}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}>
                    {allowedRoles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                  <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '6px' }}>{ROLE_DESCRIPTION[form.role]}</p>
                  {currentUser.role === 'admin' && (
                    <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '4px' }}>
                      As an Admin you can add Authorized users. Ask a Super Admin to add Admins.
                    </p>
                  )}
                </div>
                {error && <div className="alert alert-red">{error}</div>}
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
