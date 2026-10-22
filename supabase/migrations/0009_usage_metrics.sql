-- Login counts, time in the app, and client-side events (sends, report downloads)
-- that database triggers do not see. Safe to re-run.

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seconds integer not null default 0
);
create index if not exists user_sessions_user_idx on public.user_sessions (user_id);
create index if not exists activity_log_actor_action_idx on public.activity_log (actor_id, action);

alter table public.user_sessions enable row level security;
drop policy if exists "own sessions insert" on public.user_sessions;
drop policy if exists "own sessions update" on public.user_sessions;
drop policy if exists "sessions read" on public.user_sessions;
create policy "own sessions insert" on public.user_sessions
  for insert to authenticated with check (user_id = auth.uid());
create policy "own sessions update" on public.user_sessions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sessions read" on public.user_sessions
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

create or replace function public.start_session() returns uuid
language plpgsql security definer set search_path = public
as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.user_sessions (user_id) values (auth.uid()) returning id into sid;
  return sid;
end $$;

create or replace function public.heartbeat_session(p_id uuid, p_add integer) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  update public.user_sessions
  set seconds = seconds + greatest(0, least(coalesce(p_add, 0), 120)),
      last_seen_at = now()
  where id = p_id and user_id = auth.uid();
end $$;

-- Allowlisted events the browser records (triggers still cover contacts, groups, etc.).
create or replace function public.log_metric(
  p_action text,
  p_entity text,
  p_entity_id text default null,
  p_label text default null,
  p_detail text default null
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  if p_action not in ('signed_in', 'signed_out', 'downloaded', 'sent', 'imported') then
    return;
  end if;
  insert into public.activity_log (actor_id, actor_name, action, entity, entity_id, label, detail)
  values (
    auth.uid(),
    coalesce((select name from public.profiles where id = auth.uid()), 'Unknown user'),
    p_action,
    coalesce(nullif(p_entity, ''), 'portal'),
    p_entity_id,
    p_label,
    p_detail
  );
end $$;

create or replace function public.usage_stats()
returns table (
  user_id uuid,
  name text,
  email text,
  logins bigint,
  seconds bigint,
  last_seen timestamptz
)
language sql stable security definer set search_path = public
as $$
  select
    p.id,
    p.name,
    p.email,
    (select count(*) from public.activity_log a where a.actor_id = p.id and a.action = 'signed_in'),
    coalesce((select sum(s.seconds)::bigint from public.user_sessions s where s.user_id = p.id), 0),
    (select max(s.last_seen_at) from public.user_sessions s where s.user_id = p.id)
  from public.profiles p
  where public.is_admin()
  order by p.name;
$$;

grant execute on function public.start_session() to authenticated;
grant execute on function public.heartbeat_session(uuid, integer) to authenticated;
grant execute on function public.log_metric(text, text, text, text, text) to authenticated;
grant execute on function public.usage_stats() to authenticated;
