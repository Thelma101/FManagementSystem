-- Shrink what an Authorized login can copy from message history, and keep
-- "erase at the person's request" out of the activity log's before/after values.

-- Authorized staff only see sends they made. Admins still see the full history.
drop policy if exists "members read logs" on public.message_logs;
create policy "members read logs" on public.message_logs
  for select to authenticated
  using (
    public.is_admin()
    or lower(coalesce(sent_by_email, '')) = lower((select email from public.profiles where id = auth.uid()))
  );

-- When a contact is erased, record that it happened — not the old phone or notes.
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
  if actor is null or coalesce(current_setting('fms.skip_activity', true), '') = 'on' then
    return null;
  end if;
  if TG_OP <> 'INSERT' then old_j := to_jsonb(old); end if;
  if TG_OP <> 'DELETE' then new_j := to_jsonb(new); end if;

  if TG_OP = 'UPDATE' and TG_TABLE_NAME = 'contacts'
     and coalesce(new.phone, '') like 'erased:%'
     and coalesce(old.phone, '') not like 'erased:%' then
    insert into public.activity_log (actor_id, actor_name, action, entity, entity_id, label, detail)
    values (
      actor,
      coalesce((select name from public.profiles where id = actor), 'Unknown user'),
      'erased',
      'contacts',
      new.id,
      'Record erased',
      'Personal details and message history were removed at the person''s request'
    );
    return null;
  end if;

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
