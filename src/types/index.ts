export type UserRole = 'superadmin' | 'admin' | 'authorized';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  passwordHash: string;
  mfaCode: string;
  createdBy?: string;
  createdAt?: string;
}

export type WhatsAppStatus = 'unknown' | 'checking' | 'active' | 'inactive' | 'error';

export type ServiceType = 'sunday' | 'midweek' | 'wsf' | 'spiritual-emphasis' | 'special-event';

export type AttendanceCommitment = 'yes' | 'no' | 'undecided';

export interface Contact {
  id: string;
  name: string;
  phone: string; // E.164 format
  whatsappStatus: WhatsAppStatus;
  whatsappCheckedAt?: string;
  /** 'provider' = checked by a real third-party API, 'demo' = simulated result */
  whatsappCheckSource?: 'provider' | 'demo';
  addedBy: string;
  addedAt: string;
  tags: string[];
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
  inCellFellowship?: boolean;
  cellName?: string;

  // Service commitment
  attendanceCommitment?: AttendanceCommitment;
  committedServices?: ServiceType[];
  committedSpecialEvent?: string;

  welcomeSentAt?: string;
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
  time: string; // HH:mm
  date?: string; // ISO date for once/annually
  leadTimeHours: number[];
  messageTemplate: string;
  channels: ('sms' | 'whatsapp')[];
  active: boolean;
  nextTrigger?: string;
  createdBy: string;
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

export type Tab = 'dashboard' | 'contacts' | 'messaging' | 'attendance' | 'reports' | 'schedule' | 'users';
