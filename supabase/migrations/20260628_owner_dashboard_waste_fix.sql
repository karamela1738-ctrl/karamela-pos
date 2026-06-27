create or replace function public.get_owner_dashboard_snapshot(
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status jsonb;
  v_stall_id uuid;
  v_business_date date;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_today_sales numeric := 0;
  v_today_waste numeric := 0;
  v_inventory_value numeric := 0;
  v_low_stock_count integer := 0;
begin
  v_status := public.get_business_day_status(p_session_token);
  v_stall_id := (v_status ->> 'stall_id')::uuid;
  v_business_date := (v_status ->> 'business_date')::date;
  v_day_start := (v_business_date::timestamp at time zone 'Africa/Nairobi');
  v_day_end := ((v_business_date + 1)::timestamp at time zone 'Africa/Nairobi');

  select coalesce(sum(total_amount), 0)
  into v_today_sales
  from public.sales
  where stall_id = v_stall_id
    and created_at >= v_day_start
    and created_at < v_day_end;

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

  select
    coalesce(sum(coalesce(stock_qty, 0) * coalesce(cost_price, 0)), 0),
    count(*) filter (
      where coalesce(stock_qty, 0) > 0
        and coalesce(stock_qty, 0) <= coalesce(reorder_level, 5)
    )
  into
    v_inventory_value,
    v_low_stock_count
  from public.products;

  return v_status || jsonb_build_object(
    'today_sales', v_today_sales,
    'today_waste', v_today_waste,
    'inventory_value', v_inventory_value,
    'low_stock_count', v_low_stock_count
  );
end;
$$;

grant execute on function public.get_owner_dashboard_snapshot(text) to anon, authenticated;

notify pgrst, 'reload schema';
