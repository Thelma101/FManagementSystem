import { useState, useEffect } from 'react';
import type { AuthUser, Contact, MessageLog, ScheduledEvent, Tab } from './types';
import { store } from './lib/store';
import { logout } from './lib/mockApi';
import { canManageUsers } from './lib/permissions';
import { ToastProvider } from './components/ui/Toast';
import LoginScreen from './components/auth/LoginScreen';
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

  useEffect(() => {
    setContacts(store.getContacts());
    setLogs(store.getLogs());
    setEvents(store.getEvents());
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

export default function App() {
  // Re-read the account on load so role changes / revoked access take effect.
  const [user, setUser] = useState<AuthUser | null>(() => {
    const session = store.getCurrentUser();
    if (!session) return null;
    const fresh = store.getUsers().find((u) => u.id === session.id) ?? null;
    store.setCurrentUser(fresh);
    return fresh;
  });
  return (
    <ToastProvider>
      {user ? (
        <PortalShell user={user} onLogout={() => { logout(); setUser(null); }} />
      ) : (
        <LoginScreen onLogin={(u) => setUser(u)} />
      )}
    </ToastProvider>
  );
}
