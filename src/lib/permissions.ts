import type { AuthUser, UserRole } from '../types';

export const ROLE_LABEL: Record<UserRole, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  authorized: 'Authorized user',
};

export const ROLE_DESCRIPTION: Record<UserRole, string> = {
  superadmin: 'Full control, including adding or removing Admins and other Super Admins.',
  admin: 'Manages contacts, schedules and reports. Can add or remove Authorized users.',
  authorized: 'Adds contacts, sends messages and records attendance. Cannot manage users.',
};

const RANK: Record<UserRole, number> = { superadmin: 3, admin: 2, authorized: 1 };

export function canManageUsers(user: AuthUser): boolean {
  return user.role === 'superadmin' || user.role === 'admin';
}

/** Roles the given user is allowed to grant to someone else. */
export function assignableRoles(user: AuthUser): UserRole[] {
  if (user.role === 'superadmin') return ['authorized', 'admin', 'superadmin'];
  if (user.role === 'admin') return ['authorized'];
  return [];
}

/** Whether `actor` may revoke or change the role of `target`. */
export function canManageUser(actor: AuthUser, target: AuthUser): boolean {
  if (actor.id === target.id) return false;
  if (actor.role === 'superadmin') return true;
  if (actor.role === 'admin') return RANK[target.role] < RANK.admin;
  return false;
}

export function canDeleteRecords(user: AuthUser): boolean {
  return user.role === 'superadmin' || user.role === 'admin';
}

export function canManageSchedules(user: AuthUser): boolean {
  return user.role === 'superadmin' || user.role === 'admin';
}
