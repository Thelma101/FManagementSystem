-- Contact groups, an activity log, delivery reports and real scheduled sending. Safe to re-run.

-- ── Contact groups ────────────────────────────────────────────────────────────
create table if not exists public.contact_groups (
  id text primary key,
  name text not null,
  description text not null default '',
  created_by text,
  created_at timestamptz not null default now()
);
alter table public.contacts add column if not exists group_ids text[] not null default '{}';
create index if not exists contacts_group_ids_idx on public.contacts using gin (group_ids);

alter table public.contact_groups enable row level security;
drop policy if exists "members read groups" on public.contact_groups;
drop policy if exists "members add groups" on public.contact_groups;
drop policy if exists "members edit groups" on public.contact_groups;
drop policy if exists "admins delete groups" on public.contact_groups;
create policy "members read groups" on public.contact_groups for select to authenticated using (public.is_member());
create policy "members add groups" on public.contact_groups for insert to authenticated with check (public.is_member());
create policy "members edit groups" on public.contact_groups for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "admins delete groups" on public.contact_groups for delete to authenticated using (public.is_admin());

-- ── Activity log ──────────────────────────────────────────────────────────────
-- Written only by the triggers below and by the server; Admins can read it, nobody can edit it.
create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_name text not null,
  action text not null,
  entity text not null,
  entity_id text,
  label text,
  detail text,
  changes jsonb
);
create index if not exists activity_log_at_idx on public.activity_log (at desc);

alter table public.activity_log enable row level security;
drop policy if exists "admins read activity" on public.activity_log;
create policy "admins read activity" on public.activity_log for select to authenticated using (public.is_admin());

-- TG_ARGV[0] = column holding the record's display name,
-- TG_ARGV[1] = columns whose changes are not worth recording, e.g. '{last_contacted}'.
create or replace function public.record_activity() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  actor uuid := auth.uid();
  old_j jsonb;
  new_j jsonb;
  changes jsonb := '{}'::jsonb;
  ignored text[] := coalesce(nullif(TG_ARGV[1], '')::text[], '{}');
  k text;
  act text;
begin
  -- Server-side writes (no signed-in user) record their own entries.
  if actor is null or coalesce(current_setting('fms.skip_activity', true), '') = 'on' then
    return null;
  end if;
  if TG_OP <> 'INSERT' then old_j := to_jsonb(old); end if;
  if TG_OP <> 'DELETE' then new_j := to_jsonb(new); end if;

  if TG_OP = 'UPDATE' then
    for k in select jsonb_object_keys(new_j) loop
      if not (k = any (ignored)) and new_j -> k is distinct from old_j -> k then
        changes := changes || jsonb_build_object(k, jsonb_build_array(old_j -> k, new_j -> k));
      end if;
    end loop;
    if changes = '{}'::jsonb then return null; end if;
  end if;

  act := case TG_OP when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end;
  if changes ? 'archived' then
    act := case when (new_j ->> 'archived')::boolean then 'archived' else 'restored' end;
  elsif changes ? 'active' then
    act := case when (new_j ->> 'active')::boolean then 'resumed' else 'paused' end;
  end if;

  insert into public.activity_log (actor_id, actor_name, action, entity, entity_id, label, changes)
  values (
    actor,
    coalesce((select name from public.profiles where id = actor), 'Unknown user'),
    act,
    TG_TABLE_NAME,
    coalesce(new_j, old_j) ->> 'id',
    coalesce(new_j, old_j) ->> TG_ARGV[0],
    case when TG_OP = 'UPDATE' then changes end
  );
  return null;
end $$;

drop trigger if exists contacts_activity on public.contacts;
create trigger contacts_activity after insert or update or delete on public.contacts
  for each row execute function public.record_activity('name', '{last_contacted,welcome_sent_at}');

drop trigger if exists events_activity on public.events;
create trigger events_activity after insert or update or delete on public.events
  for each row execute function public.record_activity('name', '{next_trigger}');

drop trigger if exists groups_activity on public.contact_groups;
create trigger groups_activity after insert or update or delete on public.contact_groups
  for each row execute function public.record_activity('name', '');

drop trigger if exists fields_activity on public.contact_fields;
create trigger fields_activity after insert or update or delete on public.contact_fields
  for each row execute function public.record_activity('label', '{position}');

drop trigger if exists templates_activity on public.welcome_templates;
create trigger templates_activity after insert or update or delete on public.welcome_templates
  for each row execute function public.record_activity('label', '');

