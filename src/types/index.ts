export type UserRole = 'superadmin' | 'admin' | 'authorized';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** Temporary password must be replaced at next sign-in. */
  mustChangePassword?: boolean;
  createdBy?: string;
  createdAt?: string;
}

export type ServiceType = 'sunday' | 'midweek' | 'wsf' | 'spiritual-emphasis' | 'special-event';

export type AttendanceCommitment = 'yes' | 'no' | 'undecided';

export interface Contact {
  id: string;
  name: string;
  phone: string; // E.164 format
  addedBy: string;
  addedAt: string;
  tags: string[];
  /** ContactGroup ids */
  groupIds?: string[];
  notes: string;
  lastContacted?: string;
  archived?: boolean;

  // Harvest field
  metLocation?: string;
  metDate?: string; // YYYY-MM-DD

  // Spiritual status
  bornAgain?: boolean;
  salvationDate?: string; // YYYY-MM-DD
  salvationPlace?: string;
  baptised?: boolean;
  baptismDate?: string; // YYYY-MM-DD
  baptismPlace?: string;
  inCellFellowship?: boolean;
  cellName?: string;

  // Service commitment
  attendanceCommitment?: AttendanceCommitment;
  committedServices?: ServiceType[];
  committedSpecialEvent?: string;

  /** Values for admin-defined fields, keyed by ContactField id. */
  custom?: Record<string, CustomValue>;

  welcomeSentAt?: string;
}

export interface ContactGroup {
  id: string;
  name: string;
  description: string;
  createdBy?: string;
  createdAt?: string;
}

export type FieldType = 'yesno' | 'text' | 'date' | 'choice';

/** An extra contact field added by an admin, e.g. "Bible school" (yes/no + date + place). */
export interface ContactField {
  id: string;
  label: string;
  type: FieldType;
  /** Yes/no fields: also ask when (shown once answered Yes). */
  askDate?: boolean;
  /** Yes/no fields: also ask where (shown once answered Yes). */
  askPlace?: boolean;
  /** Choice fields: the allowed answers. */
  options?: string[];
  position: number;
  /** Hidden from forms and imports; existing answers are kept. */
  archived?: boolean;
  createdBy?: string;
}

export interface CustomValue {
  /** boolean for yes/no fields, string (date as YYYY-MM-DD) for the others. */
  value?: boolean | string;
  date?: string;
  place?: string;
}

export type MessageChannel = 'sms' | 'whatsapp' | 'both';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'failed';

export interface MessageLog {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  channel: MessageChannel;
  content: string;
  status: MessageStatus;
  /** Why it failed, or the network's delivery report. */
  statusDetail?: string;
  /** When the delivery report came in. */
  statusAt?: string;
  sentAt: string;
  sentBy: string;
  kind?: 'welcome' | 'broadcast' | 'direct' | 'scheduled';
}

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly';
export type DayOfWeek = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';

export interface ScheduledEvent {
  id: string;
  name: string;
  description: string;
  frequency: ScheduleFrequency;
  dayOfWeek?: DayOfWeek; // for weekly
  time: string; // HH:mm, Nigerian time
  date?: string; // YYYY-MM-DD: first weekly occurrence, or the monthly date
  leadTimeHours: number[];
  messageTemplate: string;
  channels: ('sms' | 'whatsapp')[];
  active: boolean;
  /** Set by the server only. */
  nextTrigger?: string;
  createdBy: string;
  /** Who gets it: everyone (default), one group, or everyone with a tag. */
  audienceType?: 'all' | 'group' | 'tag';
  audienceValue?: string;
}

export interface ActivityEntry {
  id: number;
  at: string;
  actorName: string;
  action: string;
  entity: string;
  entityId?: string;
  label?: string;
  detail?: string;
  changes?: Record<string, [unknown, unknown]>;
}

export interface AttendanceRecord {
  id: string;
  contactId: string;
  /** Sunday that starts the service week, YYYY-MM-DD */
  weekStart: string;
  serviceType: ServiceType;
  specialEvent?: string;
  recordedBy: string;
  recordedAt: string;
}

export interface WelcomeTemplate {
  id: string;
  label: string;
  text: string;
  builtIn?: boolean;
}

export interface AppState {
  currentUser: AuthUser | null;
  contacts: Contact[];
  messageLogs: MessageLog[];
  scheduledEvents: ScheduledEvent[];
  activeTab: Tab;
}

export type Tab = 'dashboard' | 'contacts' | 'messaging' | 'attendance' | 'reports' | 'schedule' | 'users' | 'activity';
