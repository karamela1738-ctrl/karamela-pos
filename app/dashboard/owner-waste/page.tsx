"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type WasteLog = {
  id: string;
  product_id: string | null;
  quantity: number;
  reason: string;
  value_amount: number | null;
  notes: string | null;
  created_at: string;
};

type Product = {
  id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  selling_price: number | null;
  cost_price: number | null;
};

type Sale = {
  total_amount: number;
  created_at: string;
};

export default function OwnerWastePage() {
  const [wasteLogs, setWasteLogs] = useState<WasteLog[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [period, setPeriod] = useState("today");

  async function loadData() {
    const { data: wasteData } = await supabase
      .from("waste_logs")
      .select("id, product_id, quantity, reason, value_amount, notes, created_at")
      .order("created_at", { ascending: false });

    const { data: productData } = await supabase
      .from("products")
      .select("id, product_name, brand, category, selling_price, cost_price");

    const { data: salesData } = await supabase
      .from("sales")
      .select("total_amount, created_at");

    setWasteLogs(wasteData || []);
    setProducts(productData || []);
    setSales(salesData || []);
  }

  useEffect(() => {
    loadData();
  }, []);

  function startDate() {
    const now = new Date();

    if (period === "today") {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    if (period === "7days") {
      const date = new Date();
      date.setDate(date.getDate() - 7);
      return date;
    }

    if (period === "30days") {
      const date = new Date();
      date.setDate(date.getDate() - 30);
      return date;
    }

    return new Date(0);
  }

  const filteredWaste = useMemo(() => {
    const start = startDate();
    return wasteLogs.filter((log) => new Date(log.created_at) >= start);
  }, [wasteLogs, period]);

  const filteredSales = useMemo(() => {
    const start = startDate();
    return sales.filter((sale) => new Date(sale.created_at) >= start);
  }, [sales, period]);

  const totalWasteValue = filteredWaste.reduce(
    (sum, log) => sum + Number(log.value_amount || 0),
    0
  );

  const totalWasteQty = filteredWaste.reduce(
    (sum, log) => sum + Number(log.quantity || 0),
    0
  );

  const totalSales = filteredSales.reduce(
    (sum, sale) => sum + Number(sale.total_amount || 0),
    0
  );

  const wasteRatio = totalSales > 0 ? (totalWasteValue / totalSales) * 100 : 0;

  const reasonBreakdown = useMemo(() => {
    const map = new Map<string, { reason: string; count: number; value: number }>();

    filteredWaste.forEach((log) => {
      const key = log.reason || "unknown";
      const current = map.get(key);

      if (current) {
        current.count += 1;
        current.value += Number(log.value_amount || 0);
      } else {
        map.set(key, {
          reason: key,
          count: 1,
          value: Number(log.value_amount || 0),
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [filteredWaste]);

  const productWaste = useMemo(() => {
    const map = new Map<
      string,
      { product_id: string; product_name: string; qty: number; value: number }
    >();

    filteredWaste.forEach((log) => {
      const product = products.find((p) => p.id === log.product_id);
      const name = product?.product_name || "Unknown Product";
      const key = log.product_id || name;

      const current = map.get(key);

      if (current) {
        current.qty += Number(log.quantity || 0);
        current.value += Number(log.value_amount || 0);
      } else {
        map.set(key, {
          product_id: key,
          product_name: name,
          qty: Number(log.quantity || 0),
          value: Number(log.value_amount || 0),
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [filteredWaste, products]);

  const categoryWaste = useMemo(() => {
    const map = new Map<string, number>();

    filteredWaste.forEach((log) => {
      const product = products.find((p) => p.id === log.product_id);
      const category = product?.category || "Uncategorized";
      map.set(category, (map.get(category) || 0) + Number(log.value_amount || 0));
    });

    return Array.from(map.entries())
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredWaste, products]);

  const theftAndUnknown = filteredWaste.filter(
    (log) => log.reason === "theft" || log.reason === "unknown"
  );

  const insights = [
    totalWasteValue > 0
      ? `🚨 Waste value for this period is KES ${totalWasteValue.toLocaleString()}.`
      : "✅ No waste recorded for this period.",
    wasteRatio > 5
      ? `🔴 Waste ratio is ${wasteRatio.toFixed(1)}%, which is high.`
      : wasteRatio > 2
      ? `🟡 Waste ratio is ${wasteRatio.toFixed(1)}%. Monitor closely.`
      : `🟢 Waste ratio is ${wasteRatio.toFixed(1)}%, which is healthy.`,
    productWaste[0]
      ? `⚠️ ${productWaste[0].product_name} has the highest waste value.`
      : "No product waste pattern detected yet.",
    theftAndUnknown.length > 0
      ? `🔍 ${theftAndUnknown.length} theft/unknown loss entries need review.`
      : "✅ No theft or unknown loss entries detected.",
  ];

  function downloadCSV() {
    const rows = [
      ["Product", "Quantity", "Reason", "Value", "Date", "Notes"],
      ...filteredWaste.map((log) => {
        const product = products.find((p) => p.id === log.product_id);

        return [
          product?.product_name || "Unknown",
          log.quantity,
          log.reason,
          log.value_amount || 0,
          new Date(log.created_at).toLocaleDateString(),
          log.notes || "",
        ];
      }),
    ];

    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "karamela-waste-report.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[#080604] p-8 text-white">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-[#d08a35]">
            Owner Waste
          </p>

          <h1 className="mt-3 text-5xl font-bold">
            Waste & Shrinkage Dashboard
          </h1>

          <p className="mt-3 text-zinc-400">
            Track losses, damaged stock, theft, unknown shrinkage and waste impact.
          </p>
        </div>

        <div className="flex gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-2xl border border-white/10 bg-black/50 px-4 py-3"
          >
            <option value="today">Today</option>
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="all">All Time</option>
          </select>

          <button
            onClick={downloadCSV}
            className="rounded-2xl bg-[#d08a35] px-5 py-3 font-bold text-black hover:bg-[#e9a34c]"
          >
            Export CSV
          </button>
        </div>
      </div>

      <section className="mt-8 grid gap-5 md:grid-cols-4">
        <Card title="Waste Value" value={`KES ${totalWasteValue.toLocaleString()}`} />
        <Card title="Waste Quantity" value={totalWasteQty.toString()} />
        <Card title="Waste Ratio" value={`${wasteRatio.toFixed(1)}%`} />
        <Card title="Theft / Unknown" value={theftAndUnknown.length.toString()} />
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

      <section className="mt-8 grid gap-6 md:grid-cols-3">
        <Panel title="Waste by Reason">
          {reasonBreakdown.length === 0 ? (
            <p className="text-zinc-500">No waste data yet.</p>
          ) : (
            reasonBreakdown.map((item) => (
              <Row
                key={item.reason}
                left={item.reason}
                right={`KES ${item.value.toLocaleString()}`}
              />
            ))
          )}
        </Panel>

        <Panel title="Most Wasted Products">
          {productWaste.length === 0 ? (
            <p className="text-zinc-500">No wasted products yet.</p>
          ) : (
            productWaste.slice(0, 5).map((item) => (
              <Row
                key={item.product_id}
                left={item.product_name}
                right={`KES ${item.value.toLocaleString()}`}
              />
            ))
          )}
        </Panel>

        <Panel title="Waste by Category">
          {categoryWaste.length === 0 ? (
            <p className="text-zinc-500">No category waste yet.</p>
          ) : (
            categoryWaste.slice(0, 5).map((item) => (
              <Row
                key={item.category}
                left={item.category}
                right={`KES ${item.value.toLocaleString()}`}
              />
            ))
          )}
        </Panel>
      </section>

      <section className="mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-2xl font-bold text-[#d08a35]">
            Recent Waste Entries
          </h2>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-white/10 text-zinc-300">
            <tr>
              <th className="p-4">Product</th>
              <th className="p-4">Qty</th>
              <th className="p-4">Reason</th>
              <th className="p-4">Value</th>
              <th className="p-4">Date</th>
              <th className="p-4">Notes</th>
            </tr>
          </thead>

          <tbody>
            {filteredWaste.map((log) => {
              const product = products.find((p) => p.id === log.product_id);

              return (
                <tr key={log.id} className="border-t border-white/10">
                  <td className="p-4">{product?.product_name || "Unknown"}</td>
                  <td className="p-4">{log.quantity}</td>
                  <td className="p-4 capitalize text-[#d08a35]">{log.reason}</td>
                  <td className="p-4">KES {log.value_amount || 0}</td>
                  <td className="p-4 text-zinc-400">
                    {new Date(log.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-zinc-400">{log.notes || "-"}</td>
                </tr>
              );
            })}

            {filteredWaste.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-zinc-500">
                  No waste records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
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
      <div className="mt-5 space-y-2">{children}</div>
    </div>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex justify-between border-b border-white/10 py-3">
      <span className="capitalize text-zinc-300">{left}</span>
      <span className="font-semibold text-[#d08a35]">{right}</span>
    </div>
  );
}