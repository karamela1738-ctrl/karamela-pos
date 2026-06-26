# Supabase Migrations

Apply the SQL files in `supabase/migrations` to your Supabase project before
testing or deploying workflow changes.

The app now depends on atomic RPC functions for core write workflows:

- `complete_sale`
- `restock_product`
- `record_waste`
- `submit_closing_stock`
- `save_payment_reconciliation`
- `end_shift`

If these functions are not installed in Supabase yet, the corresponding app
screens will fail with RPC errors.
