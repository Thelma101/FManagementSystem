/**
 * Background job, called every few minutes by the database's scheduler (pg_cron,
 * set up with `npm run cron:setup`):
 *   1. saves new SMS delivery reports and updates message history,
 *   2. queues the scheduled reminders that are due,
 *   3. sends queued messages for up to ~40 seconds.
 *
 * Authorised by the X-Cron-Key header, derived from SUPABASE_SECRET_KEY so no
 * extra setting is needed.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ScheduledEvent } from '../src/types/index.js';
import { audienceMembers, audienceOf, fillReminder, newMessageId, nextSend } from '../src/lib/schedule.js';
import { deliver, fetchDeliveryReports, prepareMessage, providerFrom, type Channel, type Provider } from './ebulksms.js';
import { recordActivity } from './activity.js';
import type { SmsEnv } from './smsSend.js';

const SYSTEM = 'Automatic reminders';
/** A reminder found later than this (e.g. after an outage) is skipped rather than sent late. */
const MAX_LATE_MS = 3 * 60 * 60 * 1000;
/** Queued messages held back by an account problem (e.g. no credit) are dropped after this. */
const GIVE_UP_MS = 6 * 60 * 60 * 1000;
/** A message claimed this long ago without a result was interrupted mid-send. */
const STUCK_MS = 10 * 60 * 1000;
const BUDGET_MS = 40_000;
const CLAIM = 40;
const BATCH = 100;
const CONCURRENCY = 4;

export function cronKey(secret: string): string {
  return createHash('sha256').update(`${secret}:cron`).digest('hex');
}