drop trigger if exists logs_activity on public.message_logs;
create trigger logs_activity after delete on public.message_logs
  for each row execute function public.record_activity('contact_name', '');

-- Deleting a group takes it off every contact, without one log entry per contact.
create or replace function public.remove_deleted_group() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform set_config('fms.skip_activity', 'on', true);
  update public.contacts set group_ids = array_remove(group_ids, old.id) where old.id = any (group_ids);
  perform set_config('fms.skip_activity', '', true);
  return null;
end $$;

drop trigger if exists groups_cleanup on public.contact_groups;
create trigger groups_cleanup after delete on public.contact_groups
  for each row execute function public.remove_deleted_group();

-- ── Delivery reports ──────────────────────────────────────────────────────────
alter table public.message_logs add column if not exists status_detail text;
alter table public.message_logs add column if not exists status_at timestamptz;

-- Reports are only handed out once by the SMS provider, so they are stored first and
-- matched to message_logs afterwards (a report can arrive before its log row is saved).
create table if not exists public.delivery_reports (
  id text primary key,
  status text not null,
  detail text,
  reported_at timestamptz,
  received_at timestamptz not null default now()
);
alter table public.delivery_reports enable row level security;

create or replace function public.apply_delivery_reports() returns integer
language plpgsql security definer set search_path = public
as $$
declare
  applied integer;
begin
  with matched as (
    -- A late "still with the network" report never overrides delivered/failed.
    update public.message_logs l
       set status = case when r.status = 'sent' and l.status in ('delivered', 'failed') then l.status else r.status end,
           status_detail = case when r.status = 'sent' and l.status in ('delivered', 'failed') then l.status_detail else r.detail end,
           status_at = coalesce(r.reported_at, r.received_at)
      from public.delivery_reports r
     where r.id = l.id
    returning r.id
  )
  delete from public.delivery_reports d using matched m where d.id = m.id;
  get diagnostics applied = row_count;
  delete from public.delivery_reports where received_at < now() - interval '7 days';
  return applied;
end $$;

-- ── Scheduled reminders ───────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'events' and column_name = 'audience_type') then
    alter table public.events add column audience_type text not null default 'all'
      check (audience_type in ('all', 'group', 'tag'));
    alter table public.events add column audience_value text;
    -- Old next-send times were worked out in each browser; the server recalculates them.
    update public.events set next_trigger = null;
  end if;
end $$;

-- Only the server sets next_trigger. Changing when an event happens (or pausing it)
-- clears it so the server works it out again.
create or replace function public.events_guard_next_trigger() returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then return new; end if;
  if TG_OP = 'INSERT' then
    new.next_trigger := null;
  elsif (new.frequency, new.day_of_week, new.time, new.date, new.lead_time_hours, new.active)
        is distinct from (old.frequency, old.day_of_week, old.time, old.date, old.lead_time_hours, old.active) then
    new.next_trigger := null;
  else
    new.next_trigger := old.next_trigger;
  end if;
  return new;
end $$;

drop trigger if exists events_next_trigger on public.events;
create trigger events_next_trigger before insert or update on public.events
  for each row execute function public.events_guard_next_trigger();

-- Messages waiting to go out. Filled and emptied by the server every few minutes.
create table if not exists public.message_outbox (
  id text primary key,
  event_id text,
  event_name text,
  contact_id text,
  contact_name text,
  contact_phone text not null,
  channel text not null,
  content text not null,
  status text not null default 'queued' check (status in ('queued', 'sending')),
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists message_outbox_queue_idx on public.message_outbox (status, created_at);
alter table public.message_outbox enable row level security;

create or replace function public.claim_outbox(max_rows integer) returns setof public.message_outbox
language sql security definer set search_path = public
as $$
  update public.message_outbox o
     set status = 'sending', claimed_at = now()
   where o.id in (
     select id from public.message_outbox
      where status = 'queued'
      order by created_at
      limit max_rows
      for update skip locked
   )
  returning o.*;
$$;

revoke all on function public.claim_outbox(integer) from public, anon, authenticated;
revoke all on function public.apply_delivery_reports() from public, anon, authenticated;
revoke all on function public.remove_deleted_group() from public, anon, authenticated;
grant execute on function public.claim_outbox(integer) to service_role;
grant execute on function public.apply_delivery_reports() to service_role;
