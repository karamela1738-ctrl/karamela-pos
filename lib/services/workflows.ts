import { supabase } from "@/lib/supabase/client";
import type { ReceiptItem, ReceiptPayload } from "@/lib/utils/receipt";

type WorkflowResult = Record<string, unknown>;

export type SaleWorkflowItemInput = {
  productId: string;
  quantity: number;
};

export type RestockWorkflowInput = {
  stallId: string;
  productId: string;
  quantity: number;
  notes?: string;
};

export type WasteWorkflowInput = {
  stallId: string;
  productId: string;
  quantity: number;
  reason: string;
  notes?: string;
};

export type ClosingStockWorkflowInput = {
  stallId: string;
  businessDate: string;
  counts: Array<{
    productId: string;
    actualQuantity: number;
    notes?: string;
  }>;
};

export type ReconciliationWorkflowInput = {
  stallId: string;
  businessDate: string;
  cashCounted: number;
  mpesaConfirmed: number;
  cardConfirmed: number;
  notes?: string;
};

async function callWorkflow<T>(
  workflowName: string,
  params: Record<string, unknown>
) {
  const { data, error } = await supabase.rpc(workflowName, params);

  if (error) {
    throw new Error(error.message);
  }

  return data as T;
}

function requireWorkflowResult(
  value: unknown,
  workflowName: string
): WorkflowResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${workflowName} returned an invalid response.`);
  }

  return value as WorkflowResult;
}

function readStringField(
  result: WorkflowResult,
  key: string,
  fallback = ""
) {
  return typeof result[key] === "string" ? (result[key] as string) : fallback;
}

function readNumberField(result: WorkflowResult, key: string, fallback = 0) {
  const value = result[key];

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }

  return fallback;
}

function readReceiptItems(result: WorkflowResult) {
  const rawItems = result.items;

  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems.map((item) => {
    const record = requireWorkflowResult(item, "complete_sale");

    return {
      product_name: readStringField(record, "product_name", "Product"),
      quantity: readNumberField(record, "quantity"),
      unit_price: readNumberField(record, "unit_price"),
      subtotal: readNumberField(record, "subtotal"),
    } satisfies ReceiptItem;
  });
}

export async function completeSaleWorkflow({
  stallId,
  paymentMethod,
  amountPaid,
  staffName,
  items,
}: {
  stallId: string;
  paymentMethod: string;
  amountPaid: number;
  staffName?: string;
  items: SaleWorkflowItemInput[];
}) {
  const result = requireWorkflowResult(
    await callWorkflow<unknown>("complete_sale", {
      p_stall_id: stallId,
      p_payment_method: paymentMethod,
      p_amount_paid: amountPaid,
      p_staff_name: staffName || null,
      p_items: items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
      })),
    }),
    "complete_sale"
  );

  return {
    sale_id: readStringField(result, "sale_id"),
    total: readNumberField(result, "total"),
    payment_method: readStringField(result, "payment_method", paymentMethod),
    amount_paid: readNumberField(result, "amount_paid", amountPaid),
    change_amount: readNumberField(result, "change_amount"),
    items: readReceiptItems(result),
    created_at: readStringField(result, "created_at", new Date().toISOString()),
  } satisfies ReceiptPayload;
}

export async function restockProductWorkflow({
  stallId,
  productId,
  quantity,
  notes,
}: RestockWorkflowInput) {
  const result = requireWorkflowResult(
    await callWorkflow<unknown>("restock_product", {
      p_stall_id: stallId,
      p_product_id: productId,
      p_quantity: quantity,
      p_notes: notes || null,
    }),
    "restock_product"
  );

  return {
    previousStock: readNumberField(result, "previous_stock"),
    newStock: readNumberField(result, "new_stock"),
  };
}

export async function recordWasteWorkflow({
  stallId,
  productId,
  quantity,
  reason,
  notes,
}: WasteWorkflowInput) {
  const result = requireWorkflowResult(
    await callWorkflow<unknown>("record_waste", {
      p_stall_id: stallId,
      p_product_id: productId,
      p_quantity: quantity,
      p_reason: reason,
      p_notes: notes || null,
    }),
    "record_waste"
  );

  return {
    wasteId: readStringField(result, "waste_id"),
    valueAmount: readNumberField(result, "value_amount"),
    newStock: readNumberField(result, "new_stock"),
  };
}

export async function submitClosingStockWorkflow({
  stallId,
  businessDate,
  counts,
}: ClosingStockWorkflowInput) {
  const result = requireWorkflowResult(
    await callWorkflow<unknown>("submit_closing_stock", {
      p_stall_id: stallId,
      p_business_date: businessDate,
      p_counts: counts.map((item) => ({
        product_id: item.productId,
        actual_quantity: item.actualQuantity,
        notes: item.notes || null,
      })),
    }),
    "submit_closing_stock"
  );

  return {
    processedCount: readNumberField(result, "processed_count"),
    varianceCount: readNumberField(result, "variance_count"),
  };
}

export async function savePaymentReconciliationWorkflow({
  stallId,
  businessDate,
  cashCounted,
  mpesaConfirmed,
  cardConfirmed,
  notes,
}: ReconciliationWorkflowInput) {
  const result = requireWorkflowResult(
    await callWorkflow<unknown>("save_payment_reconciliation", {
      p_stall_id: stallId,
      p_business_date: businessDate,
      p_cash_counted: cashCounted,
      p_mpesa_confirmed: mpesaConfirmed,
      p_card_confirmed: cardConfirmed,
      p_notes: notes || null,
    }),
    "save_payment_reconciliation"
  );

  return {
    cashExpected: readNumberField(result, "cash_expected"),
    mpesaExpected: readNumberField(result, "mpesa_expected"),
    cardExpected: readNumberField(result, "card_expected"),
    variance: readNumberField(result, "variance"),
  };
}

export async function endShiftWorkflow(staffId: string) {
  return requireWorkflowResult(
    await callWorkflow<unknown>("end_shift", {
      p_staff_id: staffId,
      p_action: "shift_closed",
    }),
    "end_shift"
  );
}