function sameKey(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface EventRow {
  id: string;
  name: string;
  frequency: ScheduledEvent['frequency'];
  day_of_week: ScheduledEvent['dayOfWeek'] | null;
  time: string;
  date: string | null;
  lead_time_hours: number[];
  message_template: string;
  channels: string[];
  next_trigger: string | null;
  audience_type: ScheduledEvent['audienceType'] | null;
  audience_value: string | null;
}

interface OutboxRow {
  id: string;
  event_id: string | null;
  event_name: string | null;
  contact_id: string | null;
  contact_name: string | null;
  contact_phone: string;
  channel: string;
  content: string;
  created_at: string;
}

interface ContactRow {
  id: string;
  name: string;
  phone: string;
  tags: string[] | null;
  group_ids: string[] | null;
  archived: boolean | null;
}

export interface TickSummary {
  reports: number;
  matched: number;
  queued: number;
  sent: number;
  failed: number;
  notes: string[];
}

export interface TickResponse {
  status: number;
  body: TickSummary | { error: string };
}

export interface TickDeps {
  fetch?: typeof fetch;
  now?: () => number;
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

function fmtLead(h: number): string {
  if (h >= 168 && h % 168 === 0) return h === 168 ? '1 week' : `${h / 168} weeks`;
  if (h >= 24 && h % 24 === 0) return h === 24 ? '1 day' : `${h / 24} days`;
  return h === 1 ? '1 hour' : `${h} hours`;
}

function fmtWat(ms: number): string {
  return new Date(ms).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' });
}

function toEvent(r: EventRow) {
  return {
    frequency: r.frequency,
    dayOfWeek: r.day_of_week ?? undefined,
    time: r.time,
    date: r.date ?? undefined,
    leadTimeHours: r.lead_time_hours ?? [],
    audienceType: r.audience_type ?? undefined,
    audienceValue: r.audience_value ?? undefined,
  };
}

function logRow(r: OutboxRow, status: string, detail: string | null, sentAt: string) {
  return {
    id: r.id,
    contact_id: r.contact_id,
    contact_name: r.contact_name,
    contact_phone: r.contact_phone,
    channel: r.channel,
    content: r.content,
    status,
    status_detail: detail,
    sent_at: sentAt,
    sent_by: r.event_name ? `Reminder: ${r.event_name}` : SYSTEM,
    kind: 'scheduled',
  };
}

async function collectReports(db: SupabaseClient, provider: Provider, fetchImpl: typeof fetch, s: TickSummary) {
  for (let round = 0; round < 3; round++) {
    const reports = await fetchDeliveryReports(provider, fetchImpl);
    if (!reports.length) break;
    const unique = [...new Map(reports.map((r) => [r.id, r])).values()];
    for (const rows of chunk(unique, 500)) {
      const { error } = await db.from('delivery_reports').upsert(rows);
      if (error) throw new Error(`Could not save delivery reports: ${error.message}`);
    }
    s.reports += unique.length;
    if (reports.length < 1000) break;
  }
  const { data, error } = await db.rpc('apply_delivery_reports');
  if (error) throw new Error(`Could not apply delivery reports: ${error.message}`);
  s.matched = Number(data) || 0;
}

async function loadContacts(db: SupabaseClient): Promise<ContactRow[]> {
  const out: ContactRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('contacts')
      .select('id, name, phone, tags, group_ids, archived')
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(`Could not load contacts: ${error.message}`);
    out.push(...(data as ContactRow[]));
    if (data.length < 1000) return out;
  }
}

async function runSchedules(db: SupabaseClient, nowMs: number, s: TickSummary) {
  const nowIso = new Date(nowMs).toISOString();
  const [unset, due] = await Promise.all([
    db.from('events').select('*').eq('active', true).is('next_trigger', null),
    db.from('events').select('*').eq('active', true).lte('next_trigger', nowIso),
  ]);
  if (unset.error || due.error) throw new Error(`Could not load schedules: ${(unset.error ?? due.error)!.message}`);

  // New or edited schedules: work out when they first send.
  for (const row of unset.data as EventRow[]) {
    const next = nextSend(toEvent(row), nowMs);
    if (next) await db.from('events').update({ next_trigger: new Date(next.at).toISOString() }).eq('id', row.id).is('next_trigger', null);
  }

  let contacts: ContactRow[] | null = null;
  for (const row of due.data as EventRow[]) {
    const ev = toEvent(row);
    const dueMs = Date.parse(row.next_trigger!);
    const next = nextSend(ev, nowMs);
    // Moving next_trigger on only if nobody else already has makes each reminder go out once.
    const { data: claimed } = await db
      .from('events')
      .update({ next_trigger: next ? new Date(next.at).toISOString() : null })
      .eq('id', row.id)
      .eq('next_trigger', row.next_trigger!)
      .select('id');
    if (!claimed?.length) continue;

    const which = nextSend(ev, dueMs - 1);
    const lead = which && which.at === dueMs ? ` (${fmtLead(which.leadHours)} before)` : '';
    if (nowMs - dueMs > MAX_LATE_MS) {
      await recordActivity(db, {
        actorName: SYSTEM, action: 'skipped', entity: 'events', entityId: row.id, label: row.name,
        detail: `The reminder${lead} due ${fmtWat(dueMs)} was found too late to send, so it was skipped.`,
      });
      continue;
    }

    contacts ??= await loadContacts(db);
    const audience = audienceOf(ev);
    const seen = new Set<string>();
    const members = audienceMembers(
      contacts.map((c) => ({ ...c, tags: c.tags ?? [], groupIds: c.group_ids ?? [], archived: !!c.archived })),
      audience,
    ).filter((c) => /^\+[1-9]\d{7,14}$/.test(c.phone) && !seen.has(c.phone) && seen.add(c.phone));
    const channels = row.channels.filter((c): c is Channel => c === 'sms' || c === 'whatsapp');

    const rows = members.flatMap((c, i) =>
      channels.map((channel, j) => ({
        id: newMessageId('ms') + (i * channels.length + j).toString(36),
        event_id: row.id,
        event_name: row.name,
        contact_id: c.id,
        contact_name: c.name,
        contact_phone: c.phone,
        channel,
        content: fillReminder(row.message_template, c.name),
      })),
    );
    for (const part of chunk(rows, 500)) {
      const { error } = await db.from('message_outbox').insert(part);
      if (error) throw new Error(`Could not queue "${row.name}": ${error.message}`);
    }
    s.queued += rows.length;
    let who = 'all active contacts';
    if (audience.type === 'tag') who = `tag "${audience.value}"`;
    if (audience.type === 'group') {
      const { data: group } = await db.from('contact_groups').select('name').eq('id', audience.value).maybeSingle();
      who = group ? `group "${group.name}"` : 'a deleted group';
    }
    await recordActivity(db, {
      actorName: SYSTEM,
      action: rows.length ? 'queued' : 'skipped',
      entity: 'events',
      entityId: row.id,
      label: row.name,
      detail: rows.length
        ? `Reminder${lead}: ${rows.length} message${rows.length === 1 ? '' : 's'} to ${members.length} contact${members.length === 1 ? '' : 's'} in ${who}.`
        : `Reminder${lead}: nobody to send to in ${who}.`,
    });
  }
}

/** Messages left half-sent by an interrupted run. They may have gone out, so they are not resent. */
async function recoverStuck(db: SupabaseClient, nowMs: number) {
  const { data } = await db
    .from('message_outbox')
    .select('*')
    .eq('status', 'sending')
    .lt('claimed_at', new Date(nowMs - STUCK_MS).toISOString());
  const rows = (data ?? []) as OutboxRow[];
  if (!rows.length) return;
  const sentAt = new Date(nowMs).toISOString();
  const { error } = await db
    .from('message_logs')
    .upsert(rows.map((r) => logRow(r, 'pending', 'Sending was interrupted, so this may or may not have arrived.', sentAt)), { ignoreDuplicates: true });
  if (!error) await db.from('message_outbox').delete().in('id', rows.map((r) => r.id));
}

async function drainOutbox(db: SupabaseClient, provider: Provider, fetchImpl: typeof fetch, now: () => number, started: number, s: TickSummary) {
  while (now() - started < BUDGET_MS) {
    const { data, error } = await db.rpc('claim_outbox', { max_rows: CLAIM });
    if (error) throw new Error(`Could not read the send queue: ${error.message}`);
    const claimed = (data ?? []) as OutboxRow[];
    if (!claimed.length) return;

    const groups = new Map<string, OutboxRow[]>();
    for (const r of claimed) {
      const key = `${r.channel}\u0000${r.content}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const batches = [...groups.values()].flatMap((g) => chunk(g, BATCH));

    const logs: ReturnType<typeof logRow>[] = [];
    const requeue: string[] = [];
    const reached: string[] = [];
    let stop: string | null = null;

    await pool(batches, CONCURRENCY, async (batch) => {
      if (stop || now() - started > BUDGET_MS + 10_000) {
        requeue.push(...batch.map((r) => r.id));
        return;
      }
      const sentAt = new Date(now()).toISOString();
      const channel: Channel = batch[0].channel === 'whatsapp' ? 'whatsapp' : 'sms';
      const prepared = prepareMessage(channel, batch[0].content);
      if (!prepared.ok) {
        batch.forEach((r) => logs.push(logRow(r, 'failed', prepared.error, sentAt)));
        return;
      }
      const result = await deliver(provider, channel, prepared.text, batch.map((r) => ({ phone: r.contact_phone, msgid: r.id })), fetchImpl);
      if (result.ok) {
        batch.forEach((r) => {
          logs.push(logRow(r, 'sent', null, sentAt));
          if (r.contact_id) reached.push(r.contact_id);
        });
      } else if (result.accountProblem) {
        stop = result.error;
        for (const r of batch) {
          if (now() - Date.parse(r.created_at) > GIVE_UP_MS) logs.push(logRow(r, 'failed', `Not sent: ${result.error}`, sentAt));
          else requeue.push(r.id);
        }
      } else if (result.uncertain) {
        batch.forEach((r) => logs.push(logRow(r, 'pending', `${result.error} It may still arrive.`, sentAt)));
      } else {
        batch.forEach((r) => logs.push(logRow(r, 'failed', result.error, sentAt)));
      }
    });

    for (const part of chunk(logs, 500)) {
      const { error: logError } = await db.from('message_logs').upsert(part, { ignoreDuplicates: true });
      // Left as "sending", these are picked up by recoverStuck instead of being sent twice.
      if (logError) throw new Error(`Could not save message history: ${logError.message}`);
      await db.from('message_outbox').delete().in('id', part.map((l) => l.id));
    }
    if (requeue.length) await db.from('message_outbox').update({ status: 'queued', claimed_at: null }).in('id', requeue);
    if (reached.length) {
      await db.from('contacts').update({ last_contacted: new Date(now()).toISOString() }).in('id', [...new Set(reached)]);
    }
    s.sent += logs.filter((l) => l.status === 'sent').length;
    s.failed += logs.filter((l) => l.status === 'failed').length;
    const stopped = stop as string | null;
    if (stopped) {
      s.notes.push(`Sending paused: ${stopped}`);
      return;
    }
  }
}

export async function handleTick(
  method: string | undefined,
  key: string | undefined,
  env: SmsEnv,
  deps: TickDeps = {},
): Promise<TickResponse> {
  if (method !== 'POST') return { status: 405, body: { error: 'Method not allowed' } };
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return { status: 501, body: { error: 'Not configured' } };
  if (!key || !sameKey(key, cronKey(secret))) return { status: 401, body: { error: 'Unauthorised' } };

  const now = deps.now ?? Date.now;
  const fetchImpl = deps.fetch ?? fetch;
  const started = now();
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const provider = providerFrom(env);
  const s: TickSummary = { reports: 0, matched: 0, queued: 0, sent: 0, failed: 0, notes: [] };

  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      s.notes.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (provider) await step('Delivery reports', () => collectReports(db, provider, fetchImpl, s));
  await step('Schedules', () => runSchedules(db, now(), s));
  await step('Recovery', () => recoverStuck(db, now()));
  if (provider) await step('Sending', () => drainOutbox(db, provider, fetchImpl, now, started, s));
  else s.notes.push('Sending is not set up on the server.');

  return { status: 200, body: s };
}
