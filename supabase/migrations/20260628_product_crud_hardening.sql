revoke insert, update, delete on table public.products from anon, authenticated;
grant select on table public.products to anon, authenticated;

alter table public.products enable row level security;

drop policy if exists products_select_public on public.products;

create policy products_select_public
on public.products
for select
to anon, authenticated
using (true);

create or replace function public.create_product(
  p_product_name text,
  p_brand text default null,
  p_category text default null,
  p_barcode text default null,
  p_stock_qty numeric default null,
  p_reorder_level numeric default null,
  p_cost_price numeric default null,
  p_selling_price numeric default null,
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
  v_stall_id uuid;
  v_staff_role text := 'staff';
  v_product_name text := nullif(trim(p_product_name), '');
  v_brand text := nullif(trim(p_brand), '');
  v_category text := nullif(trim(p_category), '');
  v_barcode text := nullif(trim(p_barcode), '');
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  v_staff_role := lower(coalesce(nullif(trim(v_staff.role), ''), 'staff'));

  if v_staff_role not in ('admin', 'owner', 'manager') then
    raise exception 'You do not have permission to manage products';
  end if;

  v_stall_id := public.require_staff_primary_stall(v_staff.id);
  perform public.require_staff_stall_access(v_staff.id, v_stall_id);

  if v_product_name is null then
    raise exception 'Product name is required';
  end if;

  if p_stock_qty is not null and p_stock_qty < 0 then
    raise exception 'Stock quantity cannot be negative';
  end if;

  if p_reorder_level is not null and p_reorder_level < 0 then
    raise exception 'Reorder level cannot be negative';
  end if;

  if p_cost_price is not null and p_cost_price < 0 then
    raise exception 'Cost price cannot be negative';
  end if;

  if p_selling_price is not null and p_selling_price < 0 then
    raise exception 'Selling price cannot be negative';
  end if;

  if v_barcode is not null and exists (
    select 1
    from public.products
    where lower(coalesce(barcode, '')) = lower(v_barcode)
  ) then
    raise exception 'Barcode already exists';
  end if;

  insert into public.products (
    product_name,
    brand,
    category,
    barcode,
    stock_qty,
    reorder_level,
    cost_price,
    selling_price
  )
  values (
    v_product_name,
    v_brand,
    v_category,
    v_barcode,
    p_stock_qty,
    p_reorder_level,
    p_cost_price,
    p_selling_price
  )
  returning * into v_product;

  return to_jsonb(v_product);
end;
$$;

grant execute on function public.create_product(
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  text
) to anon, authenticated;

create or replace function public.update_product(
  p_product_id uuid,
  p_product_name text,
  p_brand text default null,
  p_category text default null,
  p_barcode text default null,
  p_stock_qty numeric default null,
  p_reorder_level numeric default null,
  p_cost_price numeric default null,
  p_selling_price numeric default null,
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
  v_stall_id uuid;
  v_staff_role text := 'staff';
  v_product_name text := nullif(trim(p_product_name), '');
  v_brand text := nullif(trim(p_brand), '');
  v_category text := nullif(trim(p_category), '');
  v_barcode text := nullif(trim(p_barcode), '');
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  v_staff_role := lower(coalesce(nullif(trim(v_staff.role), ''), 'staff'));

  if v_staff_role not in ('admin', 'owner', 'manager') then
    raise exception 'You do not have permission to manage products';
  end if;

  v_stall_id := public.require_staff_primary_stall(v_staff.id);
  perform public.require_staff_stall_access(v_staff.id, v_stall_id);

  if p_product_id is null then
    raise exception 'Product not found';
  end if;

  if v_product_name is null then
    raise exception 'Product name is required';
  end if;

  if p_stock_qty is not null and p_stock_qty < 0 then
    raise exception 'Stock quantity cannot be negative';
  end if;

  if p_reorder_level is not null and p_reorder_level < 0 then
    raise exception 'Reorder level cannot be negative';
  end if;

  if p_cost_price is not null and p_cost_price < 0 then
    raise exception 'Cost price cannot be negative';
  end if;

  if p_selling_price is not null and p_selling_price < 0 then
    raise exception 'Selling price cannot be negative';
  end if;

  select *
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found';
  end if;

  if v_barcode is not null and exists (
    select 1
    from public.products
    where lower(coalesce(barcode, '')) = lower(v_barcode)
      and id <> p_product_id
  ) then
    raise exception 'Barcode already exists';
  end if;

  update public.products
  set
    product_name = v_product_name,
    brand = v_brand,
    category = v_category,
    barcode = v_barcode,
    stock_qty = p_stock_qty,
    reorder_level = p_reorder_level,
    cost_price = p_cost_price,
    selling_price = p_selling_price
  where id = p_product_id
  returning * into v_product;

  return to_jsonb(v_product);
end;
$$;

grant execute on function public.update_product(
  uuid,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  text
) to anon, authenticated;

create or replace function public.delete_product(
  p_product_id uuid,
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
  v_stall_id uuid;
  v_staff_role text := 'staff';
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  v_staff_role := lower(coalesce(nullif(trim(v_staff.role), ''), 'staff'));

  if v_staff_role not in ('admin', 'owner', 'manager') then
    raise exception 'You do not have permission to manage products';
  end if;

  v_stall_id := public.require_staff_primary_stall(v_staff.id);
  perform public.require_staff_stall_access(v_staff.id, v_stall_id);

  if p_product_id is null then
    raise exception 'Product not found';
  end if;

  select *
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found';
  end if;

  if coalesce(v_product.stock_qty, 0) <> 0 then
    raise exception 'Cannot delete a product with stock on hand';
  end if;

  if exists (
    select 1
    from public.sale_items
    where product_id = p_product_id
  ) or exists (
    select 1
    from public.inventory_movements
    where product_id = p_product_id
  ) or exists (
    select 1
    from public.waste_logs
    where product_id = p_product_id
  ) or exists (
    select 1
    from public.closing_stock_counts
    where product_id = p_product_id
  ) then
    raise exception 'Cannot delete a product with transaction history';
  end if;

  delete from public.products
  where id = p_product_id;

  return jsonb_build_object(
    'product_id', v_product.id,
    'product_name', v_product.product_name,
    'deleted', true
  );
end;
$$;

grant execute on function public.delete_product(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
