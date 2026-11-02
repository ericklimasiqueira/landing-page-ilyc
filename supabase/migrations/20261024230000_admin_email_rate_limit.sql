-- Shared, atomic limits for administrative invitation and password-reset emails.
-- Only the server's service_role may execute the SECURITY DEFINER function;
-- direct table access remains unavailable to API clients.

create table public.admin_email_rate_limits (
  admin_user_id uuid not null,
  action text not null check (action in ('invite', 'password_reset')),
  window_kind text not null check (window_kind in ('hour', 'day')),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (admin_user_id, action, window_kind, window_started_at)
);

create index admin_email_rate_limits_window_started_at_idx
  on public.admin_email_rate_limits (window_started_at);

alter table public.admin_email_rate_limits enable row level security;
revoke all on public.admin_email_rate_limits from public, anon, authenticated, service_role;

create table public.admin_email_action_audit (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null,
  target_user_id uuid,
  action text not null check (action in ('invite', 'password_reset')),
  outcome text not null check (outcome in ('attempted', 'sent', 'failed', 'rate_limited', 'role_assignment_failed')),
  created_at timestamptz not null default pg_catalog.now()
);

create index admin_email_action_audit_created_at_idx
  on public.admin_email_action_audit (created_at);

alter table public.admin_email_action_audit enable row level security;
revoke all on public.admin_email_action_audit from public, anon, authenticated;
grant insert on public.admin_email_action_audit to service_role;
grant usage on sequence public.admin_email_action_audit_id_seq to service_role;

create or replace function public.consume_admin_email_rate_limit(
  p_admin_user_id uuid,
  p_action text
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_hour_start timestamptz;
  v_day_start timestamptz;
  v_hour_count integer;
  v_day_count integer;
  v_hour_limit integer := 10;
  v_day_limit integer := 30;
  v_retry_after integer := 0;
begin
  if p_admin_user_id is null or p_action not in ('invite', 'password_reset') then
    raise exception 'invalid rate limit key' using errcode = '22023';
  end if;

  v_hour_start := pg_catalog.to_timestamp(
    pg_catalog.floor(extract(epoch from v_now) / 3600) * 3600
  );
  v_day_start := pg_catalog.to_timestamp(
    pg_catalog.floor(extract(epoch from v_now) / 86400) * 86400
  );

  insert into public.admin_email_rate_limits as limits (
    admin_user_id, action, window_kind, window_started_at, request_count
  ) values (p_admin_user_id, p_action, 'hour', v_hour_start, 1)
  on conflict (admin_user_id, action, window_kind, window_started_at)
  do update set request_count = limits.request_count + 1
  returning request_count into v_hour_count;

  insert into public.admin_email_rate_limits as limits (
    admin_user_id, action, window_kind, window_started_at, request_count
  ) values (p_admin_user_id, p_action, 'day', v_day_start, 1)
  on conflict (admin_user_id, action, window_kind, window_started_at)
  do update set request_count = limits.request_count + 1
  returning request_count into v_day_count;

  if v_hour_count > v_hour_limit then
    v_retry_after := pg_catalog.ceil(
      extract(epoch from (v_hour_start + interval '1 hour' - v_now))
    )::integer;
  end if;
  if v_day_count > v_day_limit then
    v_retry_after := greatest(
      v_retry_after,
      pg_catalog.ceil(
        extract(epoch from (v_day_start + interval '1 day' - v_now))
      )::integer
    );
  end if;

  -- Opportunistically remove expired counters; the indexed timestamp keeps this bounded.
  delete from public.admin_email_rate_limits
  where window_started_at < v_now - interval '2 days';

  return query select
    (v_hour_count <= v_hour_limit and v_day_count <= v_day_limit),
    greatest(0, v_retry_after);
end;
$$;

revoke all on function public.consume_admin_email_rate_limit(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_admin_email_rate_limit(uuid, text) to service_role;
