create or replace function public.get_staff_dashboard_snapshot(
  p_stall_id uuid,
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_business_date date := public.get_current_business_date();
  v_day_start timestamptz := (v_business_date::timestamp at time zone 'Africa/Nairobi');
  v_day_end timestamptz := ((v_business_date + 1)::timestamp at time zone 'Africa/Nairobi');
  v_today_sales numeric := 0;
  v_transaction_count integer := 0;
  v_waste_logged integer := 0;
  v_total_waste_quantity numeric := 0;
begin
  if p_stall_id is null then
    raise exception 'Could not find stall';
  end if;

  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  perform public.require_staff_stall_access(v_staff.id, p_stall_id);

  select
    coalesce(sum(total_amount), 0),
    count(*)
  into
    v_today_sales,
    v_transaction_count
  from public.sales
  where stall_id = p_stall_id
    and created_at >= v_day_start
    and created_at < v_day_end;

  select
    count(*),
    coalesce(sum(coalesce(quantity, 0)), 0)
  into
    v_waste_logged,
    v_total_waste_quantity
  from public.waste_logs
  where stall_id = p_stall_id
    and created_at >= v_day_start
    and created_at < v_day_end;

  return jsonb_build_object(
    'business_date', v_business_date,
    'today_sales', v_today_sales,
    'transaction_count', v_transaction_count,
    'waste_logged', v_waste_logged,
    'total_waste_quantity', v_total_waste_quantity
  );
end;
$$;

grant execute on function public.get_staff_dashboard_snapshot(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
