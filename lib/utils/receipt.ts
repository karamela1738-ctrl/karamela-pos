export const LAST_RECEIPT_STORAGE_KEY = "karamela_last_receipt";

export type ReceiptItem = {
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

export type ReceiptPayload = {
  sale_id: string;
  total: number;
  payment_method: string;
  amount_paid: number;
  change_amount: number;
  items: ReceiptItem[];
  created_at: string;
};

export function readStoredReceipt() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawReceipt = window.localStorage.getItem(LAST_RECEIPT_STORAGE_KEY);

  if (!rawReceipt) {
    return null;
  }

  try {
    return JSON.parse(rawReceipt) as ReceiptPayload;
  } catch {
    return null;
  }
}

export function writeStoredReceipt(receipt: ReceiptPayload) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    LAST_RECEIPT_STORAGE_KEY,
    JSON.stringify(receipt)
  );
}
