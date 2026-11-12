import type { AuthUser, Contact, Zone } from '../types';
import { canSeeFullPhones } from './permissions';

/** Contacts this user may see in lists (zone + follow-up rules). */
export function visibleContacts(user: AuthUser, contacts: Contact[]): Contact[] {
  return contacts.filter((c) => {
    if (user.role !== 'superadmin') {
      const myZone = user.zoneId;
      if (myZone) {
        const mine = !c.zoneId || c.zoneId === myZone;
        const referralIn =
          c.referralZoneId === myZone && (c.referralStatus === 'pending' || c.referralStatus === 'accepted');
        if (!mine && !referralIn) return false;
      }
    }
    if (canSeeFullPhones(user)) return true;
    return c.assignedTo === user.id || c.addedBy === user.id;
  });
}

/** Active contacts available on the attendance register for this user. */
export function attendanceContacts(user: AuthUser, contacts: Contact[]): Contact[] {
  return visibleContacts(user, contacts).filter((c) => !c.archived);
}

export function zoneLabel(zones: Zone[], id?: string): string {
  if (!id) return '—';
  const z = zones.find((x) => x.id === id);
  return z ? `${z.name} (${z.code})` : id;
}

export const DEFAULT_ZONE_ID = 'zone-lekki-osapa';
