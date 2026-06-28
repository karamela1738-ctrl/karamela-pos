create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

revoke all on table public.staff from anon, authenticated;
revoke all on table public.stalls from anon, authenticated;
revoke all on table public.licenses from anon, authenticated;

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

revoke all on table public.staff_login_devices from anon, authenticated;
revoke all on table public.staff_sessions from anon, authenticated;

alter table public.staff enable row level security;
alter table public.stalls enable row level security;
alter table public.licenses enable row level security;
alter table public.staff_login_devices enable row level security;
alter table public.staff_sessions enable row level security;

alter table public.staff
add column if not exists active boolean;

update public.staff
set active = true
where active is null;

alter table public.staff
alter column active set default true;

alter table public.staff
alter column active set not null;

alter table public.staff
add column if not exists pin_hash text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'staff'
      and column_name = 'pin_code'
  ) then
    execute $sql$
      update public.staff
      set pin_hash = extensions.crypt(trim(pin_code), extensions.gen_salt('bf'))
      where pin_hash is null
        and nullif(trim(pin_code), '') is not null
        and trim(pin_code) ~ '^[0-9]{6}$'
    $sql$;

    execute 'alter table public.staff alter column pin_code drop not null';
    execute 'update public.staff set pin_code = null where pin_code is not null';
  end if;
end
$$;

alter table public.staff_sessions
add column if not exists id uuid;

update public.staff_sessions
set id = gen_random_uuid()
where id is null;

alter table public.staff_sessions
alter column id set default gen_random_uuid();

alter table public.staff_sessions
alter column id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.staff_sessions'::regclass
      and conname = 'staff_sessions_id_key'
  ) then
    alter table public.staff_sessions
    add constraint staff_sessions_id_key unique (id);
  end if;
exception
  when duplicate_object or duplicate_table then null;
end
$$;

create index if not exists staff_sessions_staff_id_idx
  on public.staff_sessions (staff_id);

create index if not exists staff_sessions_active_idx
  on public.staff_sessions (expires_at, revoked_at);

create index if not exists staff_sessions_active_staff_idx
  on public.staff_sessions (staff_id, revoked_at, expires_at);

update public.staff_sessions
set expires_at = now() + interval '4 hours'
where revoked_at is null
  and expires_at > now() + interval '4 hours';

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
  v_expires_at timestamptz := v_now + interval '4 hours';
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
  where pin_hash is not null
    and pin_hash = extensions.crypt(trim(p_pin_code), pin_hash)
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
    replace(gen_random_uuid()::text, '-', '') ||
    replace(gen_random_uuid()::text, '-', '');

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
  v_expires_at timestamptz := v_now + interval '4 hours';
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
  v_expires_at timestamptz := v_now + interval '4 hours';
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

grant execute on function public.validate_staff_session(text) to anon, authenticated;

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

create or replace function public.require_admin_staff_session(
  p_session_token text
)
returns public.staff
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_role text;
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  v_role := lower(coalesce(nullif(trim(v_staff.role), ''), 'staff'));

  if v_role <> 'admin' then
    raise exception 'You do not have permission to access Admin Control Center.';
  end if;

  return v_staff;
end;
$$;

grant execute on function public.require_admin_staff_session(text) to anon, authenticated;

