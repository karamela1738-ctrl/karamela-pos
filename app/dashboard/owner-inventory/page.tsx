"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DashboardInsightsSection,
  DashboardListRow,
  DashboardMetricCard,
  DashboardPageHeader,
  DashboardPanel,
  DashboardPeriodSelect,
} from "@/components/dashboard/ui";
import {
  getProducts,
  type Product,
} from "@/lib/services/inventory";
import { getMainStall } from "@/lib/services/stalls";
import { supabase } from "@/lib/supabase/client";
import { restockProductWorkflow } from "@/lib/services/workflows";
import { formatCurrency } from "@/lib/utils/format";
import {
  getPeriodDateRange,
  type DashboardPeriod,
} from "@/lib/utils/period";

type Sale = {
  id: string;
  created_at: string;
};

type SaleItemSummary = {
  sale_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  subtotal: number;
};

export default function OwnerInventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItemSummary[]>([]);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<DashboardPeriod>("30days");

  const [showAddInventory, setShowAddInventory] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantityReceived, setQuantityReceived] = useState("");
  const [restockNotes, setRestockNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadData() {
    try {
      const stall = await getMainStall();

      if (!stall) {
        throw new Error("Could not find stall");
      }

      const dateRange = getPeriodDateRange(period);

      let salesQuery = supabase
        .from("sales")
        .select("id,created_at")
        .eq("stall_id", stall.id)
        .order("created_at", { ascending: false });

      if (dateRange) {
        salesQuery = salesQuery
          .gte("created_at", dateRange.start)
          .lte("created_at", dateRange.end);
      }

      const [productData, salesData, saleItemsResponse] = await Promise.all([
        getProducts(),
        salesQuery,
        supabase
          .from("sale_items")
          .select("sale_id,product_id,product_name,quantity,subtotal"),
      ]);

      const filteredSales = (salesData.data || []) as Sale[];
      const saleIds = new Set(filteredSales.map((sale) => sale.id));
      const filteredSaleItems = (
        (saleItemsResponse.data || []) as SaleItemSummary[]
      ).filter((item) => saleIds.has(item.sale_id));

      setProducts(productData);
      setSaleItems(filteredSaleItems);
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unable to load inventory data."
      );
    }
  }

  useEffect(() => {
    void loadData();
  }, [period]);

  const selectedProduct = products.find(
    (product) => product.id === selectedProductId
  );

  const currentStock = Number(selectedProduct?.stock_qty || 0);
  const receivedQty = Number(quantityReceived || 0);
  const newStock = currentStock + receivedQty;

  async function addInventory(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedProductId) {
      alert("Select a product");
      return;
    }

    if (!quantityReceived || Number(quantityReceived) <= 0) {
      alert("Enter quantity received");
      return;
    }

    setSaving(true);

    try {
      const stall = await getMainStall();

      if (!stall) {
        alert("Could not find stall");
        return;
      }

      await restockProductWorkflow({
        stallId: stall.id,
        productId: selectedProductId,
        quantity: receivedQty,
        notes:
          restockNotes ||
          `Stock added by owner. Previous stock ${currentStock}, new stock ${newStock}`,
      });

      setSelectedProductId("");
      setQuantityReceived("");
      setRestockNotes("");
      setShowAddInventory(false);

      await loadData();

      alert("Inventory added successfully");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unable to add inventory right now."
      );
    } finally {
      setSaving(false);
    }
  }

  const inventoryValue = products.reduce((sum, product) => {
    return (
      sum +
      Number(product.stock_qty || 0) * Number(product.cost_price || 0)
    );
  }, 0);

  const lowStock = products.filter((product) => {
    return (
      Number(product.stock_qty || 0) > 0 &&
      Number(product.stock_qty || 0) <= Number(product.reorder_level || 5)
    );
  });

  const outOfStock = products.filter(
    (product) => Number(product.stock_qty || 0) <= 0
  );

  const productSales = useMemo(() => {
    const salesMap = new Map<
      string,
      { product_name: string; quantity: number; revenue: number }
    >();

    saleItems.forEach((item) => {
      const key = item.product_id || item.product_name;
      const existing = salesMap.get(key);

      if (existing) {
        existing.quantity += Number(item.quantity || 0);
        existing.revenue += Number(item.subtotal || 0);
        return;
      }

      salesMap.set(key, {
        product_name: item.product_name,
        quantity: Number(item.quantity || 0),
        revenue: Number(item.subtotal || 0),
      });
    });

    return Array.from(salesMap.values()).sort((a, b) => b.quantity - a.quantity);
  }, [saleItems]);

  const fastMovers = productSales.slice(0, 5);

  const slowMovers = products
    .filter(
      (product) =>
        !productSales.find((sale) => sale.product_name === product.product_name)
    )
    .slice(0, 5);

  const filteredProducts = products.filter((product) =>
    `${product.product_name} ${product.brand || ""} ${product.category || ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const insights = [
    outOfStock.length > 0
      ? `${outOfStock.length} products are out of stock.`
      : "No products are currently out of stock.",
    lowStock.length > 0
      ? `${lowStock.length} products are below reorder level.`
      : "Stock levels look healthy.",
    fastMovers[0]
      ? `${fastMovers[0].product_name} is the fastest moving product.`
      : "Fast movers will appear after sales are recorded.",
    inventoryValue > 0
      ? `Current inventory value is ${formatCurrency(inventoryValue)}.`
      : "Inventory value will appear after cost prices are added.",
  ];

  return (
    <main className="min-h-screen bg-[#080604] p-8 text-white">
      <DashboardPageHeader
        eyebrow="Owner Inventory"
        title="Inventory Command Center"
        description="Monitor stock value, low-stock alerts, fast movers, slow movers and product performance."
        actions={
          <div className="flex gap-3">
            <DashboardPeriodSelect value={period} onChange={setPeriod} />
            <button
              type="button"
              onClick={() => setShowAddInventory(true)}
              className="rounded-2xl bg-[#d08a35] px-6 py-4 font-bold text-black hover:bg-[#e9a34c]"
            >
              + Add Inventory
            </button>
          </div>
        }
      />

      <section className="mt-8 grid gap-5 md:grid-cols-4">
        <DashboardMetricCard
          title="Total Products"
          value={products.length.toString()}
        />
        <DashboardMetricCard
          title="Inventory Value"
          value={formatCurrency(inventoryValue)}
        />
        <DashboardMetricCard
          title="Low Stock"
          value={lowStock.length.toString()}
        />
        <DashboardMetricCard
          title="Out of Stock"
          value={outOfStock.length.toString()}
        />
      </section>

      <div className="mt-8">
        <DashboardInsightsSection
          title="Alerts & Business Insights"
          insights={insights}
        />
      </div>

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <DashboardPanel title="Fast Movers">
          {fastMovers.length === 0 ? (
            <p className="text-zinc-500">No sales recorded yet.</p>
          ) : (
            fastMovers.map((item, index) => (
              <DashboardListRow
                key={item.product_name}
                left={`${index + 1}. ${item.product_name}`}
                right={`${item.quantity} sold`}
              />
            ))
          )}
        </DashboardPanel>

        <DashboardPanel title="Slow Movers">
          {slowMovers.length === 0 ? (
            <p className="text-zinc-500">No slow movers detected.</p>
          ) : (
            slowMovers.map((product, index) => (
              <DashboardListRow
                key={product.id}
                left={`${index + 1}. ${product.product_name}`}
                right="No sales"
                rightClassName="text-zinc-500"
              />
            ))
          )}
        </DashboardPanel>
      </section>

      <input
        placeholder="Search inventory..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mt-8 w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 outline-none"
      />

      <section className="mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/10 text-zinc-300">
            <tr>
              <th className="p-4">Product</th>
              <th className="p-4">Category</th>
              <th className="p-4">Stock</th>
              <th className="p-4">Reorder</th>
              <th className="p-4">Cost</th>
              <th className="p-4">Sell</th>
              <th className="p-4">Value</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>

          <tbody>
            {filteredProducts.map((product) => {
              const stock = Number(product.stock_qty || 0);
              const reorder = Number(product.reorder_level || 5);
              const value = stock * Number(product.cost_price || 0);
              const status =
                stock <= 0 ? "Out" : stock <= reorder ? "Low" : "Healthy";

              return (
                <tr key={product.id} className="border-t border-white/10">
                  <td className="p-4">
                    <p className="font-medium">{product.product_name}</p>
                    <p className="text-xs text-zinc-500">
                      {product.brand || "-"}
                    </p>
                  </td>

                  <td className="p-4 text-zinc-400">
                    {product.category || "-"}
                  </td>

                  <td className="p-4">{stock}</td>
                  <td className="p-4">{reorder}</td>

                  <td className="p-4">{formatCurrency(product.cost_price)}</td>
                  <td className="p-4 text-[#d08a35]">
                    {formatCurrency(product.selling_price)}
                  </td>

                  <td className="p-4">{formatCurrency(value)}</td>

                  <td className="p-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        status === "Out"
                          ? "bg-red-500/20 text-red-300"
                          : status === "Low"
                            ? "bg-yellow-500/20 text-yellow-300"
                            : "bg-green-500/20 text-green-300"
                      }`}
                    >
                      {status}
                    </span>
                  </td>
                </tr>
              );
            })}

            {filteredProducts.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-zinc-500">
                  No products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {showAddInventory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={addInventory}
            className="w-full max-w-xl rounded-[2rem] border border-[#d08a35]/30 bg-[#100a05] p-6 shadow-2xl"
          >
            <h2 className="text-3xl font-bold text-[#d08a35]">
              Add Inventory
            </h2>

            <p className="mt-2 text-sm text-zinc-400">
              Add newly received stock and update inventory automatically.
            </p>

            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="mt-6 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none"
            >
              <option value="">Select product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.product_name} - Current stock {product.stock_qty ?? 0}
                </option>
              ))}
            </select>

            {selectedProduct && (
              <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm md:grid-cols-3">
                <div>
                  <p className="text-zinc-500">Current</p>
                  <p className="text-xl font-bold">{currentStock}</p>
                </div>

                <div>
                  <p className="text-zinc-500">Adding</p>
                  <p className="text-xl font-bold text-[#d08a35]">
                    {receivedQty}
                  </p>
                </div>

                <div>
                  <p className="text-zinc-500">New Stock</p>
                  <p className="text-xl font-bold text-green-300">{newStock}</p>
                </div>
              </div>
            )}

            <input
              type="number"
              placeholder="Quantity received"
              value={quantityReceived}
              onChange={(e) => setQuantityReceived(e.target.value)}
              className="mt-4 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none"
            />

            <textarea
              placeholder="Notes e.g. Received new supplier stock"
              value={restockNotes}
              onChange={(e) => setRestockNotes(e.target.value)}
              className="mt-4 min-h-28 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none"
            />

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowAddInventory(false)}
                className="flex-1 rounded-2xl border border-white/10 bg-white/5 py-4 font-bold text-white"
              >
                Cancel
              </button>

              <button
                disabled={saving}
                className="flex-1 rounded-2xl bg-[#d08a35] py-4 font-bold text-black hover:bg-[#e9a34c] disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Inventory"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
