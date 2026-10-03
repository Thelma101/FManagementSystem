/**
 * Server-side portal user management (create, change role, revoke).
 *
 * Runs in Node only (Vite dev/preview middleware and the serverless function in
 * /api). Uses the Supabase secret key, which must never reach the browser.
 * Every request is authorised against the caller's own role.
 *
 *   SUPABASE_URL        = https://<project>.supabase.co
 *   SUPABASE_SECRET_KEY = sb_secret_…
 */
import { createClient } from '@supabase/supabase-js';
import type { AuthUser, UserRole } from '../src/types/index.js';
import { assignableRoles, canManageUser, canManageUsers } from '../src/lib/permissions.js';
import { passwordError } from '../src/lib/passwordRules.js';
import { recordActivity } from './activity.js';

const ROLE_LABEL: Record<UserRole, string> = { superadmin: 'Super Admin', admin: 'Admin', authorized: 'Authorised user' };

export interface AdminEnv {
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
}

export interface AdminResponse {
  status: number;
  body: { user?: AuthUser; ok?: boolean; error?: string };
}

interface ProfileRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  must_change_password: boolean;
  created_by: string | null;
  created_at: string;
}

const ROLES: UserRole[] = ['superadmin', 'admin', 'authorized'];

function toUser(p: ProfileRow): AuthUser {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    role: p.role,
    mustChangePassword: p.must_change_password,
    createdBy: p.created_by ?? undefined,
    createdAt: p.created_at,
  };
}

const fail = (status: number, error: string): AdminResponse => ({ status, body: { error } });

export async function handleAdminUsers(
  method: string | undefined,
  authorization: string | undefined,
  body: Record<string, unknown>,
  env: AdminEnv,
): Promise<AdminResponse> {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !env.SUPABASE_SECRET_KEY) return fail(501, 'User management is not configured on the server');

  const token = authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'Not signed in');

  const admin = createClient(url, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return fail(401, 'Your session has expired. Please sign in again.');

  const { data: actorRow } = await admin.from('profiles').select('*').eq('id', auth.user.id).single<ProfileRow>();
  if (!actorRow) return fail(403, 'You do not have portal access');
  const actor = toUser(actorRow);
  if (!canManageUsers(actor)) return fail(403, 'Only Admins and Super Admins can manage users');

  if (method === 'POST') {
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const role = body.role as UserRole;
    if (!name || !email) return fail(400, 'Name and email are required');
    const tooShort = passwordError(password);
    if (tooShort) return fail(400, `Temporary password: ${tooShort.toLowerCase()}`);
    if (!ROLES.includes(role) || !assignableRoles(actor).includes(role)) return fail(403, 'You cannot grant that role');

    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (error || !created.user) {
      const exists = /already|registered|exists/i.test(error?.message ?? '');
      return fail(exists ? 409 : 400, exists ? 'A user with this email already exists.' : error?.message ?? 'Could not create user');
    }

    const { data: row, error: profileError } = await admin
      .from('profiles')
      .insert({ id: created.user.id, name, email, role, must_change_password: true, created_by: actor.name })
      .select('*')
      .single<ProfileRow>();
    if (profileError || !row) {
      await admin.auth.admin.deleteUser(created.user.id);
      return fail(500, profileError?.message ?? 'Could not create profile');
    }
    await recordActivity(admin, {
      actorId: actor.id, actorName: actor.name, action: 'created', entity: 'users', entityId: row.id,
      label: name, detail: `${email} · ${ROLE_LABEL[role]}`,
    });
    return { status: 201, body: { user: toUser(row) } };
  }

  if (method === 'PATCH' || method === 'DELETE') {
    const id = String(body.id ?? '');
    const { data: targetRow } = await admin.from('profiles').select('*').eq('id', id).single<ProfileRow>();
    if (!targetRow) return fail(404, 'User not found');
    const target = toUser(targetRow);
    if (!canManageUser(actor, target)) return fail(403, 'You cannot change this account');

    if (method === 'DELETE') {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return fail(500, error.message);
      await recordActivity(admin, {
        actorId: actor.id, actorName: actor.name, action: 'removed', entity: 'users', entityId: id,
        label: target.name, detail: `${target.email} · ${ROLE_LABEL[target.role]} · portal access removed`,
      });
      return { status: 200, body: { ok: true } };
    }

    const role = body.role as UserRole;
    if (!ROLES.includes(role) || !assignableRoles(actor).includes(role)) return fail(403, 'You cannot grant that role');
    const { data: row, error } = await admin.from('profiles').update({ role }).eq('id', id).select('*').single<ProfileRow>();
    if (error || !row) return fail(500, error?.message ?? 'Could not update role');
    if (role !== target.role) {
      await recordActivity(admin, {
        actorId: actor.id, actorName: actor.name, action: 'updated', entity: 'users', entityId: id,
        label: target.name, changes: { role: [ROLE_LABEL[target.role], ROLE_LABEL[role]] },
      });
    }
    return { status: 200, body: { user: toUser(row) } };
  }

  return fail(405, 'Method not allowed');
}

const REGISTER_LIMIT = 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
// Per server instance only, so this slows down abuse rather than preventing it.
const recentRegistrations = new Map<string, number[]>();

/**
 * Self-registration: anyone can create an account, which always gets the lowest
 * role. Super Admins promote people afterwards from the Users page. Accounts are
 * created already confirmed, so no confirmation email is needed.
 */
export async function handleRegister(
  method: string | undefined,
  body: Record<string, unknown>,
  env: AdminEnv,
  clientIp = 'unknown',
): Promise<AdminResponse> {
  if (method !== 'POST') return fail(405, 'Method not allowed');
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !env.SUPABASE_SECRET_KEY) return fail(501, 'Registration is not configured on the server');

  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (name.length < 2 || name.length > 80) return fail(400, 'Enter your full name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return fail(400, 'Enter a valid email address');
  const pwError = passwordError(password);
  if (pwError) return fail(400, pwError);

  const now = Date.now();
  const recent = (recentRegistrations.get(clientIp) ?? []).filter((t) => now - t < REGISTER_WINDOW_MS);
  if (recent.length >= REGISTER_LIMIT) return fail(429, 'Too many accounts created from this network. Please try again later.');

  const admin = createClient(url, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error || !created.user) {
    const exists = /already|registered|exists/i.test(error?.message ?? '');
    return fail(exists ? 409 : 400, exists ? 'An account with this email already exists. Sign in instead, or use "Forgot password?".' : error?.message ?? 'Could not create account');
  }

  const { data: row, error: profileError } = await admin
    .from('profiles')
    .insert({ id: created.user.id, name, email, role: 'authorized', must_change_password: false, created_by: 'Self-registered' })
    .select('*')
    .single<ProfileRow>();
  if (profileError || !row) {
    await admin.auth.admin.deleteUser(created.user.id);
    return fail(500, profileError?.message ?? 'Could not create profile');
  }
  recentRegistrations.set(clientIp, [...recent, now]);
  await recordActivity(admin, {
    actorId: row.id, actorName: name, action: 'registered', entity: 'users', entityId: row.id,
    label: name, detail: `${email} · ${ROLE_LABEL.authorized}`,
  });
  return { status: 201, body: { user: toUser(row) } };
}
