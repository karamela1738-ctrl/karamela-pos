"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Product = {
  id: string;
  stock_qty: number | null;
  cost_price: number | null;
  reorder_level: number | null;
};

type Sale = {
  id: string;
  total_amount: number | null;
  created_at: string;
};

type WasteLog = {
  id: string;
  value_amount: number | null;
  created_at: string;
};

export default function OwnerDashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [waste, setWaste] = useState<WasteLog[]>([]);

  async function loadData() {
    const { data: productData } = await supabase
      .from("products")
      .select("id, stock_qty, cost_price, reorder_level");

    const { data: salesData } = await supabase
      .from("sales")
      .select("id,total_amount,created_at");

    const { data: wasteData } = await supabase
      .from("waste_logs")
      .select("id,value_amount,created_at");

    setProducts(productData || []);
    setSales(salesData || []);
    setWaste(wasteData || []);
  }

  useEffect(() => {
    loadData();
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const todaySales = sales
    .filter((sale) => sale.created_at?.startsWith(today))
    .reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);

  const todayWaste = waste
    .filter((log) => log.created_at?.startsWith(today))
    .reduce((sum, log) => sum + Number(log.value_amount || 0), 0);

  const inventoryValue = products.reduce((sum, product) => {
    return sum + Number(product.stock_qty || 0) * Number(product.cost_price || 0);
  }, 0);

  const lowStock = products.filter(
    (product) =>
      Number(product.stock_qty || 0) > 0 &&
      Number(product.stock_qty || 0) <= Number(product.reorder_level || 5)
  ).length;

  const insights = useMemo(
    () => [
      todaySales > 0
        ? `Today's sales stand at KES ${todaySales.toLocaleString()}.`
        : "No sales recorded today yet.",
      todayWaste > 0
        ? `Waste today is KES ${todayWaste.toLocaleString()}. Review shrinkage.`
        : "No waste recorded today.",
      lowStock > 0
        ? `${lowStock} products are at or below reorder level.`
        : "Stock levels look healthy.",
    ],
    [todaySales, todayWaste, lowStock]
  );

  return (
    <main className="min-h-screen overflow-hidden bg-[#070503] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#b56a1c_0%,transparent_32%),radial-gradient(circle_at_bottom_right,#3a1705_0%,transparent_38%)] opacity-70" />

      <section className="relative mx-auto max-w-7xl px-6 py-8">
        <div className="rounded-[2.5rem] border border-[#d08a35]/25 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
          <p className="text-sm uppercase tracking-[0.35em] text-[#d08a35]">
            Karamela Control Center
          </p>

          <div className="mt-4 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <h1 className="text-5xl font-black tracking-tight md:text-6xl">
                Owner Dashboard
              </h1>
              <p className="mt-3 max-w-2xl text-zinc-400">
                Sales performance, inventory control, waste monitoring,
                payment reconciliation and staff activity.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/30 px-6 py-4">
              <p className="text-sm text-zinc-400">Today</p>
              <p className="text-2xl font-bold text-[#d08a35]">
                {new Date().toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-4">
          <Stat title="Today's Sales" value={`KES ${todaySales.toLocaleString()}`} />
          <Stat title="Inventory Value" value={`KES ${inventoryValue.toLocaleString()}`} />
          <Stat title="Waste Today" value={`KES ${todayWaste.toLocaleString()}`} />
          <Stat title="Low Stock" value={lowStock.toString()} />
        </div>

        <div className="mt-8 rounded-[2rem] border border-[#d08a35]/20 bg-white/5 p-6">
          <h2 className="text-2xl font-bold text-[#d08a35]">
            Alerts & Business Insights
          </h2>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {insights.map((insight, index) => (
              <div
                key={index}
                className="rounded-2xl border border-white/10 bg-black/30 p-5 text-sm text-zinc-300"
              >
                {insight}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <MenuCard
            title="Sales Reports"
            description="Daily, weekly and monthly sales performance with PDF reports."
            href="/dashboard/reports"
          />

          <MenuCard
            title="Owner Inventory"
            description="Inventory value, low-stock alerts, fast movers and slow movers."
            href="/dashboard/owner-inventory"
          />

          <MenuCard
            title="Waste Analysis"
            description="Monitor shrinkage, theft, damaged stock and loss value."
            href="/dashboard/owner-waste"
          />

          <MenuCard
            title="Payment Control"
            description="Review cash, Mpesa, card payments and payment variance."
            href="/dashboard/owner-reconciliation"
          />

          <MenuCard
            title="Closing Stock"
            description="Review stock counts, missing stock and variance value."
            href="/dashboard/owner-closing-stock"
          />

          <MenuCard
            title="Staff Activity"
            description="Monitor staff sales, waste, closing count and shift activity."
            href="/dashboard/staff-activity"
          />
        </div>
      </section>
    </main>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur">
      <p className="text-sm text-zinc-400">{title}</p>
      <p className="mt-3 text-3xl font-black text-[#d08a35]">{value}</p>
    </div>
  );
}

function MenuCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[2rem] border border-[#d08a35]/20 bg-black/30 p-6 shadow-2xl transition hover:-translate-y-1 hover:border-[#d08a35]/70 hover:bg-[#d08a35]/10"
    >
      <h2 className="text-2xl font-black text-[#d08a35]">{title}</h2>
      <p className="mt-3 min-h-16 text-sm leading-6 text-zinc-400">
        {description}
      </p>

      <div className="mt-6 rounded-2xl bg-[#d08a35] px-5 py-3 text-center font-bold text-black group-hover:bg-[#e9a34c]">
        Open
      </div>
    </Link>
  );
}