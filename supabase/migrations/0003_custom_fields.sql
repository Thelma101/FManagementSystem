-- Extra contact fields defined by Admins (e.g. "Bible school": yes/no + date + place),
-- with each contact's answers stored in contacts.custom keyed by field id.

alter table public.contacts add column if not exists baptism_place text;
alter table public.contacts add column if not exists custom jsonb;

create table if not exists public.contact_fields (
  id text primary key,
  label text not null,
  type text not null check (type in ('yesno', 'text', 'date', 'choice')),
  ask_date boolean,
  ask_place boolean,
  options text[],
  position integer not null default 0,
  archived boolean,
  created_by text
);

alter table public.contact_fields enable row level security;

drop policy if exists "members read fields" on public.contact_fields;
drop policy if exists "admins add fields" on public.contact_fields;
drop policy if exists "admins edit fields" on public.contact_fields;
drop policy if exists "admins delete fields" on public.contact_fields;
create policy "members read fields" on public.contact_fields for select to authenticated using (public.is_member());
create policy "admins add fields" on public.contact_fields for insert to authenticated with check (public.is_admin());
create policy "admins edit fields" on public.contact_fields for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete fields" on public.contact_fields for delete to authenticated using (public.is_admin());

insert into public.contact_fields (id, label, type, ask_date, ask_place, position, created_by)
values ('f-bible-school', 'Bible school', 'yesno', true, true, 1, 'Portal Admin')
on conflict (id) do nothing;