create or replace function public.get_admin_control_center(
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.staff%rowtype;
  v_stall_id uuid;
  v_business_date date := public.get_current_business_date();
  v_day_start timestamptz := (v_business_date::timestamp at time zone 'Africa/Nairobi');
  v_day_end timestamptz := ((v_business_date + 1)::timestamp at time zone 'Africa/Nairobi');
  v_business_setup jsonb := '{}'::jsonb;
  v_staff_rows jsonb := '[]'::jsonb;
  v_session_rows jsonb := '[]'::jsonb;
  v_license jsonb;
  v_total_products integer := 0;
  v_total_staff integer := 0;
  v_today_sales numeric := 0;
  v_today_waste numeric := 0;
  v_last_sale_time timestamptz;
begin
  select *
  into v_admin
  from public.require_admin_staff_session(p_session_token);

  v_stall_id := public.require_staff_primary_stall(v_admin.id);
  perform public.require_staff_stall_access(v_admin.id, v_stall_id);

  select jsonb_build_object(
    'stall_id', s.id,
    'business_name', coalesce(nullif(trim(s.business_name), ''), nullif(trim(s.name), ''), 'Karamela Business'),
    'stall_name', coalesce(nullif(trim(s.name), ''), 'Main Stall'),
    'owner_name', coalesce(nullif(trim(s.owner_name), ''), ''),
    'contact_phone', coalesce(nullif(trim(s.contact_phone), ''), ''),
    'receipt_footer', coalesce(nullif(trim(s.receipt_footer), ''), 'Thank you for shopping with us.')
  )
  into v_business_setup
  from public.stalls s
  where s.id = v_stall_id;

  select count(*)
  into v_total_products
  from public.products;

  select count(distinct s.id)
  into v_total_staff
  from public.staff s
  where s.stall_id = v_stall_id
     or exists (
       select 1
       from public.staff_stall_access ssa
       where ssa.staff_id = s.id
         and ssa.stall_id = v_stall_id
     );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', staff_row.id,
        'full_name', staff_row.full_name,
        'role', staff_row.role,
        'active', staff_row.active,
        'stall_id', staff_row.stall_id
      )
      order by staff_row.full_name
    ),
    '[]'::jsonb
  )
  into v_staff_rows
  from (
    select distinct
      s.id,
      coalesce(nullif(trim(s.full_name), ''), 'Staff') as full_name,
      coalesce(nullif(trim(s.role), ''), 'staff') as role,
      coalesce(s.active, true) as active,
      s.stall_id
    from public.staff s
    where s.stall_id = v_stall_id
       or exists (
         select 1
         from public.staff_stall_access ssa
         where ssa.staff_id = s.id
           and ssa.stall_id = v_stall_id
       )
  ) staff_row;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', session_row.id,
        'staff_id', session_row.staff_id,
        'staff_name', session_row.staff_name,
        'role', session_row.role,
        'device_label', session_row.device_label,
        'user_agent', session_row.user_agent,
        'created_at', session_row.created_at,
        'last_seen_at', session_row.last_seen_at,
        'expires_at', session_row.expires_at,
        'is_current', session_row.is_current
      )
      order by session_row.last_seen_at desc
    ),
    '[]'::jsonb
  )
  into v_session_rows
  from (
    select
      ss.id,
      ss.staff_id,
      coalesce(nullif(trim(s.full_name), ''), 'Staff') as staff_name,
      coalesce(nullif(trim(s.role), ''), 'staff') as role,
      case
        when ss.device_key is null then 'Unknown device'
        else 'Device ' || right(ss.device_key, 8)
      end as device_label,
      coalesce(nullif(trim(ss.user_agent), ''), 'Unknown user agent') as user_agent,
      ss.created_at,
      ss.last_seen_at,
      ss.expires_at,
      ss.session_token = trim(p_session_token) as is_current
    from public.staff_sessions ss
    inner join public.staff s
      on s.id = ss.staff_id
    where ss.revoked_at is null
      and ss.expires_at > now()
      and (
        s.stall_id = v_stall_id
        or exists (
          select 1
          from public.staff_stall_access ssa
          where ssa.staff_id = s.id
            and ssa.stall_id = v_stall_id
        )
      )
  ) session_row;

  select to_jsonb(license_row)
  into v_license
  from (
    select
      l.id,
      coalesce(nullif(trim(l.business_name), ''), '') as business_name,
      coalesce(nullif(trim(l.license_type), ''), 'lifetime') as license_type,
      coalesce(nullif(trim(l.status), ''), 'active') as status,
      l.start_date,
      l.expiry_date,
      greatest(coalesce(l.max_devices, 1), 1) as max_devices,
      l.notes,
      l.created_at,
      l.updated_at
    from public.licenses l
    order by l.created_at, l.id
    limit 1
  ) license_row;

  select
    coalesce(sum(s.total_amount), 0),
    max(s.created_at)
  into
    v_today_sales,
    v_last_sale_time
  from public.sales s
  where s.stall_id = v_stall_id
    and s.created_at >= v_day_start
    and s.created_at < v_day_end;

  select coalesce(
    sum(
      coalesce(
        w.value_amount,
        coalesce(w.quantity, 0) * coalesce(p.selling_price, 0)
      )
    ),
    0
  )
  into v_today_waste
  from public.waste_logs w
  left join public.products p
    on p.id = w.product_id
  where w.stall_id = v_stall_id
    and w.created_at >= v_day_start
    and w.created_at < v_day_end;

  return jsonb_build_object(
    'stall_id', v_stall_id,
    'business_setup', coalesce(v_business_setup, '{}'::jsonb),
    'staff_rows', coalesce(v_staff_rows, '[]'::jsonb),
    'session_rows', coalesce(v_session_rows, '[]'::jsonb),
    'license', v_license,
    'overview', jsonb_build_object(
      'total_products', v_total_products,
      'total_staff', v_total_staff,
      'sales_today', v_today_sales,
      'waste_today', v_today_waste,
      'last_sale_time', v_last_sale_time
    )
  );
