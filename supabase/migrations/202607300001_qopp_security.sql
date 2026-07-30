create schema if not exists private;

create table if not exists private.qopp_security_counters (
  key text primary key check (char_length(key) between 1 and 200),
  counter bigint not null default 1 check (counter > 0),
  expires_at timestamptz not null
);

create index if not exists qopp_security_counters_expires_at_idx
  on private.qopp_security_counters (expires_at);

revoke all on schema private from public, anon, authenticated;
revoke all on table private.qopp_security_counters from public, anon, authenticated;

create or replace function public.qopp_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count bigint;
  current_expiry timestamptz;
  current_time timestamptz := clock_timestamp();
begin
  if p_key is null
    or char_length(p_key) not between 1 and 200
    or p_key not like 'qopp:rl:%'
    or p_limit is null
    or p_limit not between 1 and 1000
    or p_window_seconds is null
    or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid_parameters';
  end if;

  insert into private.qopp_security_counters as counters (key, counter, expires_at)
  values (p_key, 1, current_time + make_interval(secs => p_window_seconds))
  on conflict (key) do update
  set
    counter = case
      when counters.expires_at <= current_time then 1
      else counters.counter + 1
    end,
    expires_at = case
      when counters.expires_at <= current_time
        then current_time + make_interval(secs => p_window_seconds)
      else counters.expires_at
    end
  returning counter, expires_at into current_count, current_expiry;

  if random() < 0.01 then
    delete from private.qopp_security_counters
    where expires_at < current_time - interval '1 day';
  end if;

  return query select
    current_count <= p_limit,
    greatest(1, ceil(extract(epoch from current_expiry - current_time))::integer);
end;
$$;

create or replace function public.qopp_reserve_idempotency(
  p_key text,
  p_ttl_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
  current_time timestamptz := clock_timestamp();
begin
  if p_key is null
    or char_length(p_key) not between 1 and 200
    or p_key not like 'qopp:dedupe:%'
    or p_ttl_seconds is null
    or p_ttl_seconds not between 1 and 86400 then
    raise exception 'invalid_parameters';
  end if;

  insert into private.qopp_security_counters as counters (key, counter, expires_at)
  values (p_key, 1, current_time + make_interval(secs => p_ttl_seconds))
  on conflict (key) do update
  set counter = 1,
      expires_at = current_time + make_interval(secs => p_ttl_seconds)
  where counters.expires_at <= current_time;

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.qopp_release_idempotency(p_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if p_key is null
    or char_length(p_key) not between 1 and 200
    or p_key not like 'qopp:dedupe:%' then
    raise exception 'invalid_parameters';
  end if;

  delete from private.qopp_security_counters where key = p_key;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.qopp_rate_limit(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.qopp_reserve_idempotency(text, integer)
  from public, anon, authenticated;
revoke all on function public.qopp_release_idempotency(text)
  from public, anon, authenticated;

grant execute on function public.qopp_rate_limit(text, integer, integer)
  to service_role;
grant execute on function public.qopp_reserve_idempotency(text, integer)
  to service_role;
grant execute on function public.qopp_release_idempotency(text)
  to service_role;
