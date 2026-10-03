import type { AuthUser, Contact, MessageLog, MessageStatus, ScheduledEvent } from '../types';
import { store } from './store';
import { sendViaGateway } from './smsGateway';
import { toGsm } from './sms';

// Re-export phone helpers (libphonenumber — all country codes + length rules)
export { validateE164, toE164, parsePhone } from './phone';
export type { CountryCode, PhoneParseResult } from './phone';

// ── Messaging API ─────────────────────────────────────────────────────────────

export interface SendResult {
  success: boolean;
  channels: string[];
  /** 'sent' = accepted by eBulkSMS; 'failed' otherwise. Older logs may also say 'delivered'. */
  status: MessageStatus;
  error?: string;
  /** The gateway account can't send anything right now (no credit, bad key…); stop bulk sends. */
  fatal?: boolean;
}

const NOT_CONFIGURED_ERROR = 'Sending is not set up yet: the eBulkSMS settings are missing on the server.';

/** SMS and WhatsApp both go through eBulkSMS on the server. */
export async function sendMessage(phone: string, channel: 'sms' | 'whatsapp', content: string): Promise<SendResult> {
  const r = await sendViaGateway(phone, channel === 'sms' ? toGsm(content) : content, channel);
  if (!r.configured) return { success: false, channels: [], status: 'failed', error: NOT_CONFIGURED_ERROR, fatal: true };
  if (!r.ok) return { success: false, channels: [], status: 'failed', error: r.error, fatal: r.fatal };
  return { success: true, channels: [channel === 'whatsapp' ? 'WhatsApp' : 'SMS'], status: 'sent' };
}

/** Persist a new message log and update contact lastContacted. */
export function recordMessage(
  log: MessageLog,
  contacts: Contact[]
): { logs: MessageLog[]; contacts: Contact[] } {
  const logs = [log, ...store.getLogs()];
  store.saveLogs(logs);
  const updated = contacts.map((c) =>
    c.id === log.contactId ? { ...c, lastContacted: log.sentAt } : c
  );
  store.saveContacts(updated);
  return { logs, contacts: updated };
}

// ── Contacts API ──────────────────────────────────────────────────────────────

export function saveContact(contact: Contact, contacts: Contact[]): Contact[] {
  const idx = contacts.findIndex((c) => c.id === contact.id);
  const next =
    idx >= 0
      ? contacts.map((c) => (c.id === contact.id ? contact : c))
      : [contact, ...contacts];
  store.saveContacts(next);
  return next;
}

export function removeContact(id: string, contacts: Contact[]): Contact[] {
  const next = contacts.filter((c) => c.id !== id);
  store.saveContacts(next);
  return next;
}

// ── Schedule API ──────────────────────────────────────────────────────────────

export function saveEvent(event: ScheduledEvent, events: ScheduledEvent[]): ScheduledEvent[] {
  const idx = events.findIndex((e) => e.id === event.id);
  const next =
    idx >= 0
      ? events.map((e) => (e.id === event.id ? event : e))
      : [event, ...events];
  store.saveEvents(next);
  return next;
}

export function removeEvent(id: string, events: ScheduledEvent[]): ScheduledEvent[] {
  const next = events.filter((e) => e.id !== id);
  store.saveEvents(next);
  return next;
}

export function toggleEventActive(id: string, events: ScheduledEvent[]): ScheduledEvent[] {
  const next = events.map((e) => (e.id === id ? { ...e, active: !e.active } : e));
  store.saveEvents(next);
  return next;
}

// ── Users API ─────────────────────────────────────────────────────────────────

export function saveUser(user: AuthUser, users: AuthUser[]): AuthUser[] {
  const next = [...users, user];
  store.saveUsers(next);
  return next;
}

export function revokeUser(id: string, users: AuthUser[]): AuthUser[] {
  const next = users.filter((u) => u.id !== id);
  store.saveUsers(next);
  return next;
}
