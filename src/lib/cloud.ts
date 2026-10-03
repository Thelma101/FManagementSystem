// Supabase-backed persistence and auth.
//
// After sign-in every table is loaded into the in-memory store, so components keep
// using the synchronous store API. Each store save is diffed against the previous
// copy and the changed rows are written to Supabase in order.

import type { ActivityEntry, AuthUser, MessageLog, UserRole } from '../types';
import { store, type CollectionKey } from './store';
import { supabase } from './supabase';

interface TableSpec {
  table: string;
  /** camelCase field names; each maps to the snake_case column of the same name */
  columns: string[];
  /** Fields stored as Postgres dates/timestamps — empty strings are saved as null */
  dates?: string[];
  /** Loaded but never written from the browser (the server owns them) */
  readOnly?: string[];
  /** Saved instead of null for required columns */
  defaults?: Record<string, unknown>;
  order: string;
  ascending?: boolean;
}

const TABLES: Record<Exclude<CollectionKey, 'fp_users'>, TableSpec> = {
  fp_contacts: {
    table: 'contacts',
    columns: [
      'id', 'name', 'phone', 'addedBy', 'addedAt',
      'tags', 'notes', 'lastContacted', 'archived', 'metLocation', 'metDate', 'bornAgain', 'salvationDate',
      'salvationPlace', 'baptised', 'baptismDate', 'inCellFellowship', 'cellName', 'attendanceCommitment',
      'committedServices', 'committedSpecialEvent', 'welcomeSentAt', 'baptismPlace', 'custom', 'groupIds',
    ],
    dates: ['addedAt', 'lastContacted', 'metDate', 'salvationDate', 'baptismDate', 'welcomeSentAt'],
    defaults: { groupIds: [] },
    order: 'added_at',
  },
  fp_attendance: {
    table: 'attendance',
    columns: ['id', 'contactId', 'weekStart', 'serviceType', 'specialEvent', 'recordedBy', 'recordedAt'],
    dates: ['weekStart', 'recordedAt'],
    order: 'recorded_at',
  },
  fp_logs: {
    table: 'message_logs',
    columns: [
      'id', 'contactId', 'contactName', 'contactPhone', 'channel', 'content', 'status', 'statusDetail', 'statusAt',
      'sentAt', 'sentBy', 'kind',
    ],
    dates: ['sentAt', 'statusAt'],
    readOnly: ['statusAt'],
    order: 'sent_at',
  },
  fp_events: {
    table: 'events',
    columns: [
      'id', 'name', 'description', 'frequency', 'dayOfWeek', 'time', 'date', 'leadTimeHours', 'messageTemplate',
      'channels', 'active', 'nextTrigger', 'createdBy', 'audienceType', 'audienceValue',
    ],
    dates: ['nextTrigger'],
    readOnly: ['nextTrigger'],
    defaults: { audienceType: 'all' },
    order: 'id',
    ascending: true,
  },
  fp_groups: {
    table: 'contact_groups',
    columns: ['id', 'name', 'description', 'createdBy', 'createdAt'],
    dates: ['createdAt'],
    order: 'name',
    ascending: true,
  },
  fp_welcome_templates: {
    table: 'welcome_templates',
    columns: ['id', 'label', 'text', 'builtIn'],
    order: 'id',
    ascending: true,
  },
  fp_fields: {
    table: 'contact_fields',
    columns: ['id', 'label', 'type', 'askDate', 'askPlace', 'options', 'position', 'archived', 'createdBy'],
    order: 'position',
    ascending: true,
  },
};

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());

type Row = Record<string, unknown>;

function toRow(spec: TableSpec, item: Row): Row {
  const row: Row = {};
  for (const key of spec.columns) {
    if (spec.readOnly?.includes(key)) continue;
    let v = item[key];
    if (v === undefined || (v === '' && spec.dates?.includes(key))) v = spec.defaults?.[key] ?? null;
    row[snake(key)] = v;
  }
  return row;
}

