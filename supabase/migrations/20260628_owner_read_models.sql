create or replace function public.resolve_dashboard_period(
  p_period text default 'today'
)
returns table (
  period_key text,
  start_business_date date,
  end_business_date date,
  start_at timestamptz,
  end_at timestamptz,
  is_all boolean
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_period text := lower(coalesce(nullif(trim(p_period), ''), 'today'));
  v_end_business_date date := public.get_current_business_date();
  v_start_business_date date;
begin
  if v_period = 'all' then
    return query
    select
      v_period,
      null::date,
      v_end_business_date,
      null::timestamptz,
      null::timestamptz,
      true;
    return;
  end if;

  if v_period = 'today' then
    v_start_business_date := v_end_business_date;
  elsif v_period = '7days' then
    v_start_business_date := v_end_business_date - 6;
  elsif v_period = '30days' then
    v_start_business_date := v_end_business_date - 29;
  else
    raise exception 'Invalid dashboard period';
  end if;

  return query
  select
    v_period,
    v_start_business_date,
    v_end_business_date,
    (v_start_business_date::timestamp at time zone 'Africa/Nairobi'),
    ((v_end_business_date + 1)::timestamp at time zone 'Africa/Nairobi'),
    false;
end;
$$;

grant execute on function public.resolve_dashboard_period(text) to anon, authenticated;

create or replace function public.get_owner_waste_rows(
  p_session_token text,
  p_period text default 'today'
)
returns table (
  waste_id uuid,
  product_id uuid,
  product_name text,
  category text,
  quantity numeric,
  reason text,
  value_amount numeric,
  effective_value numeric,
  notes text,
  created_at timestamptz,
  business_date date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_stall_id uuid;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_is_all boolean := false;
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  v_stall_id := public.require_staff_primary_stall(v_staff.id);
  perform public.require_staff_stall_access(v_staff.id, v_stall_id);

  select
    period.start_at,
    period.end_at,
    period.is_all
  into
    v_start_at,
    v_end_at,
    v_is_all
  from public.resolve_dashboard_period(p_period) period;

  return query
  select
    w.id as waste_id,
    w.product_id,
    coalesce(p.product_name, 'Unknown Product') as product_name,
    p.category,
    coalesce(w.quantity, 0)::numeric as quantity,
    coalesce(w.reason, 'other') as reason,
    coalesce(w.value_amount, 0)::numeric as value_amount,
    coalesce(
      nullif(w.value_amount, 0),
      coalesce(w.quantity, 0) * coalesce(p.selling_price, p.cost_price, 0),
      0
    )::numeric as effective_value,
    w.notes,
    w.created_at,
    timezone('Africa/Nairobi', w.created_at)::date as business_date
  from public.waste_logs w
  left join public.products p
    on p.id = w.product_id
  where w.stall_id = v_stall_id
    and (
      v_is_all
      or (
        w.created_at >= v_start_at
        and w.created_at < v_end_at
      )
    )
  order by w.created_at desc, w.id desc;
end;
$$;

grant execute on function public.get_owner_waste_rows(text, text) to anon, authenticated;

create or replace function public.get_owner_sales_rows(
  p_session_token text,
  p_period text default 'today'
)
returns table (
  sale_id uuid,
  total_amount numeric,
  payment_method text,
  created_at timestamptz,
  business_date date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_stall_id uuid;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_is_all boolean := false;
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  v_stall_id := public.require_staff_primary_stall(v_staff.id);
  perform public.require_staff_stall_access(v_staff.id, v_stall_id);

  select
    period.start_at,
    period.end_at,
    period.is_all
  into
    v_start_at,
    v_end_at,
    v_is_all
  from public.resolve_dashboard_period(p_period) period;

  return query
  select
    s.id as sale_id,
    coalesce(s.total_amount, 0)::numeric as total_amount,
    coalesce(s.payment_method, 'cash') as payment_method,
    s.created_at,
    timezone('Africa/Nairobi', s.created_at)::date as business_date
  from public.sales s
  where s.stall_id = v_stall_id
    and (
      v_is_all
      or (
        s.created_at >= v_start_at
        and s.created_at < v_end_at
      )
    )
  order by s.created_at desc, s.id desc;
end;
$$;

grant execute on function public.get_owner_sales_rows(text, text) to anon, authenticated;

create or replace function public.get_owner_sale_item_rows(
  p_session_token text,
  p_period text default 'today'
)
returns table (
  sale_item_id uuid,
  sale_id uuid,
  product_name text,
  quantity numeric,
  unit_price numeric,
  subtotal numeric,
  created_at timestamptz,
  business_date date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_stall_id uuid;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_is_all boolean := false;
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  v_stall_id := public.require_staff_primary_stall(v_staff.id);
  perform public.require_staff_stall_access(v_staff.id, v_stall_id);

  select
    period.start_at,
    period.end_at,
    period.is_all
  into
    v_start_at,
    v_end_at,
    v_is_all
  from public.resolve_dashboard_period(p_period) period;

  return query
  select
    si.id as sale_item_id,
    si.sale_id,
    coalesce(si.product_name, 'Unknown Product') as product_name,
    coalesce(si.quantity, 0)::numeric as quantity,
    coalesce(si.unit_price, 0)::numeric as unit_price,
    coalesce(si.subtotal, 0)::numeric as subtotal,
    s.created_at,
    timezone('Africa/Nairobi', s.created_at)::date as business_date
  from public.sale_items si
  inner join public.sales s
    on s.id = si.sale_id
  where s.stall_id = v_stall_id
    and (
      v_is_all
      or (
        s.created_at >= v_start_at
        and s.created_at < v_end_at
      )
    )
  order by s.created_at desc, si.product_name asc, si.id desc;
end;
$$;

grant execute on function public.get_owner_sale_item_rows(text, text) to anon, authenticated;

create or replace function public.get_owner_closing_stock_rows(
  p_session_token text,
  p_period text default 'today'
)
returns table (
  count_id uuid,
  product_id uuid,
  product_name text,
  business_date date,
  expected_quantity numeric,
  actual_quantity numeric,
  variance_quantity numeric,
  notes text,
  created_at timestamptz,
  selling_price numeric,
  cost_price numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_stall_id uuid;
  v_start_business_date date;
  v_end_business_date date;
  v_is_all boolean := false;
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  v_stall_id := public.require_staff_primary_stall(v_staff.id);
  perform public.require_staff_stall_access(v_staff.id, v_stall_id);

  select
    period.start_business_date,
    period.end_business_date,
    period.is_all
  into
    v_start_business_date,
    v_end_business_date,
    v_is_all
  from public.resolve_dashboard_period(p_period) period;

  return query
  select
    c.id as count_id,
    c.product_id,
    coalesce(p.product_name, 'Unknown Product') as product_name,
    c.business_date,
    coalesce(c.expected_quantity, 0)::numeric as expected_quantity,
    coalesce(c.actual_quantity, 0)::numeric as actual_quantity,
    coalesce(
      c.variance_quantity,
      coalesce(c.actual_quantity, 0) - coalesce(c.expected_quantity, 0)
    )::numeric as variance_quantity,
    c.notes,
    c.created_at,
    coalesce(p.selling_price, 0)::numeric as selling_price,
    coalesce(p.cost_price, 0)::numeric as cost_price
  from public.closing_stock_counts c
  left join public.products p
    on p.id = c.product_id
  where c.stall_id = v_stall_id
    and (
      v_is_all
      or (
        c.business_date >= v_start_business_date
        and c.business_date <= v_end_business_date
      )
    )
  order by c.business_date desc, c.created_at desc, c.id desc;
end;
$$;

grant execute on function public.get_owner_closing_stock_rows(text, text) to anon, authenticated;

create or replace function public.get_owner_reconciliation_rows(
  p_session_token text,
  p_period text default 'today'
)
returns table (
  reconciliation_id uuid,
  business_date date,
  cash_expected numeric,
  cash_counted numeric,
  mpesa_expected numeric,
  mpesa_confirmed numeric,
  card_expected numeric,
  card_confirmed numeric,
  variance numeric,
  notes text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_stall_id uuid;
  v_start_business_date date;
  v_end_business_date date;
  v_is_all boolean := false;
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  v_stall_id := public.require_staff_primary_stall(v_staff.id);
  perform public.require_staff_stall_access(v_staff.id, v_stall_id);

  select
    period.start_business_date,
    period.end_business_date,
    period.is_all
  into
    v_start_business_date,
    v_end_business_date,
    v_is_all
  from public.resolve_dashboard_period(p_period) period;

  return query
  select
    r.id as reconciliation_id,
    r.business_date,
    coalesce(r.cash_expected, 0)::numeric as cash_expected,
    coalesce(r.cash_counted, 0)::numeric as cash_counted,
    coalesce(r.mpesa_expected, 0)::numeric as mpesa_expected,
    coalesce(r.mpesa_confirmed, 0)::numeric as mpesa_confirmed,
    coalesce(r.card_expected, 0)::numeric as card_expected,
    coalesce(r.card_confirmed, 0)::numeric as card_confirmed,
    coalesce(r.variance, 0)::numeric as variance,
    r.notes,
    r.created_at
  from public.payment_reconciliations r
  where r.stall_id = v_stall_id
    and (
      v_is_all
      or (
        r.business_date >= v_start_business_date
        and r.business_date <= v_end_business_date
      )
    )
  order by r.business_date desc, r.created_at desc, r.id desc;
end;
$$;

grant execute on function public.get_owner_reconciliation_rows(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
