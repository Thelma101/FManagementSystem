-- Fellowship Portal schema. Safe to re-run.

-- ── Portal users (linked to Supabase Auth) ────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'authorized' check (role in ('superadmin', 'admin', 'authorized')),
  must_change_password boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);

create or replace function public.portal_role() returns text
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid()) $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.portal_role() in ('superadmin', 'admin'), false) $$;

-- Lets a user clear their own "change password on first sign-in" flag without
-- being able to edit anything else on their profile (e.g. their role).
create or replace function public.clear_password_flag() returns void
language sql security definer set search_path = public
as $$ update public.profiles set must_change_password = false where id = auth.uid() $$;

-- ── Contacts ──────────────────────────────────────────────────────────────────
create table if not exists public.contacts (
  id text primary key,
  name text not null,
  phone text not null,
  whatsapp_status text not null default 'unknown',
  whatsapp_checked_at timestamptz,
  whatsapp_check_source text,
  added_by text,
  added_at timestamptz not null default now(),
  tags text[] not null default '{}',
  notes text not null default '',
  last_contacted timestamptz,
  archived boolean not null default false,
  met_location text,
  met_date date,
  born_again boolean,
  salvation_date date,
  salvation_place text,
  baptised boolean,
  baptism_date date,
  in_cell_fellowship boolean,
  cell_name text,
  attendance_commitment text,
  committed_services text[],
  committed_special_event text,
  welcome_sent_at timestamptz
);
create unique index if not exists contacts_phone_key on public.contacts (phone);

-- ── Attendance ────────────────────────────────────────────────────────────────
create table if not exists public.attendance (
  id text primary key,
  contact_id text not null references public.contacts (id) on delete cascade,
  week_start date not null,
  service_type text not null,
  special_event text,
  recorded_by text,
  recorded_at timestamptz not null default now()
);
create unique index if not exists attendance_unique_key on public.attendance (contact_id, week_start, service_type);
create index if not exists attendance_week_idx on public.attendance (week_start);

-- ── Message history ───────────────────────────────────────────────────────────
create table if not exists public.message_logs (
  id text primary key,
  contact_id text,
  contact_name text,
  contact_phone text,
  channel text not null,
  content text not null,
  status text not null,
  sent_at timestamptz not null default now(),
  sent_by text,
  kind text
);
create index if not exists message_logs_sent_idx on public.message_logs (sent_at desc);

-- ── Scheduled reminders ───────────────────────────────────────────────────────
create table if not exists public.events (
  id text primary key,
  name text not null,
  description text not null default '',
  frequency text not null,
  day_of_week text,
  time text not null,
  date text,
  lead_time_hours integer[] not null default '{}',
  message_template text not null default '',
  channels text[] not null default '{}',
  active boolean not null default true,
  next_trigger timestamptz,
  created_by text
);

-- ── Welcome message templates ─────────────────────────────────────────────────
create table if not exists public.welcome_templates (
  id text primary key,
  label text not null,
  text text not null,
  built_in boolean not null default false
);

insert into public.welcome_templates (id, label, text, built_in) values
  ('w1', 'Harvest field welcome',
   'Dear {name}, it was a joy meeting you at {location} on {date}. God loves you and so do we! You are warmly invited to worship with us at Living Faith Church. We look forward to seeing you. — Living Faith Church',
   true),
  ('w2', 'New convert welcome',
   'Dear {name}, congratulations on giving your life to Christ! We were blessed to meet you at {location}. Our Sunday service holds at 7:00 AM and our WSF (cell fellowship) meets weekly near you. Welcome to the family! — Living Faith Church',
   true),
  ('w3', 'Service invitation',
   'Dear {name}, thank you for your time at {location} on {date}. You are specially invited to our {service}. Come expecting a touch from God! — Living Faith Church',
   true)
on conflict (id) do nothing;

-- ── Row level security ────────────────────────────────────────────────────────
-- Only signed-in portal members (users with a profile) can see or change data.
-- User accounts are created/changed only by the server (secret key), never the browser.
alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.attendance enable row level security;
alter table public.message_logs enable row level security;
alter table public.events enable row level security;
alter table public.welcome_templates enable row level security;

drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles for select to authenticated using (public.is_member());

drop policy if exists "members read contacts" on public.contacts;
drop policy if exists "members add contacts" on public.contacts;
drop policy if exists "members edit contacts" on public.contacts;
drop policy if exists "admins delete contacts" on public.contacts;
create policy "members read contacts" on public.contacts for select to authenticated using (public.is_member());
create policy "members add contacts" on public.contacts for insert to authenticated with check (public.is_member());
create policy "members edit contacts" on public.contacts for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "admins delete contacts" on public.contacts for delete to authenticated using (public.is_admin());

drop policy if exists "members manage attendance" on public.attendance;
create policy "members manage attendance" on public.attendance for all to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists "members read logs" on public.message_logs;
drop policy if exists "members add logs" on public.message_logs;
drop policy if exists "admins change logs" on public.message_logs;
drop policy if exists "admins delete logs" on public.message_logs;
create policy "members read logs" on public.message_logs for select to authenticated using (public.is_member());
create policy "members add logs" on public.message_logs for insert to authenticated with check (public.is_member());
create policy "admins change logs" on public.message_logs for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete logs" on public.message_logs for delete to authenticated using (public.is_admin());

drop policy if exists "members read events" on public.events;
drop policy if exists "members add events" on public.events;
drop policy if exists "members edit events" on public.events;
drop policy if exists "admins delete events" on public.events;
create policy "members read events" on public.events for select to authenticated using (public.is_member());
create policy "members add events" on public.events for insert to authenticated with check (public.is_member());
create policy "members edit events" on public.events for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "admins delete events" on public.events for delete to authenticated using (public.is_admin());

drop policy if exists "members read templates" on public.welcome_templates;
drop policy if exists "members add templates" on public.welcome_templates;
drop policy if exists "members edit templates" on public.welcome_templates;
drop policy if exists "members delete custom templates" on public.welcome_templates;
create policy "members read templates" on public.welcome_templates for select to authenticated using (public.is_member());
create policy "members add templates" on public.welcome_templates for insert to authenticated with check (public.is_member() and not built_in);
create policy "members edit templates" on public.welcome_templates for update to authenticated using (public.is_member() and not built_in) with check (public.is_member() and not built_in);
create policy "members delete custom templates" on public.welcome_templates for delete to authenticated using (public.is_member() and not built_in);

revoke all on function public.clear_password_flag() from public, anon;
grant execute on function public.clear_password_flag() to authenticated;
