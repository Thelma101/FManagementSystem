import type { AuthUser, Contact, MessageLog, MessageStatus, ScheduledEvent } from '../types';
import { store } from './store';
import { sendViaGateway } from './smsGateway';
import { toGsm } from './sms';

// Re-export phone helpers (libphonenumber — all country codes + length rules)
export { validateE164, toE164, parsePhone } from './phone';
export type { CountryCode, PhoneParseResult } from './phone';

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Auth API ──────────────────────────────────────────────────────────────────

export type LoginResult =
  | { ok: true; pendingMfa: true; userId: string; hint: string }
  | { ok: false; error: string };

export type MfaResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string };

/** Step 1 — email + password. Returns a pending MFA challenge on success. */
export async function login(email: string, password: string): Promise<LoginResult> {
  await delay(400 + Math.random() * 200);
  const user = store.getUsers().find(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.passwordHash === password
  );
  if (!user) return { ok: false, error: 'Invalid email or password. Please try again.' };
  return {
    ok: true,
    pendingMfa: true,
    userId: user.id,
    hint: user.mfaCode ?? '', // demo only — real backends never return the code
  };
}

/** Step 2 — verify MFA code and open a session. */
export async function verifyMfa(userId: string, code: string): Promise<MfaResult> {
  await delay(350 + Math.random() * 200);
  const user = store.getUsers().find((u) => u.id === userId);
  if (!user) return { ok: false, error: 'Session expired. Please sign in again.' };
  if (code.trim() !== user.mfaCode) return { ok: false, error: 'Incorrect verification code.' };
  store.setCurrentUser(user);
  return { ok: true, user };
}

/** Demo self-registration: lowest role, signed in straight away. */
export async function register(name: string, email: string, password: string): Promise<MfaResult> {
  await delay(400);
  const users = store.getUsers();
  const addr = email.trim().toLowerCase();
  if (users.some((u) => u.email.toLowerCase() === addr)) {
    return { ok: false, error: 'An account with this email already exists. Sign in instead.' };
  }
  const user: AuthUser = {
    id: 'u' + Date.now(),
    name: name.trim(),
    email: addr,
    role: 'authorized',
    passwordHash: password,
    mfaCode: String(Math.floor(100000 + Math.random() * 900000)),
    createdBy: 'Self-registered',
    createdAt: new Date().toISOString(),
  };
  store.saveUsers([...users, user]);
  store.setCurrentUser(user);
  return { ok: true, user };
}

export function logout(): void {
  store.setCurrentUser(null);
}

// ── Messaging API ─────────────────────────────────────────────────────────────

export interface SendResult {
  success: boolean;
  channels: string[];
  /** 'sent' = accepted by the real SMS gateway; 'delivered' = simulated; 'failed' otherwise. */
  status: MessageStatus;
  error?: string;
  /** The gateway account can't send anything right now (no credit, bad key…); stop bulk sends. */
  fatal?: boolean;
}

/** Simulated send (demo mode) with a ~6% random failure rate. */
async function simulateSend(channel: 'sms' | 'whatsapp'): Promise<SendResult> {
  await delay(700 + Math.random() * 700);
  if (Math.random() < 0.06) {
    return { success: false, channels: [], status: 'failed', error: 'Delivery gateway timeout' };
  }
  return { success: true, channels: [channel === 'whatsapp' ? 'WhatsApp' : 'SMS'], status: 'delivered' };
}

/** SMS and WhatsApp both go through eBulkSMS when the server has it configured; otherwise they are simulated. */
export async function sendMessage(phone: string, channel: 'sms' | 'whatsapp', content: string): Promise<SendResult> {
  const r = await sendViaGateway(phone, channel === 'sms' ? toGsm(content) : content, channel);
  if (!r.configured) return simulateSend(channel);
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
