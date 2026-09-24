import { useState } from 'react';
import { login, verifyMfa } from '../../lib/mockApi';
import type { AuthUser } from '../../types';

interface Props { onLogin: (user: AuthUser) => void; }

function LfcCrest({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Living Faith Church crest">
      <path d="M36 4L8 16v20c0 16 12 28 28 32C52 64 64 52 64 36V16L36 4z" fill="#001845" stroke="#C8A84B" strokeWidth="2"/>
      <path d="M36 10L14 20v16c0 12 9 22 22 26 13-4 22-14 22-26V20L36 10z" fill="none" stroke="rgba(200,168,75,0.35)" strokeWidth="1"/>
      <ellipse cx="36" cy="38" rx="13" ry="13" fill="none" stroke="#C8A84B" strokeWidth="1.5"/>
      <ellipse cx="36" cy="38" rx="6" ry="13" fill="none" stroke="#C8A84B" strokeWidth="1"/>
      <line x1="23" y1="38" x2="49" y2="38" stroke="#C8A84B" strokeWidth="1"/>
      <line x1="24.5" y1="32" x2="47.5" y2="32" stroke="#C8A84B" strokeWidth="0.8"/>
      <line x1="24.5" y1="44" x2="47.5" y2="44" stroke="#C8A84B" strokeWidth="0.8"/>
      <path d="M36 8C34 12 30 14 32 18c1-3 3-4 4-2 1-2 3-1 4 2 2-4-2-6-4-10z" fill="#C8A84B"/>
      <path d="M36 12c-1 2-3 3-2 5 1-1 1.5-1.5 2-0.5.5-1 1-0.5 2 0.5 1-2-1-3-2-5z" fill="#FFE08A"/>
    </svg>
  );
}

type Step = 'credentials' | 'mfa';

