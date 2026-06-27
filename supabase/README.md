# Supabase Migrations

Apply `supabase/migrations/20260626_atomic_workflows.sql` to your Supabase
project before testing or deploying workflow changes to production.
Then apply:

- `supabase/migrations/20260627_staff_auth_hardening.sql`
- `supabase/migrations/20260627_sale_idempotency.sql`

The app now depends on atomic RPC functions for core write workflows:

- `complete_sale(p_stall_id uuid, p_payment_method text, p_amount_paid numeric, p_staff_name text, p_items jsonb, p_client_reference text)`
- `restock_product(p_stall_id uuid, p_product_id uuid, p_quantity integer, p_notes text)`
- `record_waste(p_stall_id uuid, p_product_id uuid, p_quantity integer, p_reason text, p_notes text)`
- `submit_closing_stock(p_stall_id uuid, p_business_date date, p_counts jsonb)`
- `save_payment_reconciliation(p_stall_id uuid, p_business_date date, p_cash_counted numeric, p_mpesa_confirmed numeric, p_card_confirmed numeric, p_notes text)`
- `end_shift(p_action text, p_staff_id uuid)`

If these functions are not installed in Supabase yet, the corresponding app
screens will fail with RPC errors.

This migration now ends with `notify pgrst, 'reload schema';` so PostgREST
refreshes the schema cache after the function signatures are updated.
