revoke all on table public.licenses from anon, authenticated;

notify pgrst, 'reload schema';
