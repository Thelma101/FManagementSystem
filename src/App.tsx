import { useState, useEffect } from 'react';
import type { AuthUser, Contact, MessageLog, ScheduledEvent, Tab } from './types';
import { store } from './lib/store';
import { canManageUsers } from './lib/permissions';
import { isConfigured, openedFromRecoveryLink } from './lib/supabase';
import { hasPendingWrites, onPasswordRecovery, onSyncError, refreshIfStale, restoreSession, signOut } from './lib/cloud';
import { ToastProvider, useToast } from './components/ui/Toast';
import LoginScreen from './components/auth/LoginScreen';
import SetPasswordScreen from './components/auth/SetPasswordScreen';
import Sidebar, { NAV_ITEMS } from './components/layout/Sidebar';
import Dashboard from './components/dashboard/Dashboard';
import ContactsModule from './components/contacts/ContactsModule';
import MessagingModule from './components/messaging/MessagingModule';
import AttendanceModule from './components/attendance/AttendanceModule';
import ReportsModule from './components/reports/ReportsModule';
import ScheduleModule from './components/schedule/ScheduleModule';
import UsersModule from './components/users/UsersModule';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

function NavIcon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const MOBILE_TABS: Tab[] = ['dashboard', 'contacts', 'attendance', 'messaging'];

function PortalShell({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [tab, setTab]         = useState<Tab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [logs, setLogs]         = useState<MessageLog[]>([]);
  const [events, setEvents]     = useState<ScheduledEvent[]>([]);
  const isMobile = useIsMobile();
  const { toast } = useToast();

  function reloadFromStore() {
    setContacts(store.getContacts());
    setLogs(store.getLogs());
    setEvents(store.getEvents());
  }

  useEffect(reloadFromStore, []);

  useEffect(() => {
    const offError = onSyncError((msg) => toast('error', 'Change not saved', msg));

    // Pick up changes made by other team members when returning to the tab.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      refreshIfStale().then((changed) => { if (changed) reloadFromStore(); }).catch(() => {});
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (hasPendingWrites()) e.preventDefault();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      offError();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('beforeunload', beforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close drawer when tab changes on mobile
  function handleTabChange(t: Tab) {
    setTab(t);
    setSidebarOpen(false);
  }

  const counts = {
    contacts: contacts.length,
    messages: logs.length,
    schedules: events.filter((e) => e.active).length,
  };

  const mobileNav = NAV_ITEMS.filter((n) => MOBILE_TABS.includes(n.id));

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)', position: 'relative' }}>

      {/* ── Mobile drawer backdrop ─────────────────────────────────────── */}
      {isMobile && sidebarOpen && (
        <div
          className="mobile-overlay"
          style={{ display: 'block' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────── */}
      <div className={isMobile ? `sidebar-drawer${sidebarOpen ? ' open' : ''}` : undefined} style={isMobile ? undefined : { display: 'flex' }}>
        <Sidebar
          active={tab}
          user={user}
          onTabChange={handleTabChange}
          onLogout={onLogout}
          counts={counts}
          onMenuToggle={isMobile ? () => setSidebarOpen(false) : undefined}
        />
      </div>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <main className="app-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {tab === 'dashboard' && (
          <Dashboard user={user} contacts={contacts} logs={logs} events={events} onNavigate={handleTabChange} />
        )}
        {tab === 'contacts' && (
          <ContactsModule user={user} contacts={contacts} onContactsChange={setContacts} onLogAdded={(log) => setLogs((p) => [log, ...p])} />
        )}
        {tab === 'messaging' && (
          <MessagingModule user={user} contacts={contacts} logs={logs} onLogsChange={setLogs} onContactsChange={setContacts} />
        )}
        {tab === 'attendance' && (
          <AttendanceModule user={user} contacts={contacts} />
        )}
        {tab === 'reports' && (
          <ReportsModule contacts={contacts} />
        )}
        {tab === 'schedule' && (
          <ScheduleModule user={user} events={events} onEventsChange={setEvents} />
        )}
        {tab === 'users' && canManageUsers(user) && (
          <UsersModule currentUser={user} />
        )}
      </main>

      {/* ── Mobile bottom nav ─────────────────────────────────────────── */}
      {isMobile && (
        <nav className="mobile-nav" role="navigation" aria-label="Main navigation">
          {/* Hamburger / menu toggle */}
          <button
            className={`mobile-nav-btn${sidebarOpen ? ' active' : ''}`}
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
            Menu
          </button>

          {mobileNav.map((item) => (
            <button
              key={item.id}
              className={`mobile-nav-btn${tab === item.id ? ' active' : ''}`}
              onClick={() => handleTabChange(item.id)}
              aria-label={item.label}
              aria-current={tab === item.id ? 'page' : undefined}
            >
              <NavIcon d={item.icon} />
              {item.short}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

function LoadingScreen({ error, onRetry }: { error?: string; onRetry: () => void }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '14px', background: 'var(--bg)' }}>
      {error ? (
        <>
          <p style={{ color: 'var(--red)', fontSize: '14px', maxWidth: '360px', textAlign: 'center' }}>{error}</p>
          <button className="btn btn-primary" onClick={onRetry}>Try again</button>
        </>
      ) : (
        <>
          <svg className="spin" width="26" height="26" fill="none" stroke="var(--navy)" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          <p style={{ color: 'var(--text-3)', fontSize: '13.5px' }}>Loading portal…</p>
        </>
      )}
    </div>
  );
}

function NotConfiguredScreen() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg)' }}>
      <div className="card" style={{ maxWidth: '440px', padding: '24px 26px' }}>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.4rem', fontWeight: 500, color: 'var(--text)', marginBottom: '8px' }}>
          Portal not set up yet
        </h1>
        <p style={{ fontSize: '13.5px', color: 'var(--text-2)', lineHeight: 1.6 }}>
          The database settings are missing. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to
          the site's environment variables (see <code>.env.example</code>), then redeploy or restart.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  if (!isConfigured) return <NotConfiguredScreen />;
  return <Portal />;
}

function Portal() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState('');
  const [recovery, setRecovery] = useState(openedFromRecoveryLink);

  function boot() {
    setBootError('');
    setBooting(true);
    restoreSession()
      .then((u) => { store.setCurrentUser(u); setUser(u); })
      .catch((err: unknown) => setBootError(err instanceof Error ? err.message : 'Could not load the portal.'))
      .finally(() => setBooting(false));
  }

  useEffect(() => {
    boot();
    return onPasswordRecovery(() => setRecovery(true));
  }, []);

  function handleLogin(u: AuthUser) {
    store.setCurrentUser(u);
    setUser(u);
  }

  async function handleLogout() {
    await signOut();
    setRecovery(false);
    setUser(null);
  }

  let screen: React.ReactNode;
  if (booting || bootError) screen = <LoadingScreen error={bootError} onRetry={boot} />;
  else if (!user) screen = <LoginScreen onLogin={handleLogin} />;
  else if (recovery || user.mustChangePassword) {
    screen = (
      <SetPasswordScreen
        name={user.name}
        reason={recovery ? 'recovery' : 'first-login'}
        onCancel={handleLogout}
        onDone={() => {
          const updated = { ...user, mustChangePassword: false };
          store.setCurrentUser(updated);
          setRecovery(false);
          setUser(updated);
        }}
      />
    );
  } else screen = <PortalShell user={user} onLogout={handleLogout} />;

  return <ToastProvider>{screen}</ToastProvider>;
}
