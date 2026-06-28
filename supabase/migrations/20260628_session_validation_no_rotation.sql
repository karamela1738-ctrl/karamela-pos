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

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
