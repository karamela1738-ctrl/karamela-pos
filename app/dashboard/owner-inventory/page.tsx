"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Product = {
  id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  stock_qty: number | null;
  reorder_level: number | null;
  cost_price: number | null;
  selling_price: number | null;
};

type SaleItem = {
  product_id: string | null;
  product_name: string;
  quantity: number;
  subtotal: number;
};

export default function OwnerInventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [search, setSearch] = useState("");

  const [showAddInventory, setShowAddInventory] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantityReceived, setQuantityReceived] = useState("");
  const [restockNotes, setRestockNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadData() {
    const { data: productData, error: productError } = await supabase
      .from("products")
      .select("*")
      .order("product_name");

    if (productError) {
      alert(productError.message);
      return;
    }

    const { data: salesData } = await supabase
      .from("sale_items")
      .select("product_id, product_name, quantity, subtotal");

    setProducts((productData || []) as Product[]);
    setSaleItems((salesData || []) as SaleItem[]);
  }

  useEffect(() => {
    loadData();
  }, []);

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

    const { data: stall } = await supabase
      .from("stalls")
      .select("id")
      .limit(1)
      .single();

    const { error: updateError } = await supabase
      .from("products")
      .update({
        stock_qty: newStock,
      })
      .eq("id", selectedProductId);

    if (updateError) {
      setSaving(false);
      alert(updateError.message);
      return;
    }

    await supabase.from("inventory_movements").insert({
      stall_id: stall?.id,
      product_id: selectedProductId,
      movement_type: "issuance",
      quantity: receivedQty,
      notes:
        restockNotes ||
        `Stock added by owner. Previous stock ${currentStock}, new stock ${newStock}`,
    });

    setSelectedProductId("");
    setQuantityReceived("");
    setRestockNotes("");
    setShowAddInventory(false);
    setSaving(false);

    await loadData();

    alert("Inventory added successfully");
  }

  const inventoryValue = products.reduce((sum, product) => {
    return sum + Number(product.stock_qty || 0) * Number(product.cost_price || 0);
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
    const map = new Map<
      string,
      { product_name: string; quantity: number; revenue: number }
    >();

    saleItems.forEach((item) => {
      const key = item.product_id || item.product_name;
      const existing = map.get(key);

      if (existing) {
        existing.quantity += Number(item.quantity || 0);
        existing.revenue += Number(item.subtotal || 0);
      } else {
        map.set(key, {
          product_name: item.product_name,
          quantity: Number(item.quantity || 0),
          revenue: Number(item.subtotal || 0),
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
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
      ? `🚨 ${outOfStock.length} products are out of stock.`
      : "✅ No products are currently out of stock.",
    lowStock.length > 0
      ? `⚠️ ${lowStock.length} products are below reorder level.`
      : "✅ Stock levels look healthy.",
    fastMovers[0]
      ? `📈 ${fastMovers[0].product_name} is the fastest moving product.`
      : "📊 Fast movers will appear after sales are recorded.",
    inventoryValue > 0
      ? `💰 Current inventory value is KES ${inventoryValue.toLocaleString()}.`
      : "💰 Inventory value will appear after cost prices are added.",
  ];

  return (
    <main className="min-h-screen bg-[#080604] p-8 text-white">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-[#d08a35]">
            Owner Inventory
          </p>

          <h1 className="mt-3 text-5xl font-bold text-white">
            Inventory Command Center
          </h1>

          <p className="mt-3 text-zinc-400">
            Monitor stock value, low-stock alerts, fast movers, slow movers and
            product performance.
          </p>
        </div>

        <button
          onClick={() => setShowAddInventory(true)}
          className="rounded-2xl bg-[#d08a35] px-6 py-4 font-bold text-black hover:bg-[#e9a34c]"
        >
          + Add Inventory
        </button>
      </div>

      <section className="mt-8 grid gap-5 md:grid-cols-4">
        <Card title="Total Products" value={products.length.toString()} />
        <Card
          title="Inventory Value"
          value={`KES ${inventoryValue.toLocaleString()}`}
        />
        <Card title="Low Stock" value={lowStock.length.toString()} />
        <Card title="Out of Stock" value={outOfStock.length.toString()} />
      </section>

      <section className="mt-8 rounded-[2rem] border border-[#d08a35]/20 bg-white/5 p-6">
        <h2 className="text-2xl font-bold text-[#d08a35]">
          Alerts & Business Insights
        </h2>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {insights.map((insight, index) => (
            <div
              key={index}
              className="rounded-2xl border border-white/10 bg-black/30 p-5 text-zinc-300"
            >
              {insight}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <Panel title="Fast Movers">
          {fastMovers.length === 0 ? (
            <p className="text-zinc-500">No sales recorded yet.</p>
          ) : (
            fastMovers.map((item, index) => (
              <div
                key={item.product_name}
                className="flex justify-between border-b border-white/10 py-3"
              >
                <span>
                  {index + 1}. {item.product_name}
                </span>
                <span className="text-[#d08a35]">{item.quantity} sold</span>
              </div>
            ))
          )}
        </Panel>

        <Panel title="Slow Movers">
          {slowMovers.length === 0 ? (
            <p className="text-zinc-500">No slow movers detected.</p>
          ) : (
            slowMovers.map((product, index) => (
              <div
                key={product.id}
                className="flex justify-between border-b border-white/10 py-3"
              >
                <span>
                  {index + 1}. {product.product_name}
                </span>
                <span className="text-zinc-500">No sales</span>
              </div>
            ))
          )}
        </Panel>
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

                  <td className="p-4">KES {product.cost_price || 0}</td>
                  <td className="p-4 text-[#d08a35]">
                    KES {product.selling_price || 0}
                  </td>

                  <td className="p-4">KES {value.toLocaleString()}</td>

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
                  {product.product_name} — Current stock {product.stock_qty ?? 0}
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

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-3xl border border-[#d08a35]/20 bg-white/5 p-6">
      <p className="text-sm text-zinc-400">{title}</p>
      <p className="mt-3 text-3xl font-bold text-[#d08a35]">{value}</p>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[2rem] border border-[#d08a35]/20 bg-white/5 p-6">
      <h2 className="text-2xl font-bold text-[#d08a35]">{title}</h2>
      <div className="mt-5">{children}</div>
    </div>
  );
}