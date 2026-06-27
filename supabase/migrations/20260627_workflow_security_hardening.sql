drop function if exists public.complete_sale(uuid, text, numeric, text, jsonb);
drop function if exists public.complete_sale(uuid, text, numeric, text, jsonb, text);
drop function if exists public.restock_product(uuid, uuid, integer, text);
drop function if exists public.record_waste(uuid, uuid, integer, text, text);
drop function if exists public.submit_closing_stock(uuid, date, jsonb);
drop function if exists public.save_payment_reconciliation(uuid, date, numeric, numeric, numeric, text);
drop function if exists public.end_shift(text, uuid);
drop function if exists public.end_shift(text, text);

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
        notes
      )
      values (
        p_stall_id,
        v_product.id,
        'sale',
        -v_quantity,
        v_sale.id,
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

grant execute on function public.complete_sale(uuid, text, numeric, text, jsonb, text, text) to anon, authenticated;

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
    notes
  )
  values (
    p_stall_id,
    p_product_id,
    'restock',
    p_quantity,
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

grant execute on function public.restock_product(uuid, uuid, integer, text, text) to anon, authenticated;

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
    notes
  )
  values (
    p_stall_id,
    p_product_id,
    'waste',
    -p_quantity,
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

grant execute on function public.record_waste(uuid, uuid, integer, text, text, text) to anon, authenticated;

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
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  perform public.require_staff_stall_access(v_staff.id, p_stall_id);

  if p_business_date is null then
    raise exception 'Business date is required';
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
      notes
    )
    values (
      p_stall_id,
      v_product.id,
      p_business_date,
      v_expected,
      v_actual,
      nullif(trim(v_entry ->> 'notes'), '')
    )
    on conflict (stall_id, product_id, business_date)
    do update
    set
      expected_quantity = excluded.expected_quantity,
      actual_quantity = excluded.actual_quantity,
      notes = excluded.notes
    returning * into v_count;

    delete from public.inventory_movements
    where movement_type = 'closing_variance'
      and reference_id = v_count.id;

    if coalesce(v_count.variance_quantity, 0) <> 0 then
      insert into public.inventory_movements (
        stall_id,
        product_id,
        movement_type,
        quantity,
        reference_id,
        notes
      )
      values (
        p_stall_id,
        v_product.id,
        'closing_variance',
        v_actual - v_expected,
        v_count.id,
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
    'business_date', p_business_date,
    'processed_count', v_processed,
    'variance_count', v_variance_count
  );
end;
$$;

grant execute on function public.submit_closing_stock(uuid, date, jsonb, text) to anon, authenticated;

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
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  v_staff_role := lower(coalesce(nullif(trim(v_staff.role), ''), 'staff'));

  if v_staff_role not in ('admin', 'manager', 'owner') then
    raise exception 'You do not have permission to reconcile payments';
  end if;

  perform public.require_staff_stall_access(v_staff.id, p_stall_id);

  if p_business_date is null then
    raise exception 'Business date is required';
  end if;

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
    and created_at >= p_business_date
    and created_at < (p_business_date + interval '1 day');

  insert into public.payment_reconciliations (
    stall_id,
    business_date,
    cash_expected,
    cash_counted,
    mpesa_expected,
    mpesa_confirmed,
    card_expected,
    card_confirmed,
    notes
  )
  values (
    p_stall_id,
    p_business_date,
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
    )
  )
  on conflict (stall_id, business_date)
  do update
  set
    cash_expected = excluded.cash_expected,
    cash_counted = excluded.cash_counted,
    mpesa_expected = excluded.mpesa_expected,
    mpesa_confirmed = excluded.mpesa_confirmed,
    card_expected = excluded.card_expected,
    card_confirmed = excluded.card_confirmed,
    notes = excluded.notes
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

grant execute on function public.save_payment_reconciliation(uuid, date, numeric, numeric, numeric, text, text) to anon, authenticated;

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
  v_created_at timestamptz := now();
  v_action text := coalesce(nullif(trim(p_action), ''), 'shift_closed');
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

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
    'action', v_action,
    'created_at', v_created_at
  );
end;
$$;

grant execute on function public.end_shift(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
