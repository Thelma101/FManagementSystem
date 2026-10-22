-- Home / closest church on contacts; sender email on message history.
alter table public.contacts add column if not exists home_location text;
alter table public.contacts add column if not exists closest_church text;
alter table public.message_logs add column if not exists sent_by_email text;
