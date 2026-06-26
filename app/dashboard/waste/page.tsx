"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getProducts,
  type Product,
} from "@/lib/services/inventory";
import { getMainStall } from "@/lib/services/stalls";
import { supabase } from "@/lib/supabase/client";
import { recordWasteWorkflow } from "@/lib/services/workflows";
import { formatCurrency } from "@/lib/utils/format";

type WasteLog = {
  id: string;
  product_id: string;
  quantity: number;
  reason: string;
  value_amount: number | null;
  notes: string | null;
  created_at: string;
};

const WASTE_REASONS = [
  "damaged",
  "melted",
  "expired",
  "broken",
  "sample",
  "theft",
  "unknown",
  "other",
];

export default function WastePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [logs, setLogs] = useState<WasteLog[]>([]);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("damaged");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadProducts() {
    try {
      setProducts(await getProducts());
    } catch (error) {
      console.error("Products error:", error);
    }
  }

  async function loadLogs() {
    const { data, error } = await supabase
      .from("waste_logs")
      .select("id, product_id, quantity, reason, value_amount, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Waste logs error:", error);
      return;
    }

    setLogs(data || []);
  }

  useEffect(() => {
    void loadProducts();
    void loadLogs();
  }, []);

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const selectedProduct = productMap.get(productId);
  const wasteValue =
    Number(quantity || 0) * Number(selectedProduct?.selling_price || 0);

  async function recordWaste(event: React.FormEvent) {
    event.preventDefault();

    if (!productId || !quantity) {
      alert("Select product and enter quantity");
      return;
    }

    setLoading(true);

    try {
      const stall = await getMainStall();

      if (!stall) {
        alert("Could not find stall");
        return;
      }

      await recordWasteWorkflow({
        stallId: stall.id,
        productId,
        quantity: Number(quantity),
        reason,
        notes,
      });

      setProductId("");
      setQuantity("");
      setReason("damaged");
      setNotes("");

      await Promise.all([loadProducts(), loadLogs()]);
      alert("Waste recorded successfully");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unable to record waste right now."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#080604] p-8 text-white">
      <h1 className="text-4xl font-bold text-[#d08a35]">Waste Log</h1>
      <p className="mt-2 text-zinc-400">
        Record damaged, melted, expired, sampled, or missing stock.
      </p>

      <form
        onSubmit={recordWaste}
        className="mt-8 grid gap-5 rounded-[2rem] border border-[#c47a2c]/20 bg-white/5 p-6 md:grid-cols-2"
      >
        <select
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
          className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4"
        >
          <option value="">Select product</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.product_name} - Stock {product.stock_qty ?? 0}
            </option>
          ))}
        </select>

        <input
          type="number"
          placeholder="Quantity wasted"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none"
        />

        <select
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4"
        >
          {WASTE_REASONS.map((wasteReason) => (
            <option key={wasteReason} value={wasteReason}>
              {wasteReason.charAt(0).toUpperCase() + wasteReason.slice(1)}
            </option>
          ))}
        </select>

        <div className="rounded-2xl border border-[#d08a35]/20 bg-black/40 px-4 py-4">
          Waste Value:{" "}
          <span className="font-bold text-[#d08a35]">
            {formatCurrency(wasteValue)}
          </span>
        </div>

        <textarea
          placeholder="Notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none md:col-span-2"
        />

        <button
          disabled={loading}
          className="rounded-2xl bg-[#d08a35] px-5 py-4 font-bold text-black hover:bg-[#e9a34c] disabled:opacity-50 md:col-span-2"
        >
          {loading ? "Recording..." : "Record Waste"}
        </button>
      </form>

      <div className="mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/10 text-zinc-300">
            <tr>
              <th className="p-4">Product</th>
              <th className="p-4">Qty</th>
              <th className="p-4">Reason</th>
              <th className="p-4">Value</th>
              <th className="p-4">Notes</th>
            </tr>
          </thead>

          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-white/10">
                <td className="p-4">
                  {productMap.get(log.product_id)?.product_name || "Unknown"}
                </td>
                <td className="p-4">{log.quantity}</td>
                <td className="p-4 capitalize text-[#d08a35]">{log.reason}</td>
                <td className="p-4">{formatCurrency(log.value_amount)}</td>
                <td className="p-4 text-zinc-400">{log.notes || "-"}</td>
              </tr>
            ))}

            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-zinc-500">
                  No waste recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