export default function LoginScreen({ onLogin }: Props) {
  const [step, setStep]         = useState<Step>('credentials');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode]   = useState('');
  const [pendingUserId, setPendingUserId] = useState('');
  const [mfaHint, setMfaHint]   = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (!result.ok) { setError(result.error); return; }
    setPendingUserId(result.userId);
    setMfaHint(result.hint);
    setStep('mfa');
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await verifyMfa(pendingUserId, mfaCode);
    setLoading(false);
    if (!result.ok) { setError(result.error); return; }
    onLogin(result.user);
  }

  function backToCredentials() {
    setStep('credentials');
    setMfaCode('');
    setError('');
    setPendingUserId('');
    setMfaHint('');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: 'Inter, sans-serif' }}>

      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10,
        background: 'var(--navy)', padding: '14px 20px',
        display: 'flex', alignItems: 'center', gap: '10px',
      }} className="login-mobile-bar">
        <LfcCrest size={32} />
        <div>
          <p style={{ fontFamily: 'Playfair Display, serif', fontSize: '0.85rem', color: '#fff', fontWeight: 500 }}>Living Faith Church</p>
          <p style={{ fontSize: '9px', color: 'rgba(200,168,75,0.85)', textTransform: 'uppercase', letterSpacing: '0.16em', fontWeight: 700 }}>Communications Portal</p>
        </div>
      </div>

      {/* Brand panel */}
      <div className="login-brand" style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '52px 64px',
        background: 'linear-gradient(150deg, #001845 0%, #002B6B 50%, #1A4080 100%)',
        position: 'relative',
        overflow: 'hidden',
        minWidth: 0,
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at 70% 25%, rgba(200,168,75,0.09) 0%, transparent 55%), radial-gradient(ellipse at 15% 80%, rgba(200,168,75,0.06) 0%, transparent 50%)',
        }} />

        <div className="fade-up" style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
          <LfcCrest size={44} />
          <div>
            <p style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.1rem', color: '#fff', lineHeight: 1.2, fontWeight: 500 }}>
              Living Faith Church
            </p>
            <p style={{ fontSize: '10px', color: 'rgba(200,168,75,0.85)', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600 }}>
              Winners' Chapel
            </p>
          </div>
        </div>

        <div className="fade-up d1" style={{ position: 'relative' }}>
          <LfcCrest size={100} />
          <h1 style={{
            fontFamily: 'Playfair Display, serif',
            fontSize: 'clamp(1.9rem, 3.2vw, 2.9rem)',
            fontWeight: 500,
            color: '#fff',
            lineHeight: 1.22,
            marginTop: '28px',
            marginBottom: '18px',
          }}>
            Reaching souls,<br />
            <em style={{ color: '#C8A84B', fontStyle: 'italic' }}>one message</em><br />
            at a time.
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.58)', fontSize: '14.5px', lineHeight: 1.8, maxWidth: '380px' }}>
            A secure portal for soul winning, follow-up care,<br />and automated church communications.
          </p>

          <div style={{ display: 'flex', gap: '10px', marginTop: '30px', flexWrap: 'wrap' }}>
            {[
              { label: 'SMS', d: 'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72' },
              { label: 'WhatsApp', d: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z' },
              { label: 'Scheduler', d: 'M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
              { label: 'Contacts', d: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z' },
            ].map((f) => (
              <span key={f.label} style={{
                fontSize: '12px', fontWeight: 500,
                padding: '5px 14px', borderRadius: '99px',
                background: 'rgba(200,168,75,0.12)',
                border: '1px solid rgba(200,168,75,0.3)',
                color: '#F7EDD0',
                display: 'inline-flex', alignItems: 'center', gap: '6px',
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={f.d} />
                </svg>
                {f.label}
              </span>
            ))}
          </div>
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
        borderLeft: '1px solid #E2E8F0',
      }}>
        <div className="slide-right" key={step}>
          <div style={{ marginBottom: '32px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '7px',
              padding: '4px 12px', borderRadius: '99px',
              background: '#EEF3FB', border: '1px solid #BFCFE9',
              marginBottom: '20px',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#002B6B', display: 'inline-block' }} />
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#002B6B', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {step === 'credentials' ? 'Secure Portal Access' : 'Two-Factor Verification'}
              </span>
            </div>
            <h2 style={{
              fontFamily: 'Playfair Display, serif',
              fontSize: '2rem',
              fontWeight: 500,
              color: '#0A1628',
              marginBottom: '8px',
              letterSpacing: '-0.02em',
            }}>
              {step === 'credentials' ? 'Welcome back' : 'Verify it\'s you'}
            </h2>
            <p style={{ color: '#64748B', fontSize: '14px', lineHeight: 1.6 }}>
              {step === 'credentials'
                ? 'Sign in to access the communications portal.'
                : 'Enter the 6-digit code from your authenticator.'}
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
                ) : 'Continue'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleMfa} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="label">Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  className="input mono"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  placeholder="000000"
                  autoComplete="one-time-code"
                  autoFocus
                  style={{ letterSpacing: '0.35em', fontSize: '1.25rem', textAlign: 'center' }}
                />
              </div>

              {mfaHint && (
                <div style={{
                  fontSize: '13px', color: 'var(--navy)',
                  background: 'var(--navy-xlight)', border: '1px solid #BFCFE9',
                  borderRadius: '8px', padding: '11px 14px',
                }}>
                  Demo code: <span className="mono" style={{ fontWeight: 600 }}>{mfaHint}</span>
                </div>
              )}

              {error && (
                <div style={{
                  fontSize: '13.5px', color: '#B91C1C',
                  background: '#FEE2E2', border: '1px solid #FCA5A5',
                  borderRadius: '8px', padding: '11px 14px',
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || mfaCode.length !== 6}
                className="btn btn-primary"
                style={{ width: '100%', padding: '11px', marginTop: '4px', fontSize: '14.5px', fontWeight: 600 }}
              >
                {loading ? 'Verifying…' : 'Verify & sign in'}
              </button>

              <button type="button" className="btn btn-ghost" onClick={backToCredentials} style={{ width: '100%' }}>
                ← Back to sign in
              </button>
            </form>
          )}

          {step === 'credentials' && (
            <div style={{
              marginTop: '28px', padding: '16px 18px',
              borderRadius: '10px', background: '#F5F8FD',
              border: '1px solid #E2E8F0',
            }}>
              <p style={{ fontSize: '10.5px', fontWeight: 700, color: '#002B6B', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
                Demo Credentials
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <p style={{ fontSize: '13px', color: '#334155' }}>
                  <span style={{ color: '#64748B', display: 'inline-block', width: '70px' }}>Email</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 500, fontSize: '12.5px' }}>admin@fellowship.church</span>
                </p>
                <p style={{ fontSize: '13px', color: '#334155' }}>
                  <span style={{ color: '#64748B', display: 'inline-block', width: '70px' }}>Password</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 500, fontSize: '12.5px' }}>admin123</span>
                </p>
                <p style={{ fontSize: '13px', color: '#334155' }}>
                  <span style={{ color: '#64748B', display: 'inline-block', width: '70px' }}>MFA</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 500, fontSize: '12.5px' }}>847291</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
