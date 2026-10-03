import type {
  AttendanceRecord,
  AuthUser,
  Contact,
  ContactField,
  ContactGroup,
  MessageLog,
  ScheduledEvent,
  WelcomeTemplate,
} from '../types';

// ── Built-in welcome message templates ───────────────────────────────────────
const BUILT_IN_WELCOME: WelcomeTemplate[] = [
  {
    id: 'w1',
    label: 'Harvest field welcome',
    builtIn: true,
    text: 'Dear {name}, it was a joy meeting you at {location}. God loves you and so do we! Come and worship with us at Living Faith Church.',
  },
  {
    id: 'w2',
    label: 'New convert welcome',
    builtIn: true,
    text: "Dear {name}, welcome to God's family! Join us on Sunday at 7AM and at our WSF cell fellowship near you. God bless you! - Living Faith Church",
  },
  {
    id: 'w3',
    label: 'Service invitation',
    builtIn: true,
    text: 'Dear {name}, thanks for your time at {location}. You are invited to our {service} at Living Faith Church. Come expecting a touch from God!',
  },
];

/** Built-in templates can't be edited in the portal, so always serve their current wording. */
function withCurrentBuiltIns(list: WelcomeTemplate[]): WelcomeTemplate[] {
  return list.map((t) => {
    const builtIn = t.builtIn ? BUILT_IN_WELCOME.find((s) => s.id === t.id) : undefined;
    return builtIn ? { ...t, label: builtIn.label, text: builtIn.text } : t;
  });
}

// ── Storage ───────────────────────────────────────────────────────────────────
// An in-memory copy of the Supabase tables, loaded at sign-in. Every save is
// handed to the cloud sync, which writes the changed rows.
export type CollectionKey =
  | 'fp_users' | 'fp_contacts' | 'fp_logs' | 'fp_events' | 'fp_attendance' | 'fp_welcome_templates' | 'fp_fields' | 'fp_groups';
type CloudSave = (key: CollectionKey, prev: unknown[], next: unknown[]) => void;

let cloud: { data: Record<CollectionKey, unknown[]>; onSave: CloudSave } | null = null;
let currentUser: AuthUser | null = null;

function load<T>(key: CollectionKey): T[] {
  return (cloud?.data[key] ?? []) as T[];
}

function save<T>(key: CollectionKey, data: T[]): void {
  if (!cloud) return;
  const prev = cloud.data[key];
  cloud.data[key] = data;
  cloud.onSave(key, prev, data);
}

export const store = {
  getUsers: (): AuthUser[] => load<AuthUser>('fp_users'),
  saveUsers: (u: AuthUser[]) => save('fp_users', u),

  getAttendance: (): AttendanceRecord[] => load<AttendanceRecord>('fp_attendance'),
  saveAttendance: (a: AttendanceRecord[]) => save('fp_attendance', a),

  getWelcomeTemplates: (): WelcomeTemplate[] => withCurrentBuiltIns(load<WelcomeTemplate>('fp_welcome_templates')),
  saveWelcomeTemplates: (t: WelcomeTemplate[]) => save('fp_welcome_templates', t),

  getFields: (): ContactField[] => load<ContactField>('fp_fields'),
  saveFields: (f: ContactField[]) => save('fp_fields', f),

  getContacts: (): Contact[] => load<Contact>('fp_contacts'),
  saveContacts: (c: Contact[]) => save('fp_contacts', c),

  getLogs: (): MessageLog[] => load<MessageLog>('fp_logs'),
  saveLogs: (l: MessageLog[]) => save('fp_logs', l),

  getEvents: (): ScheduledEvent[] => load<ScheduledEvent>('fp_events'),
  saveEvents: (e: ScheduledEvent[]) => save('fp_events', e),

  getGroups: (): ContactGroup[] => load<ContactGroup>('fp_groups'),
  saveGroups: (g: ContactGroup[]) => save('fp_groups', g),

  /** Replace a collection with fresh data from Supabase, without writing it back. */
  replaceFromCloud: (key: CollectionKey, data: unknown[]) => {
    if (cloud) cloud.data[key] = data;
  },

  getCurrentUser: (): AuthUser | null => currentUser,
  setCurrentUser: (u: AuthUser | null) => { currentUser = u; },

  /** Fill the store with data loaded from Supabase. */
  attachCloud: (data: Record<CollectionKey, unknown[]>, onSave: CloudSave) => {
    cloud = { data, onSave };
  },
  detachCloud: () => {
    cloud = null;
    currentUser = null;
  },
};
