import type { AuthUser, Contact, MessageLog } from '../types';
import { canSeeFullPhones } from './permissions';

export const ERASED_NAME = 'Record erased';
export const ERASED_MESSAGE = '[Removed at the person\'s request]';

export function erasedPhone(contactId: string): string {
  return `erased:${contactId}`;
}

export function isErasedContact(contact: Pick<Contact, 'name' | 'phone'>): boolean {
  return contact.phone.startsWith('erased:') || contact.name === ERASED_NAME;
}

/** Last four digits only, so a copy of the screen is not a working phone book. */
export function maskPhone(phone: string): string {
  if (!phone || phone.startsWith('erased:')) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return '••••';
  const last = digits.slice(-4);
  if (phone.trim().startsWith('+')) {
    return `+${'•'.repeat(Math.max(3, digits.length - 4))}${last}`;
  }
  return `${'•'.repeat(Math.max(3, digits.length - 4))}${last}`;
}

/** Full number only for Admins, or for the staff member who added / follows them up. */
export function canSeeContactPhone(user: AuthUser, contact: Pick<Contact, 'addedBy' | 'assignedTo'>): boolean {
  return canSeeFullPhones(user) || contact.assignedTo === user.id || contact.addedBy === user.id;
}

export function displayPhone(user: AuthUser, contact: Pick<Contact, 'name' | 'phone' | 'addedBy' | 'assignedTo'>): string {
  if (isErasedContact(contact)) return 'Erased';
  return canSeeContactPhone(user, contact) ? contact.phone : maskPhone(contact.phone);
}

export function canMessageContact(user: AuthUser, contact: Contact): boolean {
  if (contact.archived || isErasedContact(contact)) return false;
  return canSeeFullPhones(user) || contact.assignedTo === user.id || contact.addedBy === user.id;
}

export function isOwnMessage(user: AuthUser, log: MessageLog): boolean {
  if (log.sentByEmail && log.sentByEmail.toLowerCase() === user.email.toLowerCase()) return true;
  return log.sentBy === user.name;
}

export function visibleLogs(user: AuthUser, logs: MessageLog[]): MessageLog[] {
  if (canSeeFullPhones(user)) return logs;
  return logs.filter((log) => isOwnMessage(user, log));
}

export function erasedContactPatch(contact: Contact): Contact {
  return {
    ...contact,
    name: ERASED_NAME,
    phone: erasedPhone(contact.id),
    notes: '',
    tags: [],
    groupIds: [],
    metLocation: '',
    metDate: undefined,
    homeLocation: '',
    closestChurch: '',
    assignedTo: undefined,
    bornAgain: undefined,
    salvationDate: undefined,
    salvationPlace: undefined,
    baptised: undefined,
    baptismDate: undefined,
    baptismPlace: undefined,
    inCellFellowship: undefined,
    cellName: undefined,
    attendanceCommitment: undefined,
    committedServices: undefined,
    committedSpecialEvent: undefined,
    custom: {},
    archived: true,
    lastContacted: undefined,
    welcomeSentAt: undefined,
  };
}

export function scrubMessageLog(log: MessageLog): MessageLog {
  return {
    ...log,
    contactName: ERASED_NAME,
    contactPhone: erasedPhone(log.contactId),
    content: ERASED_MESSAGE,
    statusDetail: undefined,
  };
}
