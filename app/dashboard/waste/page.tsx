"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Product = {
  id: string;
  product_name: string;
  brand: string | null;
  selling_price: number | null;
  stock_qty: number | null;
};

type WasteLog = {
  id: string;
  product_id: string;
  quantity: number;
  reason: string;
  value_amount: number | null;
  notes: string | null;
  created_at: string;
};

export default function WastePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [logs, setLogs] = useState<WasteLog[]>([]);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("damaged");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("id, product_name, brand, selling_price, stock_qty")
      .order("product_name");

    if (error) {
      console.error("Products error:", error);
      return;
    }

    setProducts(data || []);
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
    loadProducts();
    loadLogs();
  }, []);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId]
  );

  const wasteValue =
    Number(quantity || 0) * Number(selectedProduct?.selling_price || 0);

  function productName(id: string) {
    return products.find((p) => p.id === id)?.product_name || "Unknown";
  }

  async function recordWaste(e: React.FormEvent) {
    e.preventDefault();

    if (!productId || !quantity) {
      alert("Select product and enter quantity");
      return;
    }

    setLoading(true);

    const { data: stall, error: stallError } = await supabase
      .from("stalls")
      .select("id")
      .limit(1)
      .single();

    if (stallError || !stall) {
      setLoading(false);
      alert("Could not find stall");
      return;
    }

    const { error: wasteError } = await supabase.from("waste_logs").insert({
      stall_id: stall.id,
      product_id: productId,
      quantity: Number(quantity),
      reason,
      value_amount: wasteValue,
      notes,
    });

    if (wasteError) {
      setLoading(false);
      alert(wasteError.message);
      return;
    }

    await supabase.from("inventory_movements").insert({
      stall_id: stall.id,
      product_id: productId,
      movement_type: "waste",
      quantity: -Number(quantity),
      notes: `${reason}: ${notes || "No notes"}`,
    });

    if (selectedProduct) {
      await supabase
        .from("products")
        .update({
          stock_qty: Number(selectedProduct.stock_qty || 0) - Number(quantity),
        })
        .eq("id", productId);
    }

    setProductId("");
    setQuantity("");
    setReason("damaged");
    setNotes("");
    setLoading(false);

    await loadProducts();
    await loadLogs();

    alert("Waste recorded successfully");
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
          onChange={(e) => setProductId(e.target.value)}
          className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4"
        >
          <option value="">Select product</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.product_name} — Stock {product.stock_qty ?? 0}
            </option>
          ))}
        </select>

        <input
          type="number"
          placeholder="Quantity wasted"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none"
        />

        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4"
        >
          <option value="damaged">Damaged</option>
          <option value="melted">Melted</option>
          <option value="expired">Expired</option>
          <option value="broken">Broken</option>
          <option value="sample">Sample</option>
          <option value="theft">Theft</option>
          <option value="unknown">Unknown</option>
          <option value="other">Other</option>
        </select>

        <div className="rounded-2xl border border-[#d08a35]/20 bg-black/40 px-4 py-4">
          Waste Value:{" "}
          <span className="font-bold text-[#d08a35]">KES {wasteValue}</span>
        </div>

        <textarea
          placeholder="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
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
                <td className="p-4">{productName(log.product_id)}</td>
                <td className="p-4">{log.quantity}</td>
                <td className="p-4 capitalize text-[#d08a35]">{log.reason}</td>
                <td className="p-4">KES {log.value_amount || 0}</td>
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