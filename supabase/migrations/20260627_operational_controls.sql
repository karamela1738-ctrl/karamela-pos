alter table public.inventory_movements
add column if not exists actor_staff_id uuid;

alter table public.inventory_movements
add column if not exists created_at timestamptz not null default now();

alter table public.inventory_movements
add column if not exists reference_id uuid;

alter table public.closing_stock_counts
add column if not exists submitted_by_staff_id uuid;

alter table public.payment_reconciliations
add column if not exists recorded_by_staff_id uuid;

create index if not exists inventory_movements_actor_staff_id_idx
  on public.inventory_movements (actor_staff_id, created_at desc);

create index if not exists closing_stock_counts_stall_date_idx
  on public.closing_stock_counts (stall_id, business_date);

create index if not exists payment_reconciliations_stall_date_idx
  on public.payment_reconciliations (stall_id, business_date);

create index if not exists sales_stall_created_at_idx
  on public.sales (stall_id, created_at desc);

create or replace function public.get_current_business_date()
returns date
language sql
stable
set search_path = public
as $$
  select timezone('Africa/Nairobi', now())::date;
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
    order by id
    limit 1;

    return v_stall_id;
  end if;

  raise exception 'Staff has no assigned stall';
end;
$$;

create or replace function public.get_business_day_status(
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
  v_business_date date := public.get_current_business_date();
  v_total_products integer := 0;
  v_counted_products integer := 0;
  v_closing_complete boolean := false;
  v_reconciliation_complete boolean := false;
  v_latest_variance numeric := 0;
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  v_stall_id := public.require_staff_primary_stall(v_staff.id);
  perform public.require_staff_stall_access(v_staff.id, v_stall_id);

  select count(*)
  into v_total_products
  from public.products;

  select count(distinct product_id)
  into v_counted_products
  from public.closing_stock_counts
  where stall_id = v_stall_id
    and business_date = v_business_date;

  v_closing_complete := v_total_products = 0 or v_counted_products >= v_total_products;

  select exists(
    select 1
    from public.payment_reconciliations
    where stall_id = v_stall_id
      and business_date = v_business_date
  )
  into v_reconciliation_complete;

  select coalesce(variance, 0)
  into v_latest_variance
  from public.payment_reconciliations
  where stall_id = v_stall_id
    and business_date = v_business_date
  order by created_at desc
  limit 1;

  return jsonb_build_object(
    'stall_id', v_stall_id,
    'business_date', v_business_date,
    'total_products', v_total_products,
    'counted_products', v_counted_products,
    'closing_stock_complete', v_closing_complete,
    'reconciliation_complete', v_reconciliation_complete,
    'can_end_shift', v_closing_complete and v_reconciliation_complete,
    'reconciliation_variance', v_latest_variance
  );
end;
$$;

grant execute on function public.get_business_day_status(text) to anon, authenticated;

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

  select coalesce(sum(value_amount), 0)
  into v_today_waste
  from public.waste_logs
  where stall_id = v_stall_id
    and created_at >= v_day_start
    and created_at < v_day_end;

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

create or replace function public.get_inventory_movements_audit(
  p_session_token text,
  p_limit integer default 100
)
returns table (
  movement_id uuid,
  created_at timestamptz,
  business_date date,
  movement_type text,
  product_id uuid,
  product_name text,
  quantity numeric,
  staff_id uuid,
  staff_name text,
  reference_id uuid,
  notes text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_stall_id uuid;
  v_limit integer := greatest(coalesce(p_limit, 100), 1);
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  v_stall_id := public.require_staff_primary_stall(v_staff.id);
  perform public.require_staff_stall_access(v_staff.id, v_stall_id);

  return query
  with movement_rows as (
    select
      im.id as movement_id,
      im.created_at,
      timezone('Africa/Nairobi', im.created_at)::date as business_date,
      im.movement_type,
      im.product_id,
      coalesce(p.product_name, 'Unknown Product') as product_name,
      im.quantity::numeric as quantity,
      coalesce(im.actor_staff_id, s.cashier_id) as staff_id,
      im.reference_id,
      im.notes
    from public.inventory_movements im
    left join public.products p
      on p.id = im.product_id
    left join public.sales s
      on im.movement_type = 'sale'
     and im.reference_id = s.id
    where im.stall_id = v_stall_id
  )
  select
    mr.movement_id,
    mr.created_at,
    mr.business_date,
    mr.movement_type,
    mr.product_id,
    mr.product_name,
    mr.quantity,
    mr.staff_id,
    coalesce(nullif(trim(st.full_name), ''), 'Unknown Staff') as staff_name,
    mr.reference_id,
    mr.notes
  from movement_rows mr
  left join public.staff st
    on st.id = mr.staff_id
  order by mr.created_at desc, mr.movement_id desc
  limit v_limit;
end;
$$;

grant execute on function public.get_inventory_movements_audit(text, integer) to anon, authenticated;

create or replace function public.get_staff_activity_feed(
  p_session_token text,
  p_limit integer default 200
)
returns table (
  activity_id text,
  activity_type text,
  description text,
  amount numeric,
  staff_name text,
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
  v_limit integer := greatest(coalesce(p_limit, 200), 1);
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  v_stall_id := public.require_staff_primary_stall(v_staff.id);
  perform public.require_staff_stall_access(v_staff.id, v_stall_id);

  return query
  with activity_rows as (
    select
      'sale:' || s.id::text as activity_id,
      'Sale'::text as activity_type,
      format('%s sale completed', initcap(coalesce(s.payment_method, 'cash'))) as description,
      s.total_amount::numeric as amount,
      coalesce(nullif(trim(st.full_name), ''), 'Unknown Staff') as staff_name,
      s.created_at,
      timezone('Africa/Nairobi', s.created_at)::date as business_date
    from public.sales s
    left join public.staff st
      on st.id = s.cashier_id
    where s.stall_id = v_stall_id

    union all

    select
      'waste:' || w.id::text,
      'Waste',
      format(
        '%s item(s) recorded as %s for %s',
        w.quantity,
        w.reason,
        coalesce(p.product_name, 'Unknown Product')
      ),
      w.value_amount::numeric,
      coalesce(nullif(trim(st.full_name), ''), 'Unknown Staff'),
      w.created_at,
      timezone('Africa/Nairobi', w.created_at)::date
    from public.waste_logs w
    left join public.products p
      on p.id = w.product_id
    left join public.inventory_movements im
      on im.reference_id = w.id
     and im.movement_type = 'waste'
    left join public.staff st
      on st.id = im.actor_staff_id
    where w.stall_id = v_stall_id

    union all

    select
      'closing:' || c.id::text,
      'Closing Stock',
      format(
        'Closing stock submitted for %s on %s',
        coalesce(p.product_name, 'Unknown Product'),
        c.business_date
      ),
      null::numeric,
      coalesce(nullif(trim(st.full_name), ''), 'Unknown Staff'),
      c.created_at,
      c.business_date
    from public.closing_stock_counts c
    left join public.products p
      on p.id = c.product_id
    left join public.staff st
      on st.id = c.submitted_by_staff_id
    where c.stall_id = v_stall_id

    union all

    select
      'recon:' || r.id::text,
      'Reconciliation',
      format('Payment reconciliation completed for %s', r.business_date),
      r.variance::numeric,
      coalesce(nullif(trim(st.full_name), ''), 'Unknown Staff'),
      r.created_at,
      r.business_date
    from public.payment_reconciliations r
    left join public.staff st
      on st.id = r.recorded_by_staff_id
    where r.stall_id = v_stall_id

    union all

    select
      'shift:' || sh.id::text,
      'Shift',
      coalesce(sh.action, 'Shift activity'),
      null::numeric,
      coalesce(nullif(trim(st.full_name), ''), 'Unknown Staff'),
      sh.created_at,
      timezone('Africa/Nairobi', sh.created_at)::date
    from public.shift_logs sh
    left join public.staff st
      on st.id = sh.staff_id
    left join public.staff_stall_access ssa
      on ssa.staff_id = sh.staff_id
    where ssa.stall_id = v_stall_id
  )
  select
    ar.activity_id,
    ar.activity_type,
    ar.description,
    ar.amount,
    ar.staff_name,
    ar.created_at,
    ar.business_date
  from activity_rows ar
  order by ar.created_at desc, ar.activity_id desc
  limit v_limit;
end;
$$;

grant execute on function public.get_staff_activity_feed(text, integer) to anon, authenticated;

create or replace function public.complete_sale(
  p_stall_id uuid,
  p_payment_method text,
  p_amount_paid numeric,
  p_staff_name text,
  p_items jsonb,
  p_client_reference text,
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_sale sales%rowtype;
  v_product products%rowtype;
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_quantity integer;
  v_amount_paid numeric := coalesce(p_amount_paid, 0);
  v_staff_name text := 'staff';
  v_client_reference text := nullif(trim(p_client_reference), '');
  v_payment_method text := lower(coalesce(nullif(trim(p_payment_method), ''), 'cash'));
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  v_staff_name := coalesce(nullif(trim(v_staff.full_name), ''), 'staff');

  perform public.require_staff_stall_access(v_staff.id, p_stall_id);

  if v_client_reference is null then
    raise exception 'Sale reference is missing';
  end if;

  if v_payment_method not in ('cash', 'mpesa', 'card') then
    raise exception 'Select a valid payment method';
  end if;

  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0
  then
    raise exception 'Cart is empty';
  end if;

  insert into public.sales (
    stall_id,
    cashier_id,
    total_amount,
    payment_method,
    amount_paid,
    change_amount,
    client_reference
  )
  values (
    p_stall_id,
    v_staff.id,
    0,
    v_payment_method,
    0,
    0,
    v_client_reference
  )
  on conflict (stall_id, client_reference)
    where client_reference is not null
  do nothing
  returning * into v_sale;

  if found then
    for v_item in
      select value from jsonb_array_elements(p_items)
    loop
      v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);

      if v_quantity <= 0 then
        raise exception 'Sale quantity must be greater than zero';
      end if;

      select *
      into v_product
      from public.products
      where id = (v_item ->> 'product_id')::uuid
      for update;

      if not found then
        raise exception 'Product % not found', v_item ->> 'product_id';
      end if;

      if coalesce(v_product.stock_qty, 0) < v_quantity then
        raise exception 'Insufficient stock for %', v_product.product_name;
      end if;

      v_total := v_total + (v_quantity * coalesce(v_product.selling_price, 0));

      insert into public.sale_items (
        sale_id,
        product_id,
        product_name,
        quantity,
        unit_price,
        cost_price,
        subtotal
      )
      values (
        v_sale.id,
        v_product.id,
        v_product.product_name,
        v_quantity,
        coalesce(v_product.selling_price, 0),
        coalesce(v_product.cost_price, 0),
        v_quantity * coalesce(v_product.selling_price, 0)
      );

      insert into public.inventory_movements (
        stall_id,
        product_id,
        movement_type,
        quantity,
        reference_id,
        actor_staff_id,
        notes
      )
      values (
        p_stall_id,
        v_product.id,
        'sale',
        -v_quantity,
        v_sale.id,
        v_staff.id,
        format('Sold by %s', v_staff_name)
      );

      update public.products
      set stock_qty = coalesce(stock_qty, 0) - v_quantity
      where id = v_product.id;

      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'product_name', v_product.product_name,
          'quantity', v_quantity,
          'unit_price', coalesce(v_product.selling_price, 0),
          'subtotal', v_quantity * coalesce(v_product.selling_price, 0)
        )
      );
    end loop;

    if v_amount_paid <= 0 then
      v_amount_paid := v_total;
    end if;

    if v_amount_paid < v_total then
      raise exception 'Amount paid cannot be less than the sale total';
    end if;

    update public.sales
    set
      total_amount = v_total,
      amount_paid = v_amount_paid,
      change_amount = greatest(v_amount_paid - v_total, 0)
    where id = v_sale.id
    returning * into v_sale;
  else
    select *
    into v_sale
    from public.sales
    where stall_id = p_stall_id
      and client_reference = v_client_reference;

    if not found then
      raise exception 'Could not load existing sale';
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'product_name', product_name,
          'quantity', quantity,
          'unit_price', unit_price,
          'subtotal', subtotal
        )
      ),
      '[]'::jsonb
    )
    into v_items
    from public.sale_items
    where sale_id = v_sale.id;
  end if;

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'total', v_sale.total_amount,
    'payment_method', v_sale.payment_method,
    'amount_paid', v_sale.amount_paid,
    'change_amount', v_sale.change_amount,
    'items', v_items,
    'created_at', v_sale.created_at
  );
