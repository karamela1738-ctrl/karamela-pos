do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'staff',
    'staff_stall_access',
    'staff_login_devices',
    'staff_sessions',
    'stalls',
    'licenses',
    'sales',
    'sale_items',
    'waste_logs',
    'closing_stock_counts',
    'payment_reconciliations',
    'inventory_movements',
    'shift_logs'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format(
        'revoke all on table public.%I from anon, authenticated',
        v_table
      );

      execute format(
        'alter table public.%I enable row level security',
        v_table
      );
    end if;
  end loop;
end
$$;

revoke insert, update, delete on table public.products from anon, authenticated;
grant select on table public.products to anon, authenticated;

alter table public.products enable row level security;

drop policy if exists products_select_public on public.products;

create policy products_select_public
on public.products
for select
to anon, authenticated
using (true);

create or replace function public.get_recent_waste_logs(
  p_stall_id uuid,
  p_session_token text,
  p_limit integer default 20
)
returns table (
  id uuid,
  product_id uuid,
  quantity numeric,
  reason text,
  value_amount numeric,
  notes text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  if p_stall_id is null then
    raise exception 'Could not find stall';
  end if;

  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  perform public.require_staff_stall_access(v_staff.id, p_stall_id);

  return query
  select
    w.id,
    w.product_id,
    coalesce(w.quantity, 0)::numeric as quantity,
    coalesce(w.reason, 'other') as reason,
    w.value_amount,
    w.notes,
    w.created_at
  from public.waste_logs w
  where w.stall_id = p_stall_id
  order by w.created_at desc, w.id desc
  limit v_limit;
end;
$$;

grant execute on function public.get_recent_waste_logs(uuid, text, integer) to anon, authenticated;

create or replace function public.get_reconciliation_sales_summary(
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
  v_day_start timestamptz := (v_business_date::timestamp at time zone 'Africa/Nairobi');
  v_day_end timestamptz := ((v_business_date + 1)::timestamp at time zone 'Africa/Nairobi');
  v_cash numeric := 0;
  v_mpesa numeric := 0;
  v_card numeric := 0;
  v_row_count integer := 0;
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  v_stall_id := public.require_staff_primary_stall(v_staff.id);
  perform public.require_staff_stall_access(v_staff.id, v_stall_id);

  select
    coalesce(sum(total_amount) filter (where lower(coalesce(payment_method, '')) = 'cash'), 0),
    coalesce(sum(total_amount) filter (where lower(coalesce(payment_method, '')) = 'mpesa'), 0),
    coalesce(sum(total_amount) filter (where lower(coalesce(payment_method, '')) = 'card'), 0),
    count(*)
  into
    v_cash,
    v_mpesa,
    v_card,
    v_row_count
  from public.sales
  where stall_id = v_stall_id
    and created_at >= v_day_start
    and created_at < v_day_end;

  return jsonb_build_object(
    'stall_id', v_stall_id,
    'business_date', v_business_date,
    'cash', v_cash,
    'mpesa', v_mpesa,
    'card', v_card,
    'row_count', v_row_count,
    'start_at', v_day_start,
    'end_at', v_day_end
  );
end;
$$;

grant execute on function public.get_reconciliation_sales_summary(text) to anon, authenticated;

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
