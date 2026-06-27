alter table public.sales
add column if not exists client_reference text;

create unique index if not exists sales_stall_id_client_reference_idx
  on public.sales (stall_id, client_reference)
  where client_reference is not null;

drop function if exists public.complete_sale(uuid, text, numeric, text, jsonb);

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

  insert into sales (
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
      from products
      where id = (v_item ->> 'product_id')::uuid
      for update;

      if not found then
        raise exception 'Product % not found', v_item ->> 'product_id';
      end if;

      if coalesce(v_product.stock_qty, 0) < v_quantity then
        raise exception 'Insufficient stock for %', v_product.product_name;
      end if;

      v_total := v_total + (v_quantity * coalesce(v_product.selling_price, 0));

      insert into sale_items (
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

      insert into inventory_movements (
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

      update products
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

    update sales
    set
      total_amount = v_total,
      amount_paid = v_amount_paid,
      change_amount = greatest(v_amount_paid - v_total, 0)
    where id = v_sale.id
    returning * into v_sale;
  else
    select *
    into v_sale
    from sales
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
    from sale_items
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

notify pgrst, 'reload schema';
