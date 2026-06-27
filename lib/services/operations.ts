import { supabase } from "@/lib/supabase/client";
import { getStoredStaffSession } from "@/lib/services/auth";
import type { DashboardPeriod } from "@/lib/utils/period";

type WorkflowResult = Record<string, unknown>;

export type BusinessDayStatus = {
  stall_id: string;
  business_date: string;
  total_products: number;
  counted_products: number;
  closing_stock_complete: boolean;
  reconciliation_complete: boolean;
  can_end_shift: boolean;
  reconciliation_variance: number;
};

export type OwnerDashboardSnapshot = BusinessDayStatus & {
  today_sales: number;
  today_waste: number;
  inventory_value: number;
  low_stock_count: number;
};

export type StaffActivityItem = {
  activity_id: string;
  activity_type: string;
  description: string;
  amount: number | null;
  staff_name: string;
  created_at: string;
  business_date: string;
};

export type InventoryMovementAuditItem = {
  movement_id: string;
  created_at: string;
  business_date: string;
  movement_type: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  staff_id: string | null;
  staff_name: string;
  reference_id: string | null;
  notes: string | null;
};

export type OwnerWasteRow = {
  waste_id: string;
  product_id: string | null;
  product_name: string;
  category: string | null;
  quantity: number;
  reason: string;
  value_amount: number;
  effective_value: number;
  notes: string | null;
  created_at: string;
  business_date: string;
};

export type OwnerSaleRow = {
  sale_id: string;
  total_amount: number;
  payment_method: string;
  created_at: string;
  business_date: string;
};

export type OwnerSaleItemRow = {
  sale_item_id: string;
  sale_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string;
  business_date: string;
};

export type OwnerClosingStockRow = {
  count_id: string;
  product_id: string;
  product_name: string;
  business_date: string;
  expected_quantity: number;
  actual_quantity: number;
  variance_quantity: number;
  notes: string | null;
  created_at: string;
  selling_price: number;
  cost_price: number;
};

export type OwnerReconciliationRow = {
  reconciliation_id: string;
  business_date: string;
  cash_expected: number;
  cash_counted: number;
  mpesa_expected: number;
  mpesa_confirmed: number;
  card_expected: number;
  card_confirmed: number;
  variance: number;
  notes: string | null;
  created_at: string;
};

function getRequiredSessionToken() {
  const session = getStoredStaffSession();

  if (!session?.session_token) {
    throw new Error("Staff session has expired. Please sign in again.");
  }

  return session.session_token;
}

function requireResultObject(value: unknown, rpcName: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${rpcName} returned an invalid response.`);
  }

  return value as WorkflowResult;
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readNumber(value: unknown, fallback = 0) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }

  return fallback;
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return fallback;
}

function requireResultArray(value: unknown, rpcName: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${rpcName} returned an invalid response.`);
  }

  return value as Array<Record<string, unknown>>;
}

export async function getBusinessDayStatus() {
  const sessionToken = getRequiredSessionToken();
  const { data, error } = await supabase.rpc("get_business_day_status", {
    p_session_token: sessionToken,
  });

  if (error) {
    throw new Error(error.message);
  }

  const result = requireResultObject(data, "get_business_day_status");

  return {
    stall_id: readString(result.stall_id),
    business_date: readString(result.business_date),
    total_products: readNumber(result.total_products),
    counted_products: readNumber(result.counted_products),
    closing_stock_complete: readBoolean(result.closing_stock_complete),
    reconciliation_complete: readBoolean(result.reconciliation_complete),
    can_end_shift: readBoolean(result.can_end_shift),
    reconciliation_variance: readNumber(result.reconciliation_variance),
  } satisfies BusinessDayStatus;
}

export async function getOwnerDashboardSnapshot() {
  const sessionToken = getRequiredSessionToken();
  const { data, error } = await supabase.rpc("get_owner_dashboard_snapshot", {
    p_session_token: sessionToken,
  });

  if (error) {
    throw new Error(error.message);
  }

  const result = requireResultObject(data, "get_owner_dashboard_snapshot");

  return {
    stall_id: readString(result.stall_id),
    business_date: readString(result.business_date),
    total_products: readNumber(result.total_products),
    counted_products: readNumber(result.counted_products),
    closing_stock_complete: readBoolean(result.closing_stock_complete),
    reconciliation_complete: readBoolean(result.reconciliation_complete),
    can_end_shift: readBoolean(result.can_end_shift),
    reconciliation_variance: readNumber(result.reconciliation_variance),
    today_sales: readNumber(result.today_sales),
    today_waste: readNumber(result.today_waste),
    inventory_value: readNumber(result.inventory_value),
    low_stock_count: readNumber(result.low_stock_count),
  } satisfies OwnerDashboardSnapshot;
}

export async function getOwnerWasteRows(period: DashboardPeriod) {
  const sessionToken = getRequiredSessionToken();
  const { data, error } = await supabase.rpc("get_owner_waste_rows", {
    p_session_token: sessionToken,
    p_period: period,
  });

  if (error) {
    throw new Error(error.message);
  }

  return requireResultArray(data, "get_owner_waste_rows").map((item) => ({
    waste_id: readString(item.waste_id),
    product_id:
      typeof item.product_id === "string" && item.product_id.trim()
        ? item.product_id
        : null,
    product_name: readString(item.product_name, "Unknown Product"),
    category:
      typeof item.category === "string" && item.category.trim()
        ? item.category
        : null,
    quantity: readNumber(item.quantity),
    reason: readString(item.reason, "other"),
    value_amount: readNumber(item.value_amount),
    effective_value: readNumber(item.effective_value),
    notes:
      typeof item.notes === "string" && item.notes.trim() ? item.notes : null,
    created_at: readString(item.created_at),
    business_date: readString(item.business_date),
  })) satisfies OwnerWasteRow[];
}

