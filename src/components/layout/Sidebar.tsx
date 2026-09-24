import type { Tab, AuthUser } from '../../types';

interface Props {
  active: Tab;
  user: AuthUser;
  onTabChange: (t: Tab) => void;
  onLogout: () => void;
  counts: { contacts: number; messages: number; schedules: number };
  onMenuToggle?: () => void;
}

interface NavItem { id: Tab; label: string; icon: React.ReactNode; badge?: number; adminOnly?: boolean; }

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function LfcCrest() {
  return (
    <svg width="32" height="32" viewBox="0 0 72 72" fill="none" aria-hidden="true">
      <path d="M36 4L8 16v20c0 16 12 28 28 32C52 64 64 52 64 36V16L36 4z" fill="rgba(255,255,255,0.08)" stroke="#C8A84B" strokeWidth="1.5"/>
      <ellipse cx="36" cy="38" rx="13" ry="13" fill="none" stroke="#C8A84B" strokeWidth="1.2"/>
      <ellipse cx="36" cy="38" rx="6" ry="13" fill="none" stroke="#C8A84B" strokeWidth="0.8"/>
      <line x1="23" y1="38" x2="49" y2="38" stroke="#C8A84B" strokeWidth="0.8"/>
      <line x1="24.5" y1="32" x2="47.5" y2="32" stroke="#C8A84B" strokeWidth="0.6"/>
      <line x1="24.5" y1="44" x2="47.5" y2="44" stroke="#C8A84B" strokeWidth="0.6"/>
      <path d="M36 8C34 12 30 14 32 18c1-3 3-4 4-2 1-2 3-1 4 2 2-4-2-6-4-10z" fill="#C8A84B"/>
      <path d="M36 12c-1 2-3 3-2 5 1-1 1.5-1.5 2-0.5.5-1 1-0.5 2 0.5 1-2-1-3-2-5z" fill="#FFE08A"/>
    </svg>
  );
}

export default function Sidebar({ active, user, onTabChange, onLogout, counts, onMenuToggle }: Props) {
  const nav: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard',  icon: <Icon d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /> },
    { id: 'contacts',  label: 'Contacts',   badge: counts.contacts,  icon: <Icon d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /> },
    { id: 'messaging', label: 'Messaging',  badge: counts.messages,  icon: <Icon d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /> },
    { id: 'schedule',  label: 'Schedule',   badge: counts.schedules, icon: <Icon d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /> },
    { id: 'users',     label: 'Users',      adminOnly: true,         icon: <Icon d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /> },
  ];

  const initials = user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <aside style={{
      width: '232px',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--navy)',
    }}>
      {/* Brand header */}
      <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid var(--sidebar-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <LfcCrest />
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: 'Playfair Display, serif', fontSize: '0.875rem', color: '#fff', lineHeight: 1.25, fontWeight: 500 }}>
              Living Faith
            </p>
            <p style={{ fontSize: '9px', color: 'rgba(200,168,75,0.8)', textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700, marginTop: '1px' }}>
              Communications
            </p>
          </div>
          {onMenuToggle && (
            <button
              onClick={onMenuToggle}
              aria-label="Close menu"
              style={{
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '6px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
                padding: '5px 8px', display: 'flex', alignItems: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Section label */}
      <div style={{ padding: '18px 20px 6px' }}>
        <p style={{ fontSize: '9.5px', fontWeight: 700, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
          Navigation
        </p>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '4px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {nav.map((item) => {
          if (item.adminOnly && user.role !== 'admin') return null;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`nav-item ${isActive ? 'nav-active' : 'nav-inactive'}`}
            >
              <span style={{ color: isActive ? '#C8A84B' : 'rgba(255,255,255,0.42)', flexShrink: 0, display: 'flex' }}>
                {item.icon}
              </span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span style={{
                  fontSize: '11px', fontWeight: 700,
                  padding: '1px 7px', borderRadius: '9999px',
                  background: isActive ? 'rgba(200,168,75,0.3)' : 'rgba(255,255,255,0.1)',
                  color: isActive ? '#F7EDD0' : 'rgba(255,255,255,0.5)',
                  minWidth: '22px', textAlign: 'center', fontFamily: 'Inter, sans-serif',
                }}>
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Divider */}
      <div style={{ height: '1px', background: 'var(--sidebar-border)', margin: '0 14px' }} />

      {/* User footer */}
      <div style={{ padding: '14px 14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <div style={{
            width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #C8A84B, #8C6F1E)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '12px', fontWeight: 700, color: '#fff', fontFamily: 'Inter, sans-serif',
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.name}
            </p>
            <p style={{ fontSize: '11px', color: 'rgba(200,168,75,0.75)' }}>
              {user.role === 'admin' ? 'Administrator' : 'Authorized user'}
            </p>
          </div>
        </div>

        <button
          onClick={onLogout}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            padding: '7px 12px', borderRadius: '7px',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.48)', fontSize: '12.5px', fontWeight: 500,
            cursor: 'pointer', fontFamily: 'Inter, sans-serif', transition: 'background 0.14s, color 0.14s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.48)'; }}
        >
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  );
}
