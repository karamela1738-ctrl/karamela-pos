import { supabase } from "@/lib/supabase/client";
import { getStoredStaffSession } from "@/lib/services/auth";

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

export type ProductInput = {
  product_name: string;
  brand?: string | null;
  category?: string | null;
  barcode?: string | null;
  stock_qty?: number | null;
  reorder_level?: number | null;
  cost_price?: number | null;
  selling_price?: number | null;
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

export async function addProduct(input: ProductInput) {
  const payload = normalizeProductInput(input);

  const { data, error } = await supabase.rpc("create_product", {
    p_product_name: payload.product_name,
    p_brand: payload.brand,
    p_category: payload.category,
    p_barcode: payload.barcode,
    p_stock_qty: payload.stock_qty,
    p_reorder_level: payload.reorder_level,
    p_cost_price: payload.cost_price,
    p_selling_price: payload.selling_price,
    p_session_token: getRequiredSessionToken(),
  });

  if (error) throw new Error(error.message);

  return requireProductRecord(data, "create_product");
}

export async function updateProduct(productId: string, input: ProductInput) {
  const payload = normalizeProductInput(input);

  const { data, error } = await supabase.rpc("update_product", {
    p_product_id: productId,
    p_product_name: payload.product_name,
    p_brand: payload.brand,
    p_category: payload.category,
    p_barcode: payload.barcode,
    p_stock_qty: payload.stock_qty,
    p_reorder_level: payload.reorder_level,
    p_cost_price: payload.cost_price,
    p_selling_price: payload.selling_price,
    p_session_token: getRequiredSessionToken(),
  });

  if (error) throw new Error(error.message);

  return requireProductRecord(data, "update_product");
}

export async function deleteProduct(productId: string) {
  const { error } = await supabase.rpc("delete_product", {
    p_product_id: productId,
    p_session_token: getRequiredSessionToken(),
  });

  if (error) throw new Error(error.message);
}

function getRequiredSessionToken() {
  const session = getStoredStaffSession();

  if (!session?.session_token) {
    throw new Error("Staff session has expired. Please sign in again.");
  }

  return session.session_token;
}

function requireProductRecord(value: unknown, rpcName: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${rpcName} returned an invalid response.`);
  }

  return value as Product;
}

function normalizeProductInput(input: ProductInput) {
  const productName = input.product_name.trim();

  if (!productName) {
    throw new Error("Product name is required.");
  }

  const stockQty = normalizeOptionalNumber(input.stock_qty, "Stock quantity");
  const reorderLevel = normalizeOptionalNumber(
    input.reorder_level,
    "Reorder level"
  );
  const costPrice = normalizeOptionalNumber(input.cost_price, "Cost price");
  const sellingPrice = normalizeOptionalNumber(
    input.selling_price,
    "Selling price"
  );

  return {
    product_name: productName,
    brand: normalizeOptionalString(input.brand),
    category: normalizeOptionalString(input.category),
    barcode: normalizeOptionalString(input.barcode),
    stock_qty: stockQty,
    reorder_level: reorderLevel,
    cost_price: costPrice,
    selling_price: sellingPrice,
  };
}

function normalizeOptionalString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalNumber(
  value: number | null | undefined,
  fieldName: string
) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = Number(value);

  if (Number.isNaN(normalized)) {
    throw new Error(`${fieldName} must be a valid number.`);
  }

  if (normalized < 0) {
    throw new Error(`${fieldName} cannot be negative.`);
  }

  return normalized;
}
