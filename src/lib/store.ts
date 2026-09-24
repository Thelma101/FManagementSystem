import type { AuthUser, Contact, MessageLog, ScheduledEvent } from '../types';

// ── Authorized users (hardcoded, extendable via UI) ──────────────────────────
const SEED_USERS: AuthUser[] = [
  {
    id: 'u1',
    name: 'Portal Admin',
    email: 'admin@fellowship.church',
    role: 'admin',
    passwordHash: 'admin123',
    mfaCode: '847291',
  },
  {
    id: 'u2',
    name: 'Co-Admin',
    email: 'coadmin@fellowship.church',
    role: 'admin',
    passwordHash: 'coadmin123',
    mfaCode: '193847',
  },
];

// ── Seed contacts ─────────────────────────────────────────────────────────────
const SEED_CONTACTS: Contact[] = [
  {
    id: 'c1',
    name: 'Adaeze Okonkwo',
    phone: '+2348031234567',
    whatsappStatus: 'active',
    addedBy: 'u1',
    addedAt: '2026-09-01T09:00:00Z',
    tags: ['harvest-field', 'follow-up'],
    notes: 'Met at Shiloh outreach. Very receptive.',
    lastContacted: '2026-09-15T11:00:00Z',
  },
  {
    id: 'c2',
    name: 'Emmanuel Taiwo',
    phone: '+2349055678901',
    whatsappStatus: 'inactive',
    addedBy: 'u1',
    addedAt: '2026-09-03T14:30:00Z',
    tags: ['soul-winning'],
    notes: 'Contact from neighbourhood evangelism.',
    lastContacted: '2026-09-10T09:00:00Z',
  },
  {
    id: 'c3',
    name: 'Blessing Nwosu',
    phone: '+2348167890123',
    whatsappStatus: 'active',
    addedBy: 'u2',
    addedAt: '2026-09-08T10:15:00Z',
    tags: ['youth', 'follow-up'],
    notes: 'Youth program attendee. Wants to know more.',
  },
  {
    id: 'c4',
    name: 'Victor Adeleke',
    phone: '+2347034567890',
    whatsappStatus: 'unknown',
    addedBy: 'u1',
    addedAt: '2026-09-12T16:00:00Z',
    tags: ['harvest-field'],
    notes: 'New contact — WhatsApp status not checked yet.',
  },
];

// ── Seed message logs ─────────────────────────────────────────────────────────
const SEED_LOGS: MessageLog[] = [
  {
    id: 'ml1',
    contactId: 'c1',
    contactName: 'Adaeze Okonkwo',
    contactPhone: '+2348031234567',
    channel: 'both',
    content: 'Dear Adaeze, you are warmly invited to our Sunday Harvest Field meeting this Sunday at 9am. God bless you!',
    status: 'delivered',
    sentAt: '2026-09-15T11:00:00Z',
    sentBy: 'Portal Admin',
  },
  {
    id: 'ml2',
    contactId: 'c2',
    contactName: 'Emmanuel Taiwo',
    contactPhone: '+2349055678901',
    channel: 'sms',
    content: 'Dear Emmanuel, join us this Sunday for our Harvest Field service. We look forward to seeing you!',
    status: 'delivered',
    sentAt: '2026-09-10T09:00:00Z',
    sentBy: 'Portal Admin',
  },
];

function daysFromNow(days: number, hours = 10, minutes = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

// ── Seed scheduled events ─────────────────────────────────────────────────────
const SEED_EVENTS: ScheduledEvent[] = [
  {
    id: 'e1',
    name: 'Sunday Worship Service',
    description: 'Weekly Sunday morning worship and harvest field meeting.',
    frequency: 'weekly',
    dayOfWeek: 'Saturday',
    time: '10:00',
    leadTimeHours: [24, 2],
    messageTemplate:
      'Dear {name}, you are warmly invited to our Sunday Harvest Field meeting tomorrow at 9:00 AM. Come and be blessed! — Living Faith Church',
    channels: ['sms', 'whatsapp'],
    active: true,
    nextTrigger: daysFromNow(2, 10),
    createdBy: 'Portal Admin',
  },
  {
    id: 'e2',
    name: 'Midweek Service (Wednesday)',
    description: 'Wednesday evening Bible study and prayer meeting.',
    frequency: 'weekly',
    dayOfWeek: 'Tuesday',
    time: '17:00',
    leadTimeHours: [24, 2],
    messageTemplate:
      'Dear {name}, our midweek service holds this Wednesday at 5:30 PM. Come hungry for the Word! — Living Faith Church',
    channels: ['sms', 'whatsapp'],
    active: true,
    nextTrigger: daysFromNow(5, 17),
    createdBy: 'Portal Admin',
  },
  {
    id: 'e3',
    name: 'Monthly Prayer Meeting',
    description: 'Monthly all-night prayer and fasting session.',
    frequency: 'monthly',
    time: '08:00',
    date: daysFromNow(7).slice(0, 10),
    leadTimeHours: [48, 24],
    messageTemplate:
      'Dear {name}, our monthly prayer meeting holds on the 1st. Come prepared to seek the face of God! — Living Faith Church',
    channels: ['sms', 'whatsapp'],
    active: true,
    nextTrigger: daysFromNow(5, 8),
    createdBy: 'Portal Admin',
  },
  {
    id: 'e4',
    name: 'Daily Devotional Reminder',
    description: 'Daily morning devotional nudge for new converts.',
    frequency: 'daily',
    time: '06:00',
    leadTimeHours: [1],
    messageTemplate:
      "Good morning {name}! Start your day with God's Word. Our devotional guide is available — be blessed! — Living Faith Church",
    channels: ['whatsapp'],
    active: false,
    nextTrigger: daysFromNow(1, 6),
    createdBy: 'Co-Admin',
  },
];

// ── Storage helpers ───────────────────────────────────────────────────────────
function load<T>(key: string, seed: T[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T[];
  } catch {}
  localStorage.setItem(key, JSON.stringify(seed));
  return seed;
}

function save<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

export const store = {
  getUsers: (): AuthUser[] => load<AuthUser>('fp_users', SEED_USERS),
  saveUsers: (u: AuthUser[]) => save('fp_users', u),

  getContacts: (): Contact[] => load<Contact>('fp_contacts', SEED_CONTACTS),
  saveContacts: (c: Contact[]) => save('fp_contacts', c),

  getLogs: (): MessageLog[] => load<MessageLog>('fp_logs', SEED_LOGS),
  saveLogs: (l: MessageLog[]) => save('fp_logs', l),

  getEvents: (): ScheduledEvent[] => load<ScheduledEvent>('fp_events', SEED_EVENTS),
  saveEvents: (e: ScheduledEvent[]) => save('fp_events', e),

  getCurrentUser: (): AuthUser | null => {
    try {
      const raw = sessionStorage.getItem('fp_session');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  setCurrentUser: (u: AuthUser | null) => {
    if (u) sessionStorage.setItem('fp_session', JSON.stringify(u));
    else sessionStorage.removeItem('fp_session');
  },
};
