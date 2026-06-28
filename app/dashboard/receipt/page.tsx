"use client";

import { useState } from "react";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import {
  readStoredReceipt,
  type ReceiptPayload,
} from "@/lib/utils/receipt";

export default function ReceiptPage() {
  const [receipt] = useState<ReceiptPayload | null>(() => readStoredReceipt());

  if (!receipt) {
    return (
      <main className="dashboard-page-shell">
        No receipt found.
      </main>
    );
  }

  return (
    <main className="dashboard-page-shell">
      <div className="mx-auto w-full max-w-sm rounded-[1.5rem] bg-white p-4 text-black shadow-2xl print:rounded-none print:shadow-none sm:p-5">
        <div className="text-center">
          <h1 className="text-xl font-bold">KARAMELA POS</h1>
          <p className="text-xs">Sales / Inventory / Reconciliation</p>
          <p className="mt-2 text-xs">{formatDateTime(receipt.created_at)}</p>
          <p className="text-xs">Receipt: {receipt.sale_id.slice(0, 8)}</p>
        </div>

        <hr className="my-3 border-black" />

        <div className="space-y-2 text-sm">
          {receipt.items.map((item, index) => (
            <div key={index}>
              <div className="flex justify-between">
                <span>{item.product_name}</span>
                <span>{formatCurrency(item.subtotal)}</span>
              </div>
              <p className="text-xs">
                {item.quantity} x {formatCurrency(item.unit_price)}
              </p>
            </div>
          ))}
        </div>

        <hr className="my-3 border-black" />

        <div className="space-y-1 text-sm">
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span>{formatCurrency(receipt.total)}</span>
          </div>

          <div className="flex justify-between">
            <span>Payment</span>
            <span>{receipt.payment_method}</span>
          </div>

          <div className="flex justify-between">
            <span>Paid</span>
            <span>{formatCurrency(receipt.amount_paid)}</span>
          </div>

          <div className="flex justify-between">
            <span>Change</span>
            <span>{formatCurrency(receipt.change_amount)}</span>
          </div>
        </div>

        <hr className="my-3 border-black" />

        <p className="text-center text-xs">
          Thank you for shopping with Karamela.
        </p>
      </div>

      <div className="mx-auto mt-6 flex max-w-sm gap-3 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="w-full rounded-xl bg-[#d08a35] py-3.5 font-bold text-black"
        >
          Print Receipt
        </button>
      </div>
    </main>
  );
}
