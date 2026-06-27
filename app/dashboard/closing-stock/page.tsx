"use client";

import { useEffect, useMemo, useState } from "react";
import { getProducts, type Product } from "@/lib/services/inventory";
import {
  getBusinessDayStatus,
  type BusinessDayStatus,
} from "@/lib/services/operations";
import { getMainStall } from "@/lib/services/stalls";
import { submitClosingStockWorkflow } from "@/lib/services/workflows";
import { triggerDashboardRefresh } from "@/lib/utils/dashboard-refresh";
import { formatDate } from "@/lib/utils/format";

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
  const [status, setStatus] = useState<BusinessDayStatus | null>(null);

  async function loadProducts() {
    try {
      setProducts(await getProducts());
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to load products.");
    }
  }

  useEffect(() => {
    void Promise.all([loadProducts(), loadStatus()]);
  }, []);

  async function loadStatus() {
    try {
      setStatus(await getBusinessDayStatus());
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unable to load business day status."
      );
    }
  }

  const filteredProducts = useMemo(
    () =>
      products.filter((product) =>
        `${product.product_name} ${product.brand || ""}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [products, search]
  );

  function updateCount(
    productId: string,
    field: "actual_quantity" | "notes",
    value: string
  ) {
    setCounts((current) => ({
      ...current,
      [productId]: {
        product_id: productId,
        actual_quantity: current[productId]?.actual_quantity || "",
        notes: current[productId]?.notes || "",
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

    if (status?.closing_stock_complete) {
      alert("Closing stock has already been submitted for this business date.");
      return;
    }

    setLoading(true);

    try {
      const stall = await getMainStall();

      if (!stall) {
        alert("Could not find stall");
        return;
      }

      await submitClosingStockWorkflow({
        stallId: stall.id,
        businessDate: status?.business_date || "",
        counts: countEntries.map((item) => ({
          productId: item.product_id,
          actualQuantity: Number(item.actual_quantity || 0),
          notes: item.notes,
        })),
      });

      setCounts({});
      await Promise.all([loadProducts(), loadStatus()]);
      triggerDashboardRefresh("closing-stock");
      alert("Closing stock saved successfully");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unable to save closing stock right now."
      );
    } finally {
      setLoading(false);
    }
  }

  function variance(product: Product) {
    const actualQuantity = counts[product.id]?.actual_quantity;

    if (actualQuantity === "" || actualQuantity === undefined) {
      return null;
    }

    return Number(actualQuantity) - Number(product.stock_qty || 0);
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
          <p className="mt-3 text-sm text-zinc-500">
            Business date: {status?.business_date ? formatDate(status.business_date) : "--"}
          </p>
        </div>

        <button
          type="button"
          onClick={submitClosingStock}
          disabled={loading}
          className="rounded-2xl bg-[#d08a35] px-6 py-4 font-bold text-black hover:bg-[#e9a34c] disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Closing Count"}
        </button>
      </div>

      {status?.closing_stock_complete && (
        <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
          Closing stock is already locked for this business date. Same-day edits
          are blocked to preserve the audit trail.
        </div>
      )}

      <input
        placeholder="Search product..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
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
              const currentVariance = variance(product);

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
                      onChange={(event) =>
                        updateCount(
                          product.id,
                          "actual_quantity",
                          event.target.value
                        )
                      }
                      className="w-28 rounded-xl border border-white/10 bg-black/40 px-3 py-2 outline-none"
                    />
                  </td>

                  <td
                    className={`p-4 font-bold ${
                      currentVariance === null
                        ? "text-zinc-500"
                        : currentVariance < 0
                          ? "text-red-300"
                          : currentVariance > 0
                            ? "text-green-300"
                            : "text-[#d08a35]"
                    }`}
                  >
                    {currentVariance === null ? "-" : currentVariance}
                  </td>

                  <td className="p-4">
                    <input
                      value={counts[product.id]?.notes || ""}
                      onChange={(event) =>
                        updateCount(product.id, "notes", event.target.value)
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
