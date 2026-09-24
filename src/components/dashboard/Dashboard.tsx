import type { Contact, MessageLog, ScheduledEvent, AuthUser, Tab } from '../../types';

interface Props {
  user: AuthUser;
  contacts: Contact[];
  logs: MessageLog[];
  events: ScheduledEvent[];
  onNavigate: (tab: Tab) => void;
}

function StatIcon({ path, color }: { path: string; color: string }) {
  return (
    <div style={{
      width: '36px', height: '36px', borderRadius: '8px',
      background: `${color}15`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, color,
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </div>
  );
}

function StatCard({ label, value, sub, accent, iconPath }: {
  label: string; value: string | number; sub?: string; accent: string; iconPath: string;
}) {
  return (
    <div className="stat-card fade-up" style={{ borderTop: `3px solid ${accent}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
        <StatIcon path={iconPath} color={accent} />
      </div>
      <p style={{ fontFamily: 'Playfair Display, serif', fontSize: '2.1rem', color: 'var(--text)', lineHeight: 1, fontWeight: 500 }}>{value}</p>
      {sub && <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '5px', fontFamily: 'Inter, sans-serif' }}>{sub}</p>}
    </div>
  );
}

export default function Dashboard({ user, contacts, logs, events, onNavigate }: Props) {
  const active      = contacts.filter((c) => !c.archived);
  const waActive    = active.filter((c) => c.whatsappStatus === 'active').length;
  const unverified  = active.filter((c) => c.whatsappStatus === 'unknown').length;
  const delivered   = logs.filter((l) => l.status === 'delivered').length;
  const activeScheds = events.filter((e) => e.active).length;

  const recentLogs = [...logs]
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
    .slice(0, 6);

  const upcomingEvents = [...events]
    .filter((e) => e.active && e.nextTrigger)
    .sort((a, b) => new Date(a.nextTrigger!).getTime() - new Date(b.nextTrigger!).getTime())
    .slice(0, 5);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  function fmtDate(iso: string) {
    const d    = new Date(iso);
    const diff = Math.round((d.getTime() - Date.now()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff > 0 && diff < 7) return `In ${diff} days`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function fmtRelative(iso: string) {
    const d    = new Date(iso);
    const diff = Math.round((Date.now() - d.getTime()) / 60000);
    if (diff < 60)  return `${diff}m ago`;
    if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  const freqIcon: Record<string, string> = {
    daily: 'M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    weekly: 'M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3',
    monthly: 'M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18',
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
      <div className="dash-topbar" style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '22px 32px',
      }}>
        <div className="fade-up" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '5px' }}>
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.8rem', fontWeight: 500, color: 'var(--text)', lineHeight: 1.2 }}>
              {greeting},{' '}
              <em style={{ color: 'var(--gold-mid)', fontStyle: 'italic' }}>{user.name.split(' ')[0]}</em>
            </h1>
          </div>
          {unverified > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('contacts')}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 16px', borderRadius: '10px',
                background: 'var(--amber-bg)', border: '1px solid var(--amber-border)',
                cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              }}
            >
              <svg width="15" height="15" fill="none" stroke="var(--amber)" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/>
              </svg>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--amber)' }}>
                {unverified} contact{unverified > 1 ? 's' : ''} need WhatsApp verification
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="dash-content" style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="grid-stats">
          <StatCard label="Total Contacts" value={active.length} sub={`${unverified} unverified`} accent="var(--navy)" iconPath="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z" />
          <StatCard label="WhatsApp Active" value={waActive} sub={`${active.length - waActive} SMS only`} accent="var(--green)" iconPath="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          <StatCard label="Messages Sent" value={logs.length} sub={`${delivered} delivered`} accent="var(--blue)" iconPath="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          <StatCard label="Live Schedules" value={activeScheds} sub={`${events.length - activeScheds} paused`} accent="var(--gold)" iconPath="M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </div>

        <div className="grid-main">
          <div className="card fade-up d1">
            <div className="card-header">
              <div>
                <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1rem', fontWeight: 500, color: 'var(--text)' }}>Recent Activity</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '1px' }}>Latest messages sent</p>
              </div>
              <button
                onClick={() => onNavigate('messaging')}
                style={{ fontSize: '12.5px', color: 'var(--navy)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}
              >
                View all →
              </button>
            </div>
            <div>
              {recentLogs.length === 0 ? (
                <p style={{ padding: '28px 20px', color: 'var(--text-3)', fontSize: '13.5px', textAlign: 'center' }}>No messages sent yet.</p>
              ) : recentLogs.map((log, i) => (
                <div key={log.id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 20px',
                  borderBottom: i < recentLogs.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                    background: 'var(--navy-light)',
                    border: '1px solid #BFCFE9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: 700, color: 'var(--navy)',
                    fontFamily: 'Inter, sans-serif',
                  }}>
                    {log.contactName.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13.5px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.contactName}
                    </p>
                    <p style={{ fontSize: '12px', color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.content.slice(0, 60)}…
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span className={`badge ${log.status === 'delivered' ? 'badge-green' : log.status === 'failed' ? 'badge-red' : 'badge-amber'}`} style={{ fontSize: '11px' }}>
                      {log.status}
                    </span>
                    <p style={{ fontSize: '11px', color: 'var(--text-4)', marginTop: '3px' }}>{fmtRelative(log.sentAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card fade-up d2">
            <div className="card-header">
              <div>
                <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1rem', fontWeight: 500, color: 'var(--text)' }}>Upcoming</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '1px' }}>Scheduled triggers</p>
              </div>
              <button
                onClick={() => onNavigate('schedule')}
                style={{ fontSize: '12.5px', color: 'var(--navy)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}
              >
                Manage →
              </button>
            </div>
            <div>
              {upcomingEvents.length === 0 ? (
                <p style={{ padding: '28px 16px', color: 'var(--text-3)', fontSize: '13px', textAlign: 'center' }}>No active schedules.</p>
              ) : upcomingEvents.map((ev, i) => (
                <div key={ev.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '11px 16px',
                  borderBottom: i < upcomingEvents.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '7px', flexShrink: 0,
                    background: ev.frequency === 'daily' ? 'var(--blue-bg)' : ev.frequency === 'weekly' ? 'var(--gold-light)' : 'var(--purple-bg)',
                    color: ev.frequency === 'daily' ? 'var(--blue)' : ev.frequency === 'weekly' ? 'var(--gold-dark)' : 'var(--purple)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={freqIcon[ev.frequency] ?? freqIcon.weekly} />
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.name}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>{ev.nextTrigger ? fmtDate(ev.nextTrigger) : '—'}</p>
                  </div>
                  <span className="badge badge-green" style={{ fontSize: '10.5px' }}>Live</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid-bottom">
          <div className="card fade-up d3" style={{ padding: '20px 22px' }}>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1rem', fontWeight: 500, color: 'var(--text)', marginBottom: '18px' }}>
              Contact Channel Breakdown
            </h2>
            {[
              { label: 'WhatsApp Active', count: waActive, color: 'var(--green)' },
              { label: 'SMS Only', count: active.filter((c) => c.whatsappStatus === 'inactive').length, color: 'var(--blue)' },
              { label: 'Unverified', count: unverified, color: 'var(--amber)' },
            ].map((row) => (
              <div key={row.label} style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-2)', fontFamily: 'Inter, sans-serif' }}>{row.label}</span>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: row.color, fontFamily: 'Inter, sans-serif' }}>{row.count}</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{
                    width: active.length > 0 ? `${(row.count / active.length) * 100}%` : '0%',
                    background: row.color,
                  }} />
                </div>
              </div>
            ))}
          </div>

          <div className="card fade-up d4" style={{ padding: '20px 22px' }}>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1rem', fontWeight: 500, color: 'var(--text)', marginBottom: '14px' }}>
              Quick Actions
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { label: 'Add new contact', sub: 'Register a soul from the harvest field', path: 'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M8.5 11a4 4 0 100-8 4 4 0 000 8zM20 8v6M23 11h-6', tab: 'contacts' as const, accent: 'var(--navy)' },
                { label: 'Send broadcast', sub: 'Reach multiple contacts at once', path: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z', tab: 'messaging' as const, accent: 'var(--blue)' },
                { label: 'Create schedule', sub: 'Automate a church event reminder', path: 'M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18', tab: 'schedule' as const, accent: 'var(--gold)' },
              ].map((a) => (
                <button
                  key={a.tab}
                  onClick={() => onNavigate(a.tab)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '11px 14px', borderRadius: '8px', width: '100%',
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'background 0.14s, border-color 0.14s',
                    fontFamily: 'Inter, sans-serif',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--navy-xlight)'; e.currentTarget.style.borderColor = '#BFCFE9'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                >
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '7px', flexShrink: 0,
                    background: `${a.accent}18`, color: a.accent,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d={a.path} />
                    </svg>
                  </div>
                  <div>
                    <p style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)' }}>{a.label}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>{a.sub}</p>
                  </div>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-4)', fontSize: '15px' }}>→</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
