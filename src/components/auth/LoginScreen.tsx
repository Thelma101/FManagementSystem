import { useState } from 'react';
import { register, requestPasswordReset, signIn } from '../../lib/cloud';
import { MIN_PASSWORD_LENGTH, passwordError } from '../../lib/passwordRules';
import type { AuthUser } from '../../types';
import BrandMark from '../brand/BrandMark';

interface Props { onLogin: (user: AuthUser) => void; }

type Step = 'credentials' | 'reset' | 'register';

const HEADINGS: Record<Step, { badge: string; title: string; subtitle: string }> = {
  credentials: { badge: 'Staff sign-in', title: 'Welcome back', subtitle: 'Sign in to the Lekki Zone records.' },
  register: { badge: 'New account', title: 'Create an account', subtitle: 'You start as an Authorized user. A Super Admin can give you more access.' },
  reset: { badge: 'Password', title: 'Forgot password?', subtitle: "Enter your email and we will send a link to set a new password." },
};

export default function LoginScreen({ onLogin }: Props) {
  const [step, setStep]         = useState<Step>('credentials');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [info, setInfo]         = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await signIn(email, password);
      if (res.ok) { onLogin(res.user); return; }
      setError(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    const err = await requestPasswordReset(email);
    setLoading(false);
    if (err) setError(err);
    else setInfo(`If ${email.trim()} has portal access, a reset link is on its way. Check your inbox (and spam folder).`);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (name.trim().length < 2) { setError('Enter your full name.'); return; }
    const pwError = passwordError(password);
    if (pwError) { setError(pwError); return; }
    if (password !== confirmPw) { setError('The two passwords do not match.'); return; }
    setLoading(true);
    const res = await register(name.trim(), email, password);
    setLoading(false);
    if (res.ok) onLogin(res.user);
    else setError(res.error);
  }

  function backToCredentials() {
    setStep('credentials');
    setConfirmPw('');
    setError('');
    setInfo('');
  }

  const heading = HEADINGS[step];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: 'Inter, sans-serif' }}>

      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10,
        background: '#111', padding: '14px 20px',
        display: 'flex', alignItems: 'center', gap: '10px',
        boxShadow: 'inset 0 3px 0 0 #C41E3A, inset 0 5px 0 0 #F5C400',
      }} className="login-mobile-bar">
        <BrandMark size={32} label="Living Faith Church" />
        <div>
          <p style={{ fontFamily: 'Playfair Display, serif', fontSize: '0.85rem', color: '#fff', fontWeight: 500 }}>Living Faith (Lekki Zone)</p>
          <p style={{ fontSize: '9px', color: '#F5C400', textTransform: 'uppercase', letterSpacing: '0.16em', fontWeight: 700 }}>Communications</p>
        </div>
      </div>

      {/* Brand panel */}
      <div className="login-brand" style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '52px 64px',
        background: '#111111',
        position: 'relative',
        overflow: 'hidden',
        minWidth: 0,
        boxShadow: 'inset 0 3px 0 0 #C41E3A, inset 0 5px 0 0 #F5C400',
      }}>
        <div className="fade-up" style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
          <BrandMark size={44} label="Living Faith Church" />
          <div>
            <p style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.1rem', color: '#fff', lineHeight: 1.2, fontWeight: 500 }}>
              Living Faith (Lekki Zone)
            </p>
            <p style={{ fontSize: '10px', color: '#F5C400', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600 }}>
              Communications
            </p>
          </div>
        </div>

        <div className="fade-up d1" style={{ position: 'relative' }}>
          <BrandMark size={108} label="Living Faith Church" />
          <h1 style={{
            fontFamily: 'Playfair Display, serif',
            fontSize: 'clamp(1.9rem, 3.2vw, 2.9rem)',
            fontWeight: 500,
            color: '#fff',
            lineHeight: 1.22,
            marginTop: '28px',
            marginBottom: '18px',
          }}>
            Records for souls<br />
            won and followed up.
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.62)', fontSize: '14.5px', lineHeight: 1.8, maxWidth: '380px' }}>
            Contacts, attendance, templates, and who sent each message.
          </p>
          <p style={{ color: '#F5C400', fontSize: '13px', marginTop: '22px', letterSpacing: '0.04em' }}>
            SMS · WhatsApp · Follow-up · Register
          </p>
        </div>

        <div className="fade-up d2" style={{ position: 'relative' }}>
          <p style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.03em' }}>
            © {new Date().getFullYear()} Living Faith Church Worldwide · Canaan Land, Ota, Nigeria
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="login-form" style={{
        width: '440px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '52px 44px',
        background: '#FFFFFF',
        borderLeft: '1px solid #E0E0E0',
      }}>
        <div className="slide-right" key={step}>
          <div style={{ marginBottom: '32px' }}>
            <p className="kicker">{heading.badge}</p>
            <h2 style={{
              fontFamily: 'Playfair Display, serif',
              fontSize: '2rem',
              fontWeight: 500,
              color: '#111111',
              marginBottom: '8px',
              letterSpacing: '-0.02em',
            }}>
              {heading.title}
            </h2>
            <p style={{ color: '#64748B', fontSize: '14px', lineHeight: 1.6 }}>
              {heading.subtitle}
            </p>
          </div>

          {step === 'credentials' ? (
            <form onSubmit={handleCredentials} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="label">Email address</label>
                <input
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@fellowship.church"
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div>
                <label className="label">Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="input"
                    style={{ paddingRight: '44px' }}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    style={{
                      position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#94A3B8', padding: '4px', display: 'flex', alignItems: 'center',
                    }}
                    tabIndex={-1}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? (
                      <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{
                  fontSize: '13.5px', color: '#B91C1C',
                  background: '#FEE2E2', border: '1px solid #FCA5A5',
                  borderRadius: '8px', padding: '11px 14px',
                  display: 'flex', gap: '8px', alignItems: 'flex-start',
                }}>
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: '1px' }}>
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary"
                style={{ width: '100%', padding: '11px', marginTop: '4px', fontSize: '14.5px', fontWeight: 600 }}
              >
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                    <svg className="spin" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path d="M21 12a9 9 0 11-6.219-8.56"/>
                    </svg>
                    Signing in…
                  </span>
                ) : 'Sign in'}
              </button>

              <button type="button" className="btn btn-ghost" style={{ width: '100%' }}
                onClick={() => { setStep('reset'); setError(''); setInfo(''); }}>
                Forgot password?
              </button>

              <p style={{ fontSize: '13.5px', color: '#64748B', textAlign: 'center' }}>
                New here?{' '}
                <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--navy)', fontWeight: 600 }}
                  onClick={() => { setStep('register'); setError(''); setPassword(''); }}>
                  Create an account
                </button>
              </p>
            </form>
          ) : step === 'register' ? (
            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="label">Full name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)}
                  required placeholder="e.g. Adaeze Okonkwo" autoComplete="name" autoFocus />
              </div>
              <div>
                <label className="label">Email address</label>
                <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)}
                  required placeholder="you@fellowship.church" autoComplete="email" />
              </div>
              <div>
                <label className="label">Password</label>
                <input type={showPw ? 'text' : 'password'} className="input" value={password} onChange={(e) => setPassword(e.target.value)}
                  required minLength={MIN_PASSWORD_LENGTH} placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} autoComplete="new-password" />
              </div>
              <div>
                <label className="label">Confirm password</label>
                <input type={showPw ? 'text' : 'password'} className="input" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
                  required placeholder="Type it again" autoComplete="new-password" />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748B', cursor: 'pointer' }}>
                <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} /> Show passwords
              </label>
              {error && <div className="alert alert-red">{error}</div>}
              <button type="submit" disabled={loading} className="btn btn-primary"
                style={{ width: '100%', padding: '11px', fontSize: '14.5px', fontWeight: 600 }}>
                {loading ? 'Creating account…' : 'Create account'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={backToCredentials} style={{ width: '100%' }}>
                ← Already have an account? Sign in
              </button>
            </form>
          ) : (
            <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="label">Email address</label>
                <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)}
                  required placeholder="you@fellowship.church" autoComplete="email" autoFocus />
              </div>
              {error && <div className="alert alert-red">{error}</div>}
              {info && <div className="alert alert-navy">{info}</div>}
              <button type="submit" disabled={loading} className="btn btn-primary"
                style={{ width: '100%', padding: '11px', fontSize: '14.5px', fontWeight: 600 }}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={backToCredentials} style={{ width: '100%' }}>
                ← Back to sign in
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
