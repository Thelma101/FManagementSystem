-- Multi-zone model, establishment journey, do-not-contact, support directory.

create table if not exists public.zones (
  id text primary key,
  code text not null unique,
  name text not null,
  country text not null default 'Nigeria',
  state text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.zones (id, code, name, country, state) values
  ('zone-lekki-osapa', 'LG-OSAPA', 'Lekki Osapa Zone', 'Nigeria', 'Lagos'),
  ('zone-surulere', 'LG-SURU', 'Surulere Zone', 'Nigeria', 'Lagos')
on conflict (id) do nothing;

alter table public.profiles
  add column if not exists zone_id text references public.zones (id);

alter table public.contacts
  add column if not exists zone_id text references public.zones (id),
  add column if not exists do_not_contact boolean not null default false,
  add column if not exists establishment_stage text not null default 'encounter',
  add column if not exists believers_class_at date,
  add column if not exists baptismal_class_at date,
  add column if not exists wofbi_at date,
  add column if not exists established_at date,
  add column if not exists referral_zone_id text references public.zones (id),
  add column if not exists referral_status text;

-- Existing contacts/users default to Lekki Osapa (pilot zone).
update public.contacts set zone_id = 'zone-lekki-osapa' where zone_id is null;
update public.profiles set zone_id = 'zone-lekki-osapa' where zone_id is null;

create table if not exists public.support_directory (
  id text primary key,
  role_key text not null,
  label text not null,
  name text not null default '',
  email text not null default '',
  phone text not null default '',
  sort_order integer not null default 0
);

insert into public.support_directory (id, role_key, label, name, email, phone, sort_order) values
  ('sup-zone-admin', 'zone_admin', 'Zone Administrator', '', '', '', 10),
  ('sup-tech', 'tech', 'Technical Support', '', '', '', 20),
  ('sup-privacy', 'privacy', 'Privacy / removal requests', '', '', '', 30),
  ('sup-national', 'national', 'National coordination', '', '', '', 40)
on conflict (id) do nothing;

alter table public.zones enable row level security;
alter table public.support_directory enable row level security;

drop policy if exists "members read zones" on public.zones;
create policy "members read zones" on public.zones for select to authenticated
  using (public.is_member());

drop policy if exists "admins write zones" on public.zones;
create policy "admins write zones" on public.zones for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "members read support" on public.support_directory;
create policy "members read support" on public.support_directory for select to authenticated
  using (public.is_member());

drop policy if exists "admins write support" on public.support_directory;
create policy "admins write support" on public.support_directory for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
