alter table public.stalls
add column if not exists business_name text;

alter table public.stalls
add column if not exists owner_name text;

alter table public.stalls
add column if not exists contact_phone text;

alter table public.stalls
add column if not exists receipt_footer text;

update public.stalls
set
  business_name = coalesce(
    nullif(trim(business_name), ''),
    nullif(trim(name), ''),
    'Karamela Business'
  ),
  owner_name = nullif(trim(owner_name), ''),
  contact_phone = nullif(trim(contact_phone), ''),
  receipt_footer = coalesce(
    nullif(trim(receipt_footer), ''),
    'Thank you for shopping with us.'
  )
where business_name is null
   or trim(business_name) = ''
   or receipt_footer is null
   or trim(receipt_footer) = '';

alter table public.staff
add column if not exists active boolean;

update public.staff
set active = true
where active is null;

alter table public.staff
alter column active set default true;

alter table public.staff
alter column active set not null;

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  business_name text,
  license_type text not null default 'lifetime',
  status text not null default 'active',
  start_date date not null default current_date,
  expiry_date date,
  max_devices integer not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke insert, delete on table public.licenses from anon, authenticated;
grant select, update on table public.licenses to anon, authenticated;

alter table public.licenses
add column if not exists business_name text;

alter table public.licenses
add column if not exists license_type text default 'lifetime';

alter table public.licenses
add column if not exists status text default 'active';

alter table public.licenses
add column if not exists start_date date default current_date;

alter table public.licenses
add column if not exists expiry_date date;

alter table public.licenses
add column if not exists max_devices integer default 1;

alter table public.licenses
add column if not exists notes text;

alter table public.licenses
add column if not exists created_at timestamptz default now();

alter table public.licenses
add column if not exists updated_at timestamptz default now();

update public.licenses
set
  business_name = nullif(trim(business_name), ''),
  license_type = coalesce(nullif(trim(license_type), ''), 'lifetime'),
  status = coalesce(nullif(trim(status), ''), 'active'),
  start_date = coalesce(start_date, current_date),
  max_devices = greatest(coalesce(max_devices, 1), 1),
  updated_at = coalesce(updated_at, now()),
  created_at = coalesce(created_at, now());

do $$
declare
  v_business_name text;
begin
  if not exists (
    select 1
    from public.licenses
  ) then
    select coalesce(
      nullif(trim(business_name), ''),
      nullif(trim(name), ''),
      'Karamela Business'
    )
    into v_business_name
    from public.stalls
    order by created_at, id
    limit 1;

    insert into public.licenses (
      business_name,
      license_type,
      status,
      start_date,
      max_devices,
      notes
    )
    values (
      coalesce(v_business_name, 'Karamela Business'),
      'lifetime',
      'active',
      current_date,
      1,
      'Created by Admin Control Center migration'
    );
  end if;
end
$$;

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
  where pin_code = trim(p_pin_code)
    and coalesce(active, true) is true;

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

  if coalesce(v_staff.active, true) is not true then
    update public.staff_sessions
    set revoked_at = v_now
    where session_token = trim(p_session_token);

    raise exception 'Your account is inactive. Contact the administrator.';
  end if;

  update public.staff_sessions
  set
    last_seen_at = v_now,
    expires_at = v_expires_at
  where session_token = trim(p_session_token);

  return v_staff;
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

  if not found or coalesce(v_staff.active, true) is not true then
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

notify pgrst, 'reload schema';
