"use client";

import { useEffect, useState } from "react";

type ReceiptItem = {
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

type Receipt = {
  sale_id: string;
  total: number;
  payment_method: string;
  amount_paid: number;
  change_amount: number;
  items: ReceiptItem[];
  created_at: string;
};

export default function ReceiptPage() {
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("karamela_last_receipt");
    if (saved) setReceipt(JSON.parse(saved));
  }, []);

  if (!receipt) {
    return (
      <main className="min-h-screen bg-[#080604] p-8 text-white">
        No receipt found.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080604] p-6 text-white">
      <div className="mx-auto max-w-sm bg-white p-5 text-black print:shadow-none">
        <div className="text-center">
          <h1 className="text-xl font-bold">KARAMELA POS</h1>
          <p className="text-xs">Sales • Inventory • Reconciliation</p>
          <p className="mt-2 text-xs">
            {new Date(receipt.created_at).toLocaleString()}
          </p>
          <p className="text-xs">Receipt: {receipt.sale_id.slice(0, 8)}</p>
        </div>

        <hr className="my-3 border-black" />

        <div className="space-y-2 text-sm">
          {receipt.items.map((item, index) => (
            <div key={index}>
              <div className="flex justify-between">
                <span>{item.product_name}</span>
                <span>KES {item.subtotal}</span>
              </div>
              <p className="text-xs">
                {item.quantity} x KES {item.unit_price}
              </p>
            </div>
          ))}
        </div>

        <hr className="my-3 border-black" />

        <div className="space-y-1 text-sm">
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span>KES {receipt.total}</span>
          </div>

          <div className="flex justify-between">
            <span>Payment</span>
            <span>{receipt.payment_method}</span>
          </div>

          <div className="flex justify-between">
            <span>Paid</span>
            <span>KES {receipt.amount_paid}</span>
          </div>

          <div className="flex justify-between">
            <span>Change</span>
            <span>KES {receipt.change_amount}</span>
          </div>
        </div>

        <hr className="my-3 border-black" />

        <p className="text-center text-xs">
          Thank you for shopping with Karamela.
        </p>
      </div>

      <div className="mx-auto mt-6 flex max-w-sm gap-3 print:hidden">
        <button
          onClick={() => window.print()}
          className="flex-1 rounded-xl bg-[#d08a35] py-3 font-bold text-black"
        >
          Print Receipt
        </button>

        <button
          onClick={() => history.back()}
          className="flex-1 rounded-xl bg-white/10 py-3 font-bold text-white"
        >
          Back
        </button>
      </div>
    </main>
  );
}