export async function getOwnerSalesRows(period: DashboardPeriod) {
  const sessionToken = getRequiredSessionToken();
  const { data, error } = await supabase.rpc("get_owner_sales_rows", {
    p_session_token: sessionToken,
    p_period: period,
  });

  if (error) {
    throw new Error(error.message);
  }

  return requireResultArray(data, "get_owner_sales_rows").map((item) => ({
    sale_id: readString(item.sale_id),
    total_amount: readNumber(item.total_amount),
    payment_method: readString(item.payment_method, "cash"),
    created_at: readString(item.created_at),
    business_date: readString(item.business_date),
  })) satisfies OwnerSaleRow[];
}

export async function getOwnerSaleItemRows(period: DashboardPeriod) {
  const sessionToken = getRequiredSessionToken();
  const { data, error } = await supabase.rpc("get_owner_sale_item_rows", {
    p_session_token: sessionToken,
    p_period: period,
  });

  if (error) {
    throw new Error(error.message);
  }

  return requireResultArray(data, "get_owner_sale_item_rows").map((item) => ({
    sale_item_id: readString(item.sale_item_id),
    sale_id: readString(item.sale_id),
    product_name: readString(item.product_name, "Unknown Product"),
    quantity: readNumber(item.quantity),
    unit_price: readNumber(item.unit_price),
    subtotal: readNumber(item.subtotal),
    created_at: readString(item.created_at),
    business_date: readString(item.business_date),
  })) satisfies OwnerSaleItemRow[];
}

export async function getOwnerClosingStockRows(period: DashboardPeriod) {
  const sessionToken = getRequiredSessionToken();
  const { data, error } = await supabase.rpc("get_owner_closing_stock_rows", {
    p_session_token: sessionToken,
    p_period: period,
  });

  if (error) {
    throw new Error(error.message);
  }

  return requireResultArray(data, "get_owner_closing_stock_rows").map((item) => ({
    count_id: readString(item.count_id),
    product_id: readString(item.product_id),
    product_name: readString(item.product_name, "Unknown Product"),
    business_date: readString(item.business_date),
    expected_quantity: readNumber(item.expected_quantity),
    actual_quantity: readNumber(item.actual_quantity),
    variance_quantity: readNumber(item.variance_quantity),
    notes:
      typeof item.notes === "string" && item.notes.trim() ? item.notes : null,
    created_at: readString(item.created_at),
    selling_price: readNumber(item.selling_price),
    cost_price: readNumber(item.cost_price),
  })) satisfies OwnerClosingStockRow[];
}

export async function getOwnerReconciliationRows(period: DashboardPeriod) {
  const sessionToken = getRequiredSessionToken();
  const { data, error } = await supabase.rpc("get_owner_reconciliation_rows", {
    p_session_token: sessionToken,
    p_period: period,
  });

  if (error) {
    throw new Error(error.message);
  }

  return requireResultArray(data, "get_owner_reconciliation_rows").map((item) => ({
    reconciliation_id: readString(item.reconciliation_id),
    business_date: readString(item.business_date),
    cash_expected: readNumber(item.cash_expected),
    cash_counted: readNumber(item.cash_counted),
    mpesa_expected: readNumber(item.mpesa_expected),
    mpesa_confirmed: readNumber(item.mpesa_confirmed),
    card_expected: readNumber(item.card_expected),
    card_confirmed: readNumber(item.card_confirmed),
    variance: readNumber(item.variance),
    notes:
      typeof item.notes === "string" && item.notes.trim() ? item.notes : null,
    created_at: readString(item.created_at),
  })) satisfies OwnerReconciliationRow[];
}

export async function getStaffActivityFeed(limit = 200) {
  const sessionToken = getRequiredSessionToken();
  const { data, error } = await supabase.rpc("get_staff_activity_feed", {
    p_session_token: sessionToken,
    p_limit: limit,
  });

  if (error) {
    throw new Error(error.message);
  }

  return ((data || []) as Array<Record<string, unknown>>).map((item) => ({
    activity_id: readString(item.activity_id),
    activity_type: readString(item.activity_type),
    description: readString(item.description),
    amount:
      item.amount === null || item.amount === undefined
        ? null
        : readNumber(item.amount),
    staff_name: readString(item.staff_name, "Unknown Staff"),
    created_at: readString(item.created_at),
    business_date: readString(item.business_date),
  })) satisfies StaffActivityItem[];
}

export async function getInventoryMovementsAudit(limit = 100) {
  const sessionToken = getRequiredSessionToken();
  const { data, error } = await supabase.rpc("get_inventory_movements_audit", {
    p_session_token: sessionToken,
    p_limit: limit,
  });

  if (error) {
    throw new Error(error.message);
  }

  return ((data || []) as Array<Record<string, unknown>>).map((item) => ({
    movement_id: readString(item.movement_id),
    created_at: readString(item.created_at),
    business_date: readString(item.business_date),
    movement_type: readString(item.movement_type),
    product_id:
      typeof item.product_id === "string" && item.product_id.trim()
        ? item.product_id
        : null,
    product_name: readString(item.product_name, "Unknown Product"),
    quantity: readNumber(item.quantity),
    staff_id:
      typeof item.staff_id === "string" && item.staff_id.trim()
        ? item.staff_id
        : null,
    staff_name: readString(item.staff_name, "Unknown Staff"),
    reference_id:
      typeof item.reference_id === "string" && item.reference_id.trim()
        ? item.reference_id
        : null,
    notes:
      typeof item.notes === "string" && item.notes.trim() ? item.notes : null,
  })) satisfies InventoryMovementAuditItem[];
}
