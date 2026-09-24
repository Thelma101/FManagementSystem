export type UserRole = 'admin' | 'authorized';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  passwordHash: string;
  mfaCode: string;
}

export type WhatsAppStatus = 'unknown' | 'checking' | 'active' | 'inactive' | 'error';

export interface Contact {
  id: string;
  name: string;
  phone: string; // E.164 format
  whatsappStatus: WhatsAppStatus;
  addedBy: string;
  addedAt: string;
  tags: string[];
  notes: string;
  lastContacted?: string;
  archived?: boolean;
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

export interface AppState {
  currentUser: AuthUser | null;
  contacts: Contact[];
  messageLogs: MessageLog[];
  scheduledEvents: ScheduledEvent[];
  activeTab: Tab;
}

export type Tab = 'dashboard' | 'contacts' | 'messaging' | 'schedule' | 'users';
