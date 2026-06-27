create table if not exists public.staff_login_devices (
  device_key text primary key,
  failed_attempt_count integer not null default 0,
  last_failed_at timestamptz,
  last_success_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_sessions (
  session_token text primary key,
  staff_id uuid not null references public.staff(id) on delete cascade,
  device_key text references public.staff_login_devices(device_key) on delete set null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists staff_sessions_staff_id_idx
  on public.staff_sessions (staff_id);

create index if not exists staff_sessions_active_idx
  on public.staff_sessions (expires_at, revoked_at);

create table if not exists public.staff_stall_access (
  staff_id uuid not null references public.staff(id) on delete cascade,
  stall_id uuid not null references public.stalls(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id, stall_id)
);

create index if not exists staff_stall_access_stall_id_idx
  on public.staff_stall_access (stall_id);

create or replace function public.login_staff(
  p_pin_code text,
  p_device_key text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff staff%rowtype;
  v_device_key text := coalesce(nullif(trim(p_device_key), ''), 'shared-device');
  v_user_agent text := nullif(left(coalesce(trim(p_user_agent), ''), 255), '');
  v_now timestamptz := now();
  v_failed_attempts integer := 0;
  v_locked_until timestamptz;
  v_session_token text;
  v_expires_at timestamptz := v_now + interval '12 hours';
begin
  if length(coalesce(trim(p_pin_code), '')) <> 6 then
    raise exception 'Enter your 6-digit PIN';
  end if;

  insert into public.staff_login_devices (device_key)
  values (v_device_key)
  on conflict (device_key) do nothing;

  select
    failed_attempt_count,
    locked_until
  into
    v_failed_attempts,
    v_locked_until
  from public.staff_login_devices
  where device_key = v_device_key
  for update;

  if v_locked_until is not null and v_locked_until > v_now then
    raise exception 'Too many failed attempts. Try again later.';
  end if;

  select *
  into v_staff
  from public.staff
  where pin_code = trim(p_pin_code);

  if not found then
    v_failed_attempts := coalesce(v_failed_attempts, 0) + 1;

    update public.staff_login_devices
    set
      failed_attempt_count = v_failed_attempts,
      last_failed_at = v_now,
      locked_until = case
        when v_failed_attempts >= 5 then v_now + interval '15 minutes'
        else null
      end,
      updated_at = v_now
    where device_key = v_device_key;

    raise exception 'Invalid PIN';
  end if;

  update public.staff_login_devices
  set
    failed_attempt_count = 0,
    last_failed_at = null,
    last_success_at = v_now,
    locked_until = null,
    updated_at = v_now
  where device_key = v_device_key;

  update public.staff_sessions
  set revoked_at = v_now
  where staff_id = v_staff.id
    and device_key = v_device_key
    and revoked_at is null;

  v_session_token :=
    md5(random()::text || clock_timestamp()::text || v_staff.id::text) ||
    md5(clock_timestamp()::text || random()::text || coalesce(v_device_key, ''));

  insert into public.staff_sessions (
    session_token,
    staff_id,
    device_key,
    user_agent,
    expires_at
  )
  values (
    v_session_token,
    v_staff.id,
    v_device_key,
    v_user_agent,
    v_expires_at
  );

  return jsonb_build_object(
    'id', v_staff.id,
    'full_name', coalesce(nullif(trim(v_staff.full_name), ''), 'Staff'),
    'role', coalesce(nullif(trim(v_staff.role), ''), 'staff'),
    'session_token', v_session_token,
    'expires_at', v_expires_at
  );
end;
$$;

grant execute on function public.login_staff(text, text, text) to anon, authenticated;

create or replace function public.require_active_staff_session(
  p_session_token text
)
returns public.staff
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.staff_sessions%rowtype;
  v_staff public.staff%rowtype;
  v_now timestamptz := now();
  v_expires_at timestamptz := v_now + interval '12 hours';
begin
  if nullif(trim(p_session_token), '') is null then
    raise exception 'Staff session is missing';
  end if;

  select *
  into v_session
  from public.staff_sessions
  where session_token = trim(p_session_token)
    and revoked_at is null
    and expires_at > v_now
  for update;

  if not found then
    raise exception 'Staff session has expired. Please sign in again.';
  end if;

  select *
  into v_staff
  from public.staff
  where id = v_session.staff_id;

  if not found then
    update public.staff_sessions
    set revoked_at = v_now
    where session_token = trim(p_session_token);

    raise exception 'Staff not found';
  end if;

  update public.staff_sessions
  set
    last_seen_at = v_now,
    expires_at = v_expires_at
  where session_token = trim(p_session_token);

  return v_staff;
end;
$$;

create or replace function public.require_staff_stall_access(
  p_staff_id uuid,
  p_stall_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_assignment boolean := false;
  v_total_stalls integer := 0;
begin
  if p_stall_id is null then
    raise exception 'Could not find stall';
  end if;

  if not exists (
    select 1
    from public.stalls
    where id = p_stall_id
  ) then
    raise exception 'Could not find stall';
  end if;

  select exists(
    select 1
    from public.staff_stall_access
    where staff_id = p_staff_id
  )
  into v_has_assignment;

  if not v_has_assignment then
    select count(*)
    into v_total_stalls
    from public.stalls;

    if v_total_stalls = 1 then
      return;
    end if;

    raise exception 'Staff is not assigned to any stall';
  end if;

  if not exists (
    select 1
    from public.staff_stall_access
    where staff_id = p_staff_id
      and stall_id = p_stall_id
  ) then
    raise exception 'Staff is not allowed to access this stall';
  end if;
end;
$$;

create or replace function public.validate_staff_session(
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.staff_sessions%rowtype;
  v_staff public.staff%rowtype;
  v_now timestamptz := now();
  v_expires_at timestamptz := v_now + interval '12 hours';
begin
  if nullif(trim(p_session_token), '') is null then
    return null;
  end if;

  select *
  into v_session
  from public.staff_sessions
  where session_token = trim(p_session_token)
    and revoked_at is null
    and expires_at > v_now
  for update;

  if not found then
    return null;
  end if;

  select *
  into v_staff
  from public.staff
  where id = v_session.staff_id;

  if not found then
    update public.staff_sessions
    set revoked_at = v_now
    where session_token = trim(p_session_token);

    return null;
  end if;

  update public.staff_sessions
  set
    last_seen_at = v_now,
    expires_at = v_expires_at
  where session_token = trim(p_session_token);

  return jsonb_build_object(
    'id', v_staff.id,
    'full_name', coalesce(nullif(trim(v_staff.full_name), ''), 'Staff'),
    'role', coalesce(nullif(trim(v_staff.role), ''), 'staff'),
    'session_token', trim(p_session_token),
    'expires_at', v_expires_at
  );
end;
$$;

grant execute on function public.validate_staff_session(text) to anon, authenticated;

create or replace function public.get_staff_stall(
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_stall_id uuid;
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  select stall_id
  into v_stall_id
  from public.staff_stall_access
  where staff_id = v_staff.id
  order by created_at, stall_id
  limit 1;

  if v_stall_id is null then
    select id
    into v_stall_id
    from public.stalls
    order by id
    limit 1;

    if (
      select count(*)
      from public.stalls
    ) <> 1 then
      raise exception 'Staff has no assigned stall';
    end if;
  end if;

  return jsonb_build_object('id', v_stall_id);
end;
$$;

grant execute on function public.get_staff_stall(text) to anon, authenticated;

create or replace function public.logout_staff_session(
  p_session_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(p_session_token), '') is null then
    return;
  end if;

  update public.staff_sessions
  set revoked_at = now()
  where session_token = trim(p_session_token)
    and revoked_at is null;
end;
$$;

grant execute on function public.logout_staff_session(text) to anon, authenticated;

notify pgrst, 'reload schema';