end;
$$;

create or replace function public.restock_product(
  p_stall_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_notes text default null,
  p_session_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_product public.products%rowtype;
  v_previous_stock numeric := 0;
  v_new_stock numeric := 0;
  v_notes text;
  v_staff_role text := 'staff';
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  v_staff_role := lower(coalesce(nullif(trim(v_staff.role), ''), 'staff'));

  if v_staff_role not in ('admin', 'manager', 'owner') then
    raise exception 'You do not have permission to restock products';
  end if;

  perform public.require_staff_stall_access(v_staff.id, p_stall_id);

  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'Enter quantity received';
  end if;

  select *
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found';
  end if;

  v_previous_stock := coalesce(v_product.stock_qty, 0);
  v_new_stock := v_previous_stock + p_quantity;
  v_notes := coalesce(
    nullif(trim(p_notes), ''),
    format(
      'Stock added by %s. Previous stock %s, new stock %s',
      coalesce(nullif(trim(v_staff.full_name), ''), 'staff'),
      v_previous_stock,
      v_new_stock
    )
  );

  update public.products
  set stock_qty = v_new_stock
  where id = p_product_id;

  insert into public.inventory_movements (
    stall_id,
    product_id,
    movement_type,
    quantity,
    actor_staff_id,
    notes
  )
  values (
    p_stall_id,
    p_product_id,
    'restock',
    p_quantity,
    v_staff.id,
    v_notes
  );

  return jsonb_build_object(
    'product_id', p_product_id,
    'previous_stock', v_previous_stock,
    'new_stock', v_new_stock,
    'quantity', p_quantity,
    'notes', v_notes
  );
end;
$$;

create or replace function public.record_waste(
  p_stall_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_reason text,
  p_notes text default null,
  p_session_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_product public.products%rowtype;
  v_new_stock numeric := 0;
  v_value_amount numeric := 0;
  v_waste_id public.waste_logs.id%type;
  v_notes text := coalesce(nullif(trim(p_notes), ''), 'No notes');
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'other');
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  perform public.require_staff_stall_access(v_staff.id, p_stall_id);

  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'Select product and enter quantity';
  end if;

  select *
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found';
  end if;

  if coalesce(v_product.stock_qty, 0) < p_quantity then
    raise exception 'Insufficient stock for %', v_product.product_name;
  end if;

  v_value_amount := p_quantity * coalesce(v_product.selling_price, 0);
  v_new_stock := coalesce(v_product.stock_qty, 0) - p_quantity;

  insert into public.waste_logs (
    stall_id,
    product_id,
    quantity,
    reason,
    value_amount,
    notes
  )
  values (
    p_stall_id,
    p_product_id,
    p_quantity,
    v_reason,
    v_value_amount,
    nullif(trim(p_notes), '')
  )
  returning id into v_waste_id;

  insert into public.inventory_movements (
    stall_id,
    product_id,
    movement_type,
    quantity,
    reference_id,
    actor_staff_id,
    notes
  )
  values (
    p_stall_id,
    p_product_id,
    'waste',
    -p_quantity,
    v_waste_id,
    v_staff.id,
    format(
      '%s by %s: %s',
      v_reason,
      coalesce(nullif(trim(v_staff.full_name), ''), 'staff'),
      v_notes
    )
  );

  update public.products
  set stock_qty = v_new_stock
  where id = p_product_id;

  return jsonb_build_object(
    'waste_id', v_waste_id,
    'product_id', p_product_id,
    'quantity', p_quantity,
    'reason', v_reason,
    'value_amount', v_value_amount,
    'new_stock', v_new_stock
  );
end;
$$;

create or replace function public.submit_closing_stock(
  p_stall_id uuid,
  p_business_date date,
  p_counts jsonb,
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_product public.products%rowtype;
  v_count public.closing_stock_counts%rowtype;
  v_entry jsonb;
  v_expected numeric := 0;
  v_actual numeric := 0;
  v_processed integer := 0;
  v_variance_count integer := 0;
  v_business_date date := coalesce(p_business_date, public.get_current_business_date());
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  perform public.require_staff_stall_access(v_staff.id, p_stall_id);

  if v_business_date <> public.get_current_business_date() then
    raise exception 'Closing stock must be submitted for the current business date';
  end if;

  if exists (
    select 1
    from public.closing_stock_counts
    where stall_id = p_stall_id
      and business_date = v_business_date
  ) then
    raise exception 'Closing stock has already been submitted for %', v_business_date;
  end if;

  if p_counts is null
    or jsonb_typeof(p_counts) <> 'array'
    or jsonb_array_length(p_counts) = 0
  then
    raise exception 'Enter at least one product count';
  end if;

  for v_entry in
    select value from jsonb_array_elements(p_counts)
  loop
    v_actual := coalesce((v_entry ->> 'actual_quantity')::numeric, 0);

    if v_actual < 0 then
      raise exception 'Actual quantity cannot be negative';
    end if;

    select *
    into v_product
    from public.products
    where id = (v_entry ->> 'product_id')::uuid
    for update;

    if not found then
      raise exception 'Product % not found', v_entry ->> 'product_id';
    end if;

    v_expected := coalesce(v_product.stock_qty, 0);

    insert into public.closing_stock_counts (
      stall_id,
      product_id,
      business_date,
      expected_quantity,
      actual_quantity,
      notes,
      submitted_by_staff_id
    )
    values (
      p_stall_id,
      v_product.id,
      v_business_date,
      v_expected,
      v_actual,
      nullif(trim(v_entry ->> 'notes'), ''),
      v_staff.id
    )
    returning * into v_count;

    if v_actual <> v_expected then
      insert into public.inventory_movements (
        stall_id,
        product_id,
        movement_type,
        quantity,
        reference_id,
        actor_staff_id,
        notes
      )
      values (
        p_stall_id,
        v_product.id,
        'closing_variance',
        v_actual - v_expected,
        v_count.id,
        v_staff.id,
        format(
          'Closing variance by %s. Expected %s, actual %s',
          coalesce(nullif(trim(v_staff.full_name), ''), 'staff'),
          v_expected,
          v_actual
        )
      );

      v_variance_count := v_variance_count + 1;
    end if;

    update public.products
    set stock_qty = v_actual
    where id = v_product.id;

    v_processed := v_processed + 1;
  end loop;

  return jsonb_build_object(
    'business_date', v_business_date,
    'processed_count', v_processed,
    'variance_count', v_variance_count
  );
end;
$$;

create or replace function public.save_payment_reconciliation(
  p_stall_id uuid,
  p_business_date date,
  p_cash_counted numeric,
  p_mpesa_confirmed numeric,
  p_card_confirmed numeric,
  p_notes text default null,
  p_session_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_record public.payment_reconciliations%rowtype;
  v_cash_expected numeric := 0;
  v_mpesa_expected numeric := 0;
  v_card_expected numeric := 0;
  v_staff_role text := 'staff';
  v_business_date date := coalesce(p_business_date, public.get_current_business_date());
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  v_staff_role := lower(coalesce(nullif(trim(v_staff.role), ''), 'staff'));

  if v_staff_role not in ('admin', 'manager', 'owner') then
    raise exception 'You do not have permission to reconcile payments';
  end if;

  perform public.require_staff_stall_access(v_staff.id, p_stall_id);

  if v_business_date <> public.get_current_business_date() then
    raise exception 'Reconciliation must be saved for the current business date';
  end if;

  if exists (
    select 1
    from public.payment_reconciliations
    where stall_id = p_stall_id
      and business_date = v_business_date
  ) then
    raise exception 'Reconciliation has already been saved for %', v_business_date;
  end if;

  v_day_start := (v_business_date::timestamp at time zone 'Africa/Nairobi');
  v_day_end := ((v_business_date + 1)::timestamp at time zone 'Africa/Nairobi');

  select
    coalesce(sum(total_amount) filter (where lower(coalesce(payment_method, '')) = 'cash'), 0),
    coalesce(sum(total_amount) filter (where lower(coalesce(payment_method, '')) = 'mpesa'), 0),
    coalesce(sum(total_amount) filter (where lower(coalesce(payment_method, '')) = 'card'), 0)
  into
    v_cash_expected,
    v_mpesa_expected,
    v_card_expected
  from public.sales
  where stall_id = p_stall_id
    and created_at >= v_day_start
    and created_at < v_day_end;

  insert into public.payment_reconciliations (
    stall_id,
    business_date,
    cash_expected,
    cash_counted,
    mpesa_expected,
    mpesa_confirmed,
    card_expected,
    card_confirmed,
    notes,
    recorded_by_staff_id
  )
  values (
    p_stall_id,
    v_business_date,
    v_cash_expected,
    coalesce(p_cash_counted, 0),
    v_mpesa_expected,
    coalesce(p_mpesa_confirmed, 0),
    v_card_expected,
    coalesce(p_card_confirmed, 0),
    coalesce(
      nullif(trim(p_notes), ''),
      format(
        'Reconciled by %s',
        coalesce(nullif(trim(v_staff.full_name), ''), 'staff')
      )
    ),
    v_staff.id
  )
  returning * into v_record;

  return jsonb_build_object(
    'business_date', v_record.business_date,
    'cash_expected', v_record.cash_expected,
    'cash_counted', v_record.cash_counted,
    'mpesa_expected', v_record.mpesa_expected,
    'mpesa_confirmed', v_record.mpesa_confirmed,
    'card_expected', v_record.card_expected,
    'card_confirmed', v_record.card_confirmed,
    'variance', v_record.variance,
    'notes', v_record.notes
  );
end;
$$;

create or replace function public.end_shift(
  p_action text,
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
  v_status jsonb;
  v_created_at timestamptz := now();
  v_action text := coalesce(nullif(trim(p_action), ''), 'shift_closed');
  v_total_products integer := 0;
  v_counted_products integer := 0;
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  v_stall_id := public.require_staff_primary_stall(v_staff.id);
  perform public.require_staff_stall_access(v_staff.id, v_stall_id);

  v_status := public.get_business_day_status(p_session_token);
  v_total_products := coalesce((v_status ->> 'total_products')::integer, 0);
  v_counted_products := coalesce((v_status ->> 'counted_products')::integer, 0);

  if not coalesce((v_status ->> 'closing_stock_complete')::boolean, false) then
    raise exception 'Closing stock is incomplete for % (% of % products counted)',
      v_status ->> 'business_date',
      v_counted_products,
      v_total_products;
  end if;

  if not coalesce((v_status ->> 'reconciliation_complete')::boolean, false) then
    raise exception 'Payment reconciliation is missing for %', v_status ->> 'business_date';
  end if;

  insert into public.shift_logs (
    staff_id,
    action,
    created_at
  )
  values (
    v_staff.id,
    v_action,
    v_created_at
  );

  return jsonb_build_object(
    'staff_id', v_staff.id,
    'stall_id', v_stall_id,
    'business_date', v_status ->> 'business_date',
    'action', v_action,
    'created_at', v_created_at
  );
end;
$$;

notify pgrst, 'reload schema';
