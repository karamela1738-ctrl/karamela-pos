"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Product = {
  id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  selling_price: number | null;
  stock_qty: number | null;
};

type CartItem = Product & {
  qty: number;
};

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("id, product_name, brand, category, barcode, selling_price, stock_qty")
      .order("product_name")
      .limit(100);

    if (error) {
      alert(error.message);
      return;
    }

    setProducts(data || []);
  }

  useEffect(() => {
    loadProducts();
  }, []);

  const filteredProducts = products.filter((product) =>
    `${product.product_name} ${product.brand} ${product.barcode}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const total = useMemo(() => {
    return cart.reduce(
      (sum, item) => sum + item.qty * Number(item.selling_price || 0),
      0
    );
  }, [cart]);

  const change = Number(amountPaid || 0) - total;

  function addToCart(product: Product) {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);

      if (existing) {
        return current.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }

      return [...current, { ...product, qty: 1 }];
    });
  }

  function reduceQty(productId: string) {
    setCart((current) =>
      current
        .map((item) =>
          item.id === productId ? { ...item, qty: item.qty - 1 } : item
        )
        .filter((item) => item.qty > 0)
    );
  }

  function removeItem(productId: string) {
    setCart((current) => current.filter((item) => item.id !== productId));
  }

  async function completeSale() {
    if (cart.length === 0) {
      alert("Cart is empty");
      return;
    }

    setLoading(true);

    const staffRaw = localStorage.getItem("karamela_staff");
    const staff = staffRaw ? JSON.parse(staffRaw) : null;

    const { data: stall } = await supabase
      .from("stalls")
      .select("id")
      .limit(1)
      .single();

    const { data: sale, error: saleError } = await supabase
      .from("sales")
      .insert({
        stall_id: stall?.id,
        cashier_id: null,
        total_amount: total,
        payment_method: paymentMethod,
        amount_paid: Number(amountPaid || total),
        change_amount: change > 0 ? change : 0,
      })
      .select()
      .single();

    if (saleError || !sale) {
      setLoading(false);
      alert(saleError?.message || "Sale failed");
      return;
    }

    const saleItems = cart.map((item) => ({
      sale_id: sale.id,
      product_id: item.id,
      product_name: item.product_name,
      quantity: item.qty,
      unit_price: Number(item.selling_price || 0),
      cost_price: 0,
      subtotal: item.qty * Number(item.selling_price || 0),
    }));

    const { error: itemsError } = await supabase
      .from("sale_items")
      .insert(saleItems);

    if (itemsError) {
      setLoading(false);
      alert(itemsError.message);
      return;
    }

    const movements = cart.map((item) => ({
      stall_id: stall?.id,
      product_id: item.id,
      movement_type: "sale",
      quantity: -item.qty,
      reference_id: sale.id,
      notes: `Sold by ${staff?.full_name || "staff"}`,
    }));

    await supabase.from("inventory_movements").insert(movements);

    for (const item of cart) {
      await supabase
        .from("products")
        .update({
          stock_qty: Number(item.stock_qty || 0) - item.qty,
        })
        .eq("id", item.id);
    }

    setCart([]);
    setAmountPaid("");
    setLoading(false);
    await loadProducts();

    alert("Sale completed successfully");
  }

  return (
    <main className="min-h-screen bg-[#080604] p-6 text-white">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-[#d08a35]">Sales POS</h1>
          <p className="text-zinc-400">Fast tablet sales screen</p>
        </div>

        <div className="rounded-2xl border border-[#d08a35]/30 bg-white/5 px-5 py-3">
          <p className="text-sm text-zinc-400">Total</p>
          <p className="text-3xl font-bold text-[#d08a35]">KES {total}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <section>
          <input
            placeholder="Search product or barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-6 w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 outline-none"
          />

          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="rounded-3xl border border-white/10 bg-white/5 p-5 text-left transition hover:border-[#d08a35]/60 hover:bg-[#d08a35]/10"
              >
                <p className="text-lg font-bold">{product.product_name}</p>
                <p className="mt-1 text-sm text-zinc-400">{product.brand}</p>
                <p className="mt-4 text-xl font-bold text-[#d08a35]">
                  KES {product.selling_price || 0}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Stock: {product.stock_qty || 0}
                </p>
              </button>
            ))}
          </div>
        </section>

        <aside className="rounded-[2rem] border border-[#d08a35]/20 bg-white/5 p-5">
          <h2 className="text-2xl font-bold text-[#d08a35]">Cart</h2>

          <div className="mt-5 space-y-3">
            {cart.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="font-semibold">{item.product_name}</p>
                    <p className="text-sm text-zinc-400">
                      KES {item.selling_price || 0}
                    </p>
                  </div>

                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-sm text-red-300"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => reduceQty(item.id)}
                      className="h-9 w-9 rounded-xl bg-white/10"
                    >
                      -
                    </button>
                    <span>{item.qty}</span>
                    <button
                      onClick={() => addToCart(item)}
                      className="h-9 w-9 rounded-xl bg-white/10"
                    >
                      +
                    </button>
                  </div>

                  <p className="font-bold text-[#d08a35]">
                    KES {item.qty * Number(item.selling_price || 0)}
                  </p>
                </div>
              </div>
            ))}

            {cart.length === 0 && (
              <p className="rounded-2xl border border-white/10 p-5 text-center text-zinc-500">
                No items in cart
              </p>
            )}
          </div>

          <div className="mt-6 space-y-4">
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3"
            >
              <option value="cash">Cash</option>
              <option value="mpesa">Mpesa</option>
              <option value="card">Card</option>
              <option value="mixed">Mixed</option>
            </select>

            <input
              type="number"
              placeholder="Amount paid"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 outline-none"
            />

            <div className="rounded-2xl bg-black/30 p-4">
              <div className="flex justify-between">
                <span>Total</span>
                <span>KES {total}</span>
              </div>
              <div className="mt-2 flex justify-between text-[#d08a35]">
                <span>Change</span>
                <span>KES {change > 0 ? change : 0}</span>
              </div>
            </div>

            <button
              onClick={completeSale}
              disabled={loading}
              className="w-full rounded-2xl bg-[#d08a35] py-4 font-bold text-black hover:bg-[#e9a34c] disabled:opacity-50"
            >
              {loading ? "Completing..." : "Complete Sale"}
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}