create table if not exists public.stalls (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stalls
add column if not exists name text;

alter table public.stalls
alter column name set default 'Main Stall';

update public.stalls
set name = coalesce(nullif(trim(name), ''), 'Main Stall')
where name is null
   or trim(name) = '';

alter table public.stalls
alter column name set not null;

alter table public.stalls
add column if not exists created_at timestamptz not null default now();

alter table public.stalls
add column if not exists updated_at timestamptz not null default now();

alter table public.staff
add column if not exists stall_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'staff_stall_id_fkey'
      and conrelid = 'public.staff'::regclass
  ) then
    alter table public.staff
    add constraint staff_stall_id_fkey
    foreign key (stall_id)
    references public.stalls(id)
    on delete set null;
  end if;
end
$$;

create index if not exists staff_stall_id_idx
  on public.staff (stall_id);

create table if not exists public.staff_stall_access (
  staff_id uuid not null references public.staff(id) on delete cascade,
  stall_id uuid not null references public.stalls(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id, stall_id)
);

create index if not exists staff_stall_access_stall_id_idx
  on public.staff_stall_access (stall_id);

do $$
declare
  v_default_stall_id uuid;
begin
  if not exists (
    select 1
    from public.stalls
  ) then
    insert into public.stalls (name)
    values ('Main Stall')
    returning id into v_default_stall_id;
  else
    select id
    into v_default_stall_id
    from public.stalls
    order by created_at, id
    limit 1;
  end if;

  update public.staff s
  set stall_id = coalesce(
    s.stall_id,
    (
      select ssa.stall_id
      from public.staff_stall_access ssa
      where ssa.staff_id = s.id
      order by ssa.created_at, ssa.stall_id
      limit 1
    ),
    v_default_stall_id
  )
  where s.stall_id is null;

  insert into public.staff_stall_access (staff_id, stall_id)
  select
    s.id,
    s.stall_id
  from public.staff s
  where s.stall_id is not null
  on conflict (staff_id, stall_id) do nothing;
end
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

  if exists (
    select 1
    from public.staff
    where id = p_staff_id
      and stall_id = p_stall_id
  ) then
    return;
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

create or replace function public.require_staff_primary_stall(
  p_staff_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stall_id uuid;
  v_stall_count integer := 0;
begin
  select stall_id
  into v_stall_id
  from public.staff
  where id = p_staff_id
    and stall_id is not null;

  if v_stall_id is not null then
    return v_stall_id;
  end if;

  select stall_id
  into v_stall_id
  from public.staff_stall_access
  where staff_id = p_staff_id
  order by created_at, stall_id
  limit 1;

  if v_stall_id is not null then
    return v_stall_id;
  end if;

  select count(*)
  into v_stall_count
  from public.stalls;

  if v_stall_count = 1 then
    select id
    into v_stall_id
    from public.stalls
    order by created_at, id
    limit 1;

    return v_stall_id;
  end if;

  raise exception 'Staff has no assigned stall';
end;
$$;

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

  v_stall_id := public.require_staff_primary_stall(v_staff.id);

  return jsonb_build_object('id', v_stall_id);
end;
$$;

grant execute on function public.get_staff_stall(text) to anon, authenticated;

notify pgrst, 'reload schema';

select
  count(*) as stall_count
from public.stalls;

select
  id,
  name,
  created_at
from public.stalls
order by created_at, id;

select
  count(*) as staff_count,
  count(*) filter (where stall_id is not null) as staff_with_stall_id
from public.staff;

select
  s.id as staff_id,
  s.full_name,
  s.stall_id,
  st.name as stall_name
from public.staff s
left join public.stalls st
  on st.id = s.stall_id
order by s.full_name nulls last, s.id
limit 20;

select
  count(*) as staff_stall_access_rows
from public.staff_stall_access;
