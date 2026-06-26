import { supabase } from "@/lib/supabase/client";

export type Product = {
  id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  barcode?: string | null;
  stock_qty: number | null;
  reorder_level: number | null;
  cost_price: number | null;
  selling_price: number | null;
};

export type SaleItemSummary = {
  product_id: string | null;
  product_name: string;
  quantity: number;
  subtotal: number;
};

export async function getProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("product_name");

  if (error) throw new Error(error.message);

  return (data || []) as Product[];
}

export async function getSaleItems() {
  const { data, error } = await supabase
    .from("sale_items")
    .select("product_id, product_name, quantity, subtotal");

  if (error) throw new Error(error.message);

  return (data || []) as SaleItemSummary[];
}