end;
$$;

grant execute on function public.get_admin_control_center(text) to anon, authenticated;

create or replace function public.save_admin_business_setup(
  p_session_token text,
  p_business_name text,
  p_stall_name text,
  p_owner_name text default null,
  p_contact_phone text default null,
  p_receipt_footer text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.staff%rowtype;
  v_stall_id uuid;
  v_business_name text := nullif(trim(p_business_name), '');
  v_stall_name text := nullif(trim(p_stall_name), '');
  v_owner_name text := nullif(trim(p_owner_name), '');
  v_contact_phone text := nullif(trim(p_contact_phone), '');
  v_receipt_footer text := coalesce(nullif(trim(p_receipt_footer), ''), 'Thank you for shopping with us.');
  v_license_id uuid;
begin
  select *
  into v_admin
  from public.require_admin_staff_session(p_session_token);

  v_stall_id := public.require_staff_primary_stall(v_admin.id);
  perform public.require_staff_stall_access(v_admin.id, v_stall_id);

  if v_business_name is null then
    raise exception 'Business name is required';
  end if;

  if v_stall_name is null then
    raise exception 'Stall name is required';
  end if;

  update public.stalls
  set
    name = v_stall_name,
    business_name = v_business_name,
    owner_name = v_owner_name,
    contact_phone = v_contact_phone,
    receipt_footer = v_receipt_footer,
    updated_at = now()
  where id = v_stall_id;

  select id
  into v_license_id
  from public.licenses
  order by created_at, id
  limit 1;

  if v_license_id is null then
    insert into public.licenses (
      business_name,
      license_type,
      status,
      start_date,
      max_devices,
      notes
    )
    values (
      v_business_name,
      'lifetime',
      'active',
      current_date,
      1,
      'Created by Admin Control Center'
    );
  else
    update public.licenses
    set
      business_name = v_business_name,
      updated_at = now()
    where id = v_license_id;
  end if;

  return public.get_admin_control_center(p_session_token);
end;
$$;

grant execute on function public.save_admin_business_setup(text, text, text, text, text, text) to anon, authenticated;

create or replace function public.create_admin_staff(
  p_session_token text,
  p_full_name text,
  p_role text,
  p_pin_code text,
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.staff%rowtype;
  v_staff public.staff%rowtype;
  v_stall_id uuid;
  v_full_name text := nullif(trim(p_full_name), '');
  v_role text := lower(coalesce(nullif(trim(p_role), ''), 'staff'));
  v_pin_code text := trim(coalesce(p_pin_code, ''));
begin
  select *
  into v_admin
  from public.require_admin_staff_session(p_session_token);

  v_stall_id := public.require_staff_primary_stall(v_admin.id);
  perform public.require_staff_stall_access(v_admin.id, v_stall_id);

  if v_full_name is null then
    raise exception 'Staff name is required';
  end if;

  if v_role not in ('admin', 'owner', 'staff') then
    raise exception 'Select a valid staff role';
  end if;

  if v_pin_code !~ '^[0-9]{6}$' then
    raise exception 'PIN must be exactly 6 digits';
  end if;

  if exists (
    select 1
    from public.staff
    where pin_hash is not null
      and pin_hash = extensions.crypt(v_pin_code, pin_hash)
  ) then
    raise exception 'PIN is already assigned to another user';
  end if;

  insert into public.staff (
    full_name,
    role,
    pin_hash,
    active,
    stall_id
  )
  values (
    v_full_name,
    v_role,
    extensions.crypt(v_pin_code, extensions.gen_salt('bf')),
    coalesce(p_active, true),
    v_stall_id
  )
  returning * into v_staff;

  insert into public.staff_stall_access (
    staff_id,
    stall_id
  )
  values (
    v_staff.id,
    v_stall_id
  )
  on conflict (staff_id, stall_id) do nothing;

  return public.get_admin_control_center(p_session_token);
end;
$$;

grant execute on function public.create_admin_staff(text, text, text, text, boolean) to anon, authenticated;

create or replace function public.update_admin_staff(
  p_session_token text,
  p_staff_id uuid,
  p_full_name text,
  p_role text,
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.staff%rowtype;
  v_staff public.staff%rowtype;
  v_stall_id uuid;
  v_full_name text := nullif(trim(p_full_name), '');
  v_role text := lower(coalesce(nullif(trim(p_role), ''), 'staff'));
begin
  select *
  into v_admin
  from public.require_admin_staff_session(p_session_token);

  v_stall_id := public.require_staff_primary_stall(v_admin.id);
  perform public.require_staff_stall_access(v_admin.id, v_stall_id);

  if p_staff_id is null then
    raise exception 'Staff not found';
  end if;

  if v_full_name is null then
    raise exception 'Staff name is required';
  end if;

  if v_role not in ('admin', 'owner', 'staff') then
    raise exception 'Select a valid staff role';
  end if;

  if p_staff_id = v_admin.id and (v_role <> 'admin' or coalesce(p_active, true) is not true) then
    raise exception 'You cannot remove your own admin access';
  end if;

  update public.staff
  set
    full_name = v_full_name,
    role = v_role,
    active = coalesce(p_active, true),
    stall_id = v_stall_id
  where id = p_staff_id
    and (
      stall_id = v_stall_id
      or exists (
        select 1
        from public.staff_stall_access ssa
        where ssa.staff_id = p_staff_id
          and ssa.stall_id = v_stall_id
      )
    )
  returning * into v_staff;

  if not found then
    raise exception 'Staff not found';
  end if;

  insert into public.staff_stall_access (
    staff_id,
    stall_id
  )
  values (
    v_staff.id,
    v_stall_id
  )
  on conflict (staff_id, stall_id) do nothing;

  if coalesce(v_staff.active, true) is not true then
    update public.staff_sessions
    set revoked_at = now()
    where staff_id = v_staff.id
      and revoked_at is null;
  end if;

  return public.get_admin_control_center(p_session_token);
end;
$$;

grant execute on function public.update_admin_staff(text, uuid, text, text, boolean) to anon, authenticated;

create or replace function public.reset_admin_staff_pin(
  p_session_token text,
  p_staff_id uuid,
  p_pin_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.staff%rowtype;
  v_stall_id uuid;
  v_pin_code text := trim(coalesce(p_pin_code, ''));
begin
  select *
  into v_admin
  from public.require_admin_staff_session(p_session_token);

  v_stall_id := public.require_staff_primary_stall(v_admin.id);
  perform public.require_staff_stall_access(v_admin.id, v_stall_id);

  if p_staff_id is null then
    raise exception 'Staff not found';
  end if;

  if v_pin_code !~ '^[0-9]{6}$' then
    raise exception 'PIN must be exactly 6 digits';
  end if;

  if exists (
    select 1
    from public.staff
    where pin_hash is not null
      and pin_hash = extensions.crypt(v_pin_code, pin_hash)
      and id <> p_staff_id
  ) then
    raise exception 'PIN is already assigned to another user';
  end if;

  update public.staff
  set pin_hash = extensions.crypt(v_pin_code, extensions.gen_salt('bf'))
  where id = p_staff_id
    and (
      stall_id = v_stall_id
      or exists (
        select 1
        from public.staff_stall_access ssa
        where ssa.staff_id = p_staff_id
          and ssa.stall_id = v_stall_id
      )
    );

  if not found then
    raise exception 'Staff not found';
  end if;

  update public.staff_sessions
  set revoked_at = now()
  where staff_id = p_staff_id
    and session_token <> trim(p_session_token)
    and revoked_at is null;

  return public.get_admin_control_center(p_session_token);
end;
$$;

grant execute on function public.reset_admin_staff_pin(text, uuid, text) to anon, authenticated;

create or replace function public.revoke_admin_staff_session(
  p_session_token text,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.staff%rowtype;
  v_stall_id uuid;
  v_target public.staff_sessions%rowtype;
begin
  select *
  into v_admin
  from public.require_admin_staff_session(p_session_token);

  v_stall_id := public.require_staff_primary_stall(v_admin.id);
  perform public.require_staff_stall_access(v_admin.id, v_stall_id);

  if p_session_id is null then
    raise exception 'Session not found';
  end if;

  select ss.*
  into v_target
  from public.staff_sessions ss
  inner join public.staff s
    on s.id = ss.staff_id
  where ss.id = p_session_id
    and ss.revoked_at is null
    and ss.expires_at > now()
    and (
      s.stall_id = v_stall_id
      or exists (
        select 1
        from public.staff_stall_access ssa
        where ssa.staff_id = s.id
          and ssa.stall_id = v_stall_id
      )
    )
  for update;

  if not found then
    raise exception 'Session not found';
  end if;

  if v_target.session_token = trim(p_session_token) then
    raise exception 'Use logout to end your current admin session';
  end if;

  update public.staff_sessions
  set revoked_at = now()
  where id = p_session_id;

  return public.get_admin_control_center(p_session_token);
end;
$$;

grant execute on function public.revoke_admin_staff_session(text, uuid) to anon, authenticated;

create or replace function public.export_admin_backup(
  p_session_token text,
  p_table_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.staff%rowtype;
  v_stall_id uuid;
  v_table_name text := lower(coalesce(nullif(trim(p_table_name), ''), ''));
  v_rows jsonb := '[]'::jsonb;
begin
  select *
  into v_admin
  from public.require_admin_staff_session(p_session_token);

  v_stall_id := public.require_staff_primary_stall(v_admin.id);
  perform public.require_staff_stall_access(v_admin.id, v_stall_id);

  if v_table_name = 'products' then
    select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
    into v_rows
    from (
      select *
      from public.products
      order by product_name, id
    ) row_data;
  elsif v_table_name = 'sales' then
    select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
    into v_rows
    from (
      select *
      from public.sales
      where stall_id = v_stall_id
      order by created_at desc, id desc
    ) row_data;
  elsif v_table_name = 'sale_items' then
    select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
    into v_rows
    from (
      select si.*
      from public.sale_items si
      inner join public.sales s
        on s.id = si.sale_id
      where s.stall_id = v_stall_id
      order by s.created_at desc, si.id desc
    ) row_data;
  elsif v_table_name = 'waste_logs' then
    select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
    into v_rows
    from (
      select *
      from public.waste_logs
      where stall_id = v_stall_id
      order by created_at desc, id desc
    ) row_data;
  elsif v_table_name = 'closing_stock_counts' then
    select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
    into v_rows
    from (
      select *
      from public.closing_stock_counts
      where stall_id = v_stall_id
      order by business_date desc, created_at desc, id desc
    ) row_data;
  elsif v_table_name = 'payment_reconciliations' then
    select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
    into v_rows
    from (
      select *
      from public.payment_reconciliations
      where stall_id = v_stall_id
      order by business_date desc, created_at desc, id desc
    ) row_data;
  elsif v_table_name = 'staff' then
    select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
    into v_rows
    from (
      select
        s.id,
        s.full_name,
        s.role,
        coalesce(s.active, true) as active,
        s.stall_id
      from public.staff s
      where s.stall_id = v_stall_id
         or exists (
           select 1
           from public.staff_stall_access ssa
           where ssa.staff_id = s.id
             and ssa.stall_id = v_stall_id
         )
      order by s.full_name nulls last, s.id
    ) row_data;
  else
    raise exception 'Backup table is not allowed';
  end if;

  return v_rows;
end;
$$;

grant execute on function public.export_admin_backup(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
