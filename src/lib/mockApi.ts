import type { AuthUser, Contact, MessageLog, ScheduledEvent, WhatsAppStatus } from '../types';
import { store } from './store';

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
    hint: user.mfaCode, // demo only — real backends never return the code
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

export function logout(): void {
  store.setCurrentUser(null);
}

// WhatsApp registration checks live in ./whatsapp.ts (real provider via /api, demo fallback).
export { checkWhatsApp } from './whatsapp';

// ── Messaging API ─────────────────────────────────────────────────────────────

export interface SendResult {
  success: boolean;
  channels: string[];
  error?: string;
}

/**
 * Mock send. ~6% random failure rate for realism.
 * WhatsApp to inactive numbers always fails.
 */
export async function sendMessage(
  phone: string,
  channel: 'sms' | 'whatsapp' | 'both',
  _content: string,
  opts?: { whatsappStatus?: WhatsAppStatus }
): Promise<SendResult> {
  await delay(700 + Math.random() * 700);

  if ((channel === 'whatsapp' || channel === 'both') && opts?.whatsappStatus === 'inactive') {
    if (channel === 'whatsapp') {
      return { success: false, channels: [], error: 'WhatsApp not available on this number' };
    }
    // both → fall back to SMS only
    return { success: true, channels: ['SMS'] };
  }

  if (Math.random() < 0.06) {
    return { success: false, channels: [], error: 'Delivery gateway timeout' };
  }

  const channels =
    channel === 'both' ? ['SMS', 'WhatsApp'] : channel === 'whatsapp' ? ['WhatsApp'] : ['SMS'];
  return { success: true, channels };
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
