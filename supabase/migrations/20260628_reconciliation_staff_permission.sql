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
  v_business_date date := coalesce(
    p_business_date,
    public.get_current_business_date()
  );
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  select *
  into v_staff
  from public.require_active_staff_session(p_session_token);

  v_staff_role := lower(coalesce(nullif(trim(v_staff.role), ''), 'staff'));

  if v_staff_role not in (
    'admin',
    'owner',
    'manager',
    'staff',
    'cashier',
    'attendant'
  ) then
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

grant execute on function public.save_payment_reconciliation(uuid, date, numeric, numeric, numeric, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
