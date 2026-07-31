create table if not exists private.qopp_catalog_snapshot (
  singleton boolean primary key default true check (singleton),
  snapshot jsonb not null,
  published_at timestamptz not null default clock_timestamp()
);

revoke all on table private.qopp_catalog_snapshot from public, anon, authenticated;

create or replace function public.qopp_get_catalog_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select snapshot
  from private.qopp_catalog_snapshot
  where singleton = true;
$$;

create or replace function public.qopp_publish_catalog_snapshot(p_snapshot jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_snapshot is null
    or jsonb_typeof(p_snapshot) <> 'object'
    or p_snapshot ->> 'version' <> '1'
    or jsonb_typeof(p_snapshot -> 'properties') <> 'array'
    or jsonb_array_length(p_snapshot -> 'properties') < 1 then
    raise exception 'invalid_snapshot';
  end if;

  insert into private.qopp_catalog_snapshot (singleton, snapshot, published_at)
  values (true, p_snapshot, clock_timestamp())
  on conflict (singleton) do update
  set snapshot = excluded.snapshot,
      published_at = excluded.published_at;

  return true;
end;
$$;

revoke all on function public.qopp_get_catalog_snapshot()
  from public, anon, authenticated;
revoke all on function public.qopp_publish_catalog_snapshot(jsonb)
  from public, anon, authenticated;

grant execute on function public.qopp_get_catalog_snapshot()
  to service_role;
grant execute on function public.qopp_publish_catalog_snapshot(jsonb)
  to service_role;

notify pgrst, 'reload schema';
