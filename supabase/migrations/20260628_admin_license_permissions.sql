revoke insert, delete on table public.licenses from anon, authenticated;
grant select, update on table public.licenses to anon, authenticated;

notify pgrst, 'reload schema';