function fromRow(spec: TableSpec, row: Row): Row {
  const item: Row = {};
  for (const key of spec.columns) {
    const v = row[snake(key)];
    if (v !== null && v !== undefined) item[key] = v;
  }
  return item;
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

function profileToUser(p: ProfileRow): AuthUser {
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

function client() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

// ── Loading ───────────────────────────────────────────────────────────────────

const PAGE = 1000;

async function fetchAll(table: string, order: string, ascending = false): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client()
      .from(table)
      .select('*')
      .order(order, { ascending })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Could not load ${table}: ${error.message}`);
    out.push(...(data as Row[]));
    if (!data || data.length < PAGE) return out;
  }
}

let lastLoadedAt = 0;

/** Loads every table into the store and switches the store to cloud mode. */
export async function loadAll(): Promise<void> {
  const keys = Object.keys(TABLES) as (keyof typeof TABLES)[];
  const [profiles, ...tables] = await Promise.all([
    fetchAll('profiles', 'created_at', true),
    ...keys.map((k) => fetchAll(TABLES[k].table, TABLES[k].order, TABLES[k].ascending)),
  ]);
  const data: Partial<Record<CollectionKey, unknown[]>> = {
    fp_users: (profiles as unknown as ProfileRow[]).map(profileToUser),
  };
  keys.forEach((k, i) => { data[k] = tables[i].map((r) => fromRow(TABLES[k], r)); });
  store.attachCloud(data as Record<CollectionKey, unknown[]>, queueSync);
  lastLoadedAt = Date.now();
}

// ── Saving ────────────────────────────────────────────────────────────────────

type ErrorListener = (message: string) => void;
const errorListeners = new Set<ErrorListener>();
export function onSyncError(fn: ErrorListener): () => void {
  errorListeners.add(fn);
  return () => errorListeners.delete(fn);
}

let chain: Promise<void> = Promise.resolve();
let pending = 0;
export const hasPendingWrites = () => pending > 0;

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function writeDiff(key: CollectionKey, prev: unknown[], next: unknown[]) {
  if (key === 'fp_users') return; // accounts are managed by the server
  const spec = TABLES[key];
  const before = new Map((prev as Row[]).map((r) => [r.id as string, JSON.stringify(r)]));
  const nextIds = new Set((next as Row[]).map((r) => r.id as string));

  const removed = [...before.keys()].filter((id) => !nextIds.has(id));
  const changed = (next as Row[]).filter((r) => before.get(r.id as string) !== JSON.stringify(r));

  for (const ids of chunk(removed, 200)) {
    const { error } = await client().from(spec.table).delete().in('id', ids);
    if (error) throw new Error(error.message);
  }
  for (const rows of chunk(changed, 500)) {
    const { error } = await client().from(spec.table).upsert(rows.map((r) => toRow(spec, r)));
    if (error) {
      throw new Error(
        error.code === '23505' && spec.table === 'contacts'
          ? 'That phone number is already saved for another contact.'
          : error.message,
      );
    }
  }
}

function queueSync(key: CollectionKey, prev: unknown[], next: unknown[]) {
  pending++;
  chain = chain
    .then(() => writeDiff(key, prev, next))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Could not save changes';
      errorListeners.forEach((fn) => fn(message));
    })
    .finally(() => { pending--; });
}

/** Reloads from Supabase (to pick up other users' changes) when nothing is waiting to save. */
export async function refreshIfStale(maxAgeMs = 60_000): Promise<boolean> {
  if (pending > 0 || Date.now() - lastLoadedAt < maxAgeMs) return false;
  await chain;
  await loadAll();
  return true;
}

/** Re-reads message history to pick up delivery reports and scheduled sends. */
export async function refreshLogs(): Promise<MessageLog[]> {
  await chain;
  const spec = TABLES.fp_logs;
  const logs = (await fetchAll(spec.table, spec.order, spec.ascending)).map((r) => fromRow(spec, r)) as unknown as MessageLog[];
  store.replaceFromCloud('fp_logs', logs);
  return logs;
}

export interface ActivityFilter {
  entity?: string;
  actor?: string;
  since?: string;
}

/** Latest activity-log entries (Admins only; others get an empty list from the database). */
export async function loadActivity(filter: ActivityFilter = {}, limit = 500): Promise<ActivityEntry[]> {
  let q = client().from('activity_log').select('*').order('at', { ascending: false }).limit(limit);
  if (filter.entity) q = q.eq('entity', filter.entity);
  if (filter.actor) q = q.eq('actor_name', filter.actor);
  if (filter.since) q = q.gte('at', filter.since);
  const { data, error } = await q;
  if (error) throw new Error(`Could not load the activity log: ${error.message}`);
  return (data as Row[]).map((r) => ({
    id: r.id as number,
    at: r.at as string,
    actorName: r.actor_name as string,
    action: r.action as string,
    entity: r.entity as string,
    entityId: (r.entity_id as string | null) ?? undefined,
    label: (r.label as string | null) ?? undefined,
    detail: (r.detail as string | null) ?? undefined,
    changes: (r.changes as ActivityEntry['changes'] | null) ?? undefined,
  }));
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function loadProfile(userId: string): Promise<AuthUser | null> {
  const { data } = await client().from('profiles').select('*').eq('id', userId).maybeSingle<ProfileRow>();
  return data ? profileToUser(data) : null;
}

export type SignInResult = { ok: true; user: AuthUser } | { ok: false; error: string };

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const { data, error } = await client().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error || !data.user) {
    return { ok: false, error: error?.message === 'Invalid login credentials' ? 'Invalid email or password. Please try again.' : error?.message ?? 'Sign-in failed' };
  }
  const user = await loadProfile(data.user.id);
  if (!user) {
    await client().auth.signOut();
    return { ok: false, error: 'This account does not have portal access. Ask a Super Admin to add you.' };
  }
  await loadAll();
  return { ok: true, user };
}

/** Creates an account with the lowest role, then signs straight in. */
export async function register(name: string, email: string, password: string): Promise<SignInResult> {
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: json.error ?? `Registration failed (${res.status})` };
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection.' };
  }
  return signIn(email, password);
}

/** Restores a saved session on page load. */
export async function restoreSession(): Promise<AuthUser | null> {
  const { data } = await client().auth.getSession();
  if (!data.session) return null;
  const user = await loadProfile(data.session.user.id);
  if (!user) {
    await client().auth.signOut();
    return null;
  }
  await loadAll();
  return user;
}

export async function signOut(): Promise<void> {
  await chain;
  await client().auth.signOut();
  store.detachCloud();
}

export async function changePassword(password: string): Promise<string | null> {
  const { error } = await client().auth.updateUser({ password });
  if (error) return error.message;
  await client().rpc('clear_password_flag');
  return null;
}

export async function requestPasswordReset(email: string): Promise<string | null> {
  const { error } = await client().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: window.location.origin,
  });
  return error ? error.message : null;
}

export function onPasswordRecovery(fn: () => void): () => void {
  const { data } = client().auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') fn();
  });
  return () => data.subscription.unsubscribe();
}

/** Bearer token for the server endpoints in /api. */
export async function accessToken(): Promise<string | null> {
  const { data } = await client().auth.getSession();
  return data.session?.access_token ?? null;
}

// ── User management (server endpoint, secret key stays on the server) ────────

export async function adminUsers(
  method: 'POST' | 'PATCH' | 'DELETE',
  body: Record<string, unknown>,
): Promise<{ user?: AuthUser; error?: string }> {
  const token = await accessToken();
  if (!token) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const res = await fetch('/api/admin/users', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { user?: AuthUser; error?: string };
    if (!res.ok) return { error: json.error ?? `Request failed (${res.status})` };
    return json;
  } catch {
    return { error: 'Could not reach the server. Check your connection.' };
  }
}
