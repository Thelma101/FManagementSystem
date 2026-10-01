import { useState } from 'react';
import { changePassword } from '../../lib/cloud';
import { MIN_PASSWORD_LENGTH, passwordError } from '../../lib/passwordRules';

interface Props {
  name?: string;
  reason: 'first-login' | 'recovery';
  onDone: () => void;
  onCancel: () => void;
}

export default function SetPasswordScreen({ name, reason, onDone, onCancel }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const tooShort = passwordError(password);
    if (tooShort) { setError(tooShort); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setSaving(true);
    const err = await changePassword(password);
    setSaving(false);
    if (err) { setError(err); return; }
    onDone();
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'linear-gradient(150deg, #001845 0%, #002B6B 50%, #1A4080 100%)' }}>
      <div className="card" style={{ width: '100%', maxWidth: '420px', padding: '32px 30px' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
          {reason === 'first-login' ? 'First sign-in' : 'Password reset'}
        </p>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.7rem', fontWeight: 500, marginBottom: '6px' }}>
          Choose a new password
        </h1>
        <p style={{ fontSize: '13.5px', color: 'var(--text-3)', lineHeight: 1.6, marginBottom: '22px' }}>
          {reason === 'first-login'
            ? `Welcome${name ? `, ${name.split(' ')[0]}` : ''}! You signed in with a temporary password — please replace it with one only you know.`
            : 'Enter a new password for your account.'}
        </p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label className="label">New password</label>
            <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password" autoFocus required minLength={MIN_PASSWORD_LENGTH} placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password" required />
          </div>
          {error && <div className="alert alert-red">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '11px', fontWeight: 600 }}>
            {saving ? 'Saving…' : 'Save password & continue'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Sign out</button>
        </form>
      </div>
    </div>
  );
}
