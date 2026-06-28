"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getProducts, type Product } from "@/lib/services/inventory";
import { getMainStall } from "@/lib/services/stalls";
import { completeSaleWorkflow } from "@/lib/services/workflows";
import { triggerDashboardRefresh } from "@/lib/utils/dashboard-refresh";
import { formatCurrency } from "@/lib/utils/format";
import { writeStoredReceipt } from "@/lib/utils/receipt";
import {
  clearPendingSaleReference,
  getOrCreatePendingSaleReference,
} from "@/lib/utils/sale-reference";

type CartItem = Product & {
  qty: number;
};

const PAYMENT_METHODS = ["cash", "mpesa", "card"];

export default function POSPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadProducts() {
    try {
      const allProducts = await getProducts();
      setProducts(allProducts.slice(0, 100));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to load products.");
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadProducts();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const filteredProducts = useMemo(
    () =>
      products.filter((product) =>
        `${product.product_name} ${product.brand || ""} ${product.barcode || ""}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [products, search]
  );

  const total = useMemo(
    () =>
      cart.reduce(
        (sum, item) => sum + item.qty * Number(item.selling_price || 0),
        0
      ),
    [cart]
  );

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

    try {
      const stall = await getMainStall();

      if (!stall) {
        alert("Could not find stall");
        return;
      }

      const paidAmount = Number(amountPaid || total);
      const clientReference = getOrCreatePendingSaleReference();
      const receipt = await completeSaleWorkflow({
        stallId: stall.id,
        paymentMethod,
        amountPaid: paidAmount,
        clientReference,
        items: cart.map((item) => ({
          productId: item.id,
          quantity: item.qty,
        })),
      });

      writeStoredReceipt(receipt);
      clearPendingSaleReference();
      triggerDashboardRefresh("sale");

      setCart([]);
      setAmountPaid("");
      router.push("/dashboard/receipt");
    } catch (error) {
      console.error(error);
      alert("Something went wrong while completing the sale.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="dashboard-page-shell">
      <div className="dashboard-width">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#d08a35] sm:text-4xl">Sales POS</h1>
          <p className="text-zinc-400">Fast tablet sales screen</p>
        </div>

        <div className="w-full rounded-2xl border border-[#d08a35]/30 bg-white/5 px-5 py-3 sm:w-auto">
          <p className="text-sm text-zinc-400">Total</p>
          <p className="text-3xl font-bold text-[#d08a35]">
            {formatCurrency(total)}
          </p>
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section>
          <input
            placeholder="Search product or barcode..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="mb-6 w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 outline-none"
          />

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => addToCart(product)}
                className="rounded-3xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-[#d08a35]/60 hover:bg-[#d08a35]/10 sm:p-5"
              >
                <p className="text-base font-bold sm:text-lg">{product.product_name}</p>
                <p className="mt-1 text-sm text-zinc-400">{product.brand}</p>
                <p className="mt-4 text-xl font-bold text-[#d08a35]">
                  {formatCurrency(product.selling_price)}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Stock: {product.stock_qty || 0}
                </p>
              </button>
            ))}
          </div>
        </section>

        <aside className="order-first rounded-[2rem] border border-[#d08a35]/20 bg-white/5 p-5 xl:order-last xl:sticky xl:top-6">
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
                      {formatCurrency(item.selling_price)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="text-sm text-red-300"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => reduceQty(item.id)}
                      className="h-9 w-9 rounded-xl bg-white/10"
                    >
                      -
                    </button>
                    <span>{item.qty}</span>
                    <button
                      type="button"
                      onClick={() => addToCart(item)}
                      className="h-9 w-9 rounded-xl bg-white/10"
                    >
                      +
                    </button>
                  </div>

                  <p className="font-bold text-[#d08a35]">
                    {formatCurrency(item.qty * Number(item.selling_price || 0))}
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
              onChange={(event) => setPaymentMethod(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3"
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method.charAt(0).toUpperCase() + method.slice(1)}
                </option>
              ))}
            </select>

            <input
              type="number"
              placeholder="Amount paid"
              value={amountPaid}
              onChange={(event) => setAmountPaid(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 outline-none"
            />

            <div className="rounded-2xl bg-black/30 p-4">
              <div className="flex justify-between">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
              <div className="mt-2 flex justify-between text-[#d08a35]">
                <span>Change</span>
                <span>{formatCurrency(change > 0 ? change : 0)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={completeSale}
              disabled={loading}
              className="w-full rounded-2xl bg-[#d08a35] py-4 font-bold text-black hover:bg-[#e9a34c] disabled:opacity-50"
            >
              {loading ? "Completing..." : "Complete Sale"}
            </button>
          </div>
        </aside>
      </div>
      </div>
    </main>
  );
}
