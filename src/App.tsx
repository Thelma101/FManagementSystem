import { useState, useEffect } from 'react';
import type { AuthUser, Contact, MessageLog, ScheduledEvent, Tab } from './types';
import { store } from './lib/store';
import { logout } from './lib/mockApi';
import { ToastProvider } from './components/ui/Toast';
import LoginScreen from './components/auth/LoginScreen';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './components/dashboard/Dashboard';
import ContactsModule from './components/contacts/ContactsModule';
import MessagingModule from './components/messaging/MessagingModule';
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

const NAV_ITEMS: { id: Tab; label: string; icon: string; adminOnly?: boolean }[] = [
  { id: 'dashboard', label: 'Home',     icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z' },
  { id: 'contacts',  label: 'Contacts', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75' },
  { id: 'messaging', label: 'Messages', icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z' },
  { id: 'schedule',  label: 'Schedule', icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
  { id: 'users',     label: 'Users',    icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', adminOnly: true },
];

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

  const visibleNav = NAV_ITEMS.filter((n) => !n.adminOnly || user.role === 'admin');

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
      <div className={isMobile ? `sidebar-drawer${sidebarOpen ? ' open' : ''}` : undefined}>
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
        {tab === 'schedule' && (
          <ScheduleModule user={user} events={events} onEventsChange={setEvents} />
        )}
        {tab === 'users' && user.role === 'admin' && (
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

          {visibleNav.slice(0, 4).map((item) => (
            <button
              key={item.id}
              className={`mobile-nav-btn${tab === item.id ? ' active' : ''}`}
              onClick={() => handleTabChange(item.id)}
              aria-label={item.label}
              aria-current={tab === item.id ? 'page' : undefined}
            >
              <NavIcon d={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(store.getCurrentUser());
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
