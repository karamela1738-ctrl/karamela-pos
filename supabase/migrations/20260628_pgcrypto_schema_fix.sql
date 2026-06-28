create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.staff
add column if not exists pin_hash text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'staff'
      and column_name = 'pin_code'
  ) then
    execute $sql$
      update public.staff
      set pin_hash = extensions.crypt(trim(pin_code), extensions.gen_salt('bf'))
      where pin_hash is null
        and nullif(trim(pin_code), '') is not null
        and trim(pin_code) ~ '^[0-9]{6}$'
    $sql$;

    execute 'alter table public.staff alter column pin_code drop not null';
    execute 'update public.staff set pin_code = null where pin_code is not null';
  end if;
end
$$;

do $$
begin
  if to_regprocedure('public.login_staff(text,text,text)') is not null then
    execute 'alter function public.login_staff(text, text, text) set search_path = public, extensions';
  end if;

  if to_regprocedure('public.create_admin_staff(text,text,text,text,boolean)') is not null then
    execute 'alter function public.create_admin_staff(text, text, text, text, boolean) set search_path = public, extensions';
  end if;

  if to_regprocedure('public.reset_admin_staff_pin(text,uuid,text)') is not null then
    execute 'alter function public.reset_admin_staff_pin(text, uuid, text) set search_path = public, extensions';
  end if;
end
$$;

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
