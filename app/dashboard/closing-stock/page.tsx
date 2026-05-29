"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Product = {
  id: string;
  product_name: string;
  brand: string | null;
  stock_qty: number | null;
  selling_price: number | null;
};

type CountItem = {
  product_id: string;
  actual_quantity: string;
  notes: string;
};

export default function ClosingStockPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [counts, setCounts] = useState<Record<string, CountItem>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  async function loadProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("id, product_name, brand, stock_qty, selling_price")
      .order("product_name");

    if (error) {
      alert(error.message);
      return;
    }

    setProducts(data || []);
  }

  useEffect(() => {
    loadProducts();
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter((product) =>
      `${product.product_name} ${product.brand || ""}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  }, [products, search]);

  function updateCount(productId: string, field: "actual_quantity" | "notes", value: string) {
    setCounts((prev) => ({
      ...prev,
      [productId]: {
        product_id: productId,
        actual_quantity: prev[productId]?.actual_quantity || "",
        notes: prev[productId]?.notes || "",
        [field]: value,
      },
    }));
  }

  async function submitClosingStock() {
    const countEntries = Object.values(counts).filter(
      (item) => item.actual_quantity !== ""
    );

    if (countEntries.length === 0) {
      alert("Enter at least one product count");
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

    const rows = countEntries.map((item) => {
      const product = products.find((p) => p.id === item.product_id);
      const expected = Number(product?.stock_qty || 0);
      const actual = Number(item.actual_quantity || 0);

      return {
        stall_id: stall.id,
        product_id: item.product_id,
        business_date: new Date().toISOString().slice(0, 10),
        expected_quantity: expected,
        actual_quantity: actual,
        notes: item.notes,
      };
    });

    const { error } = await supabase
      .from("closing_stock_counts")
      .upsert(rows, {
        onConflict: "stall_id,product_id,business_date",
      });

    if (error) {
      setLoading(false);
      alert(error.message);
      return;
    }

    const movements = rows
      .filter((row) => row.actual_quantity !== row.expected_quantity)
      .map((row) => ({
        stall_id: row.stall_id,
        product_id: row.product_id,
        movement_type: "closing_variance",
        quantity: row.actual_quantity - row.expected_quantity,
        notes: `Closing variance. Expected ${row.expected_quantity}, actual ${row.actual_quantity}`,
      }));

    if (movements.length > 0) {
      await supabase.from("inventory_movements").insert(movements);
    }

    for (const row of rows) {
      await supabase
        .from("products")
        .update({ stock_qty: row.actual_quantity })
        .eq("id", row.product_id);
    }

    setCounts({});
    setLoading(false);
    await loadProducts();

    alert("Closing stock saved successfully");
  }

  function variance(product: Product) {
    const actual = counts[product.id]?.actual_quantity;
    if (actual === "" || actual === undefined) return null;

    return Number(actual) - Number(product.stock_qty || 0);
  }

  return (
    <main className="min-h-screen bg-[#080604] p-8 text-white">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-4xl font-bold text-[#d08a35]">
            Closing Stock Count
          </h1>
          <p className="mt-2 text-zinc-400">
            Count actual stock at the end of the day. The system compares it
            against expected stock.
          </p>
        </div>

        <button
          onClick={submitClosingStock}
          disabled={loading}
          className="rounded-2xl bg-[#d08a35] px-6 py-4 font-bold text-black hover:bg-[#e9a34c] disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Closing Count"}
        </button>
      </div>

      <input
        placeholder="Search product..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mt-8 w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 outline-none"
      />

      <div className="mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/10 text-zinc-300">
            <tr>
              <th className="p-4">Product</th>
              <th className="p-4">Expected</th>
              <th className="p-4">Actual Count</th>
              <th className="p-4">Variance</th>
              <th className="p-4">Notes</th>
            </tr>
          </thead>

          <tbody>
            {filteredProducts.map((product) => {
              const v = variance(product);

              return (
                <tr key={product.id} className="border-t border-white/10">
                  <td className="p-4">
                    <p className="font-medium">{product.product_name}</p>
                    <p className="text-xs text-zinc-500">
                      {product.brand || "-"}
                    </p>
                  </td>

                  <td className="p-4">{product.stock_qty ?? 0}</td>

                  <td className="p-4">
                    <input
                      type="number"
                      value={counts[product.id]?.actual_quantity || ""}
                      onChange={(e) =>
                        updateCount(
                          product.id,
                          "actual_quantity",
                          e.target.value
                        )
                      }
                      className="w-28 rounded-xl border border-white/10 bg-black/40 px-3 py-2 outline-none"
                    />
                  </td>

                  <td
                    className={`p-4 font-bold ${
                      v === null
                        ? "text-zinc-500"
                        : v < 0
                        ? "text-red-300"
                        : v > 0
                        ? "text-green-300"
                        : "text-[#d08a35]"
                    }`}
                  >
                    {v === null ? "-" : v}
                  </td>

                  <td className="p-4">
                    <input
                      value={counts[product.id]?.notes || ""}
                      onChange={(e) =>
                        updateCount(product.id, "notes", e.target.value)
                      }
                      placeholder="Optional"
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 outline-none"
                    />
                  </td>
                </tr>
              );
            })}

            {filteredProducts.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-zinc-500">
                  No products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}