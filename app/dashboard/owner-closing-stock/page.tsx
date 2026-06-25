"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type ClosingCount = {
  id: string;
  product_id: string;
  business_date: string;
  expected_quantity: number;
  actual_quantity: number;
  variance_quantity: number;
  notes: string | null;
  created_at: string;
};

type Product = {
  id: string;
  product_name: string;
  brand: string | null;
  selling_price: number | null;
  cost_price: number | null;
};

export default function OwnerClosingStockPage() {
  const [counts, setCounts] = useState<ClosingCount[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [period, setPeriod] = useState("today");

  async function loadData() {
    const { data: countData } = await supabase
      .from("closing_stock_counts")
      .select("*")
      .order("business_date", { ascending: false });

    const { data: productData } = await supabase
      .from("products")
      .select("id, product_name, brand, selling_price, cost_price");

    setCounts((countData || []) as ClosingCount[]);
    setProducts((productData || []) as Product[]);
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

  const filteredCounts = useMemo(() => {
    const start = startDate();

    return counts.filter(
      (item) => new Date(item.business_date) >= start
    );
  }, [counts, period]);

  function productName(productId: string) {
    return (
      products.find((product) => product.id === productId)?.product_name ||
      "Unknown Product"
    );
  }

  function productPrice(productId: string) {
    return Number(
      products.find((product) => product.id === productId)?.selling_price || 0
    );
  }

  const varianceRows = filteredCounts.filter(
    (item) => Number(item.variance_quantity || 0) !== 0
  );

  const missingRows = filteredCounts.filter(
    (item) => Number(item.variance_quantity || 0) < 0
  );

  const extraRows = filteredCounts.filter(
    (item) => Number(item.variance_quantity || 0) > 0
  );

  const missingValue = missingRows.reduce((sum, item) => {
    return (
      sum +
      Math.abs(Number(item.variance_quantity || 0)) *
        productPrice(item.product_id)
    );
  }, 0);

  const extraValue = extraRows.reduce((sum, item) => {
    return (
      sum +
      Number(item.variance_quantity || 0) * productPrice(item.product_id)
    );
  }, 0);

  const matchedCount = filteredCounts.filter(
    (item) => Number(item.variance_quantity || 0) === 0
  ).length;

  const repeatedProblemProducts = useMemo(() => {
    const map = new Map<string, number>();

    missingRows.forEach((item) => {
      map.set(item.product_id, (map.get(item.product_id) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([product_id, count]) => ({
        product_id,
        product_name: productName(product_id),
        count,
      }))
      .filter((item) => item.count > 1)
      .sort((a, b) => b.count - a.count);
  }, [missingRows, products]);

  const insights = [
    missingRows.length > 0
      ? `🚨 ${missingRows.length} products have missing stock.`
      : "✅ No missing stock detected.",
    missingValue > 0
      ? `⚠️ Missing stock value is KES ${missingValue.toLocaleString()}.`
      : "✅ No stock loss value recorded.",
    matchedCount > 0
      ? `✅ ${matchedCount} products matched expected stock.`
      : "No perfectly matched stock counts yet.",
    repeatedProblemProducts.length > 0
      ? `🔍 ${repeatedProblemProducts[0].product_name} has repeated negative variance.`
      : "No repeated problem product detected yet.",
  ];

  function exportCSV() {
    const rows = [
      [
        "Date",
        "Product",
        "Expected",
        "Actual",
        "Variance",
        "Variance Value",
        "Status",
        "Notes",
      ],
      ...filteredCounts.map((item) => {
        const variance = Number(item.variance_quantity || 0);
        const value = Math.abs(variance) * productPrice(item.product_id);

        return [
          item.business_date,
          productName(item.product_id),
          item.expected_quantity,
          item.actual_quantity,
          variance,
          value,
          variance < 0 ? "Missing" : variance > 0 ? "Extra" : "Healthy",
          item.notes || "",
        ];
      }),
    ];

    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "karamela-closing-stock-report.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[#080604] p-8 text-white">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-[#d08a35]">
            Owner Closing Stock
          </p>

          <h1 className="mt-3 text-5xl font-bold">
            Closing Stock Control
          </h1>

          <p className="mt-3 text-zinc-400">
            Review stock variances, missing stock, extra stock and shrinkage
            risk after daily closing counts.
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
            onClick={exportCSV}
            className="rounded-2xl bg-[#d08a35] px-5 py-3 font-bold text-black hover:bg-[#e9a34c]"
          >
            Export CSV
          </button>
        </div>
      </div>

      <section className="mt-8 grid gap-5 md:grid-cols-4">
        <Card title="Products Counted" value={filteredCounts.length.toString()} />
        <Card title="With Variance" value={varianceRows.length.toString()} />
        <Card title="Missing Value" value={`KES ${missingValue.toLocaleString()}`} />
        <Card title="Extra Value" value={`KES ${extraValue.toLocaleString()}`} />
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
        <Panel title="Shrinkage Focus">
          {missingRows.length === 0 ? (
            <p className="text-zinc-500">No missing stock detected.</p>
          ) : (
            missingRows.slice(0, 8).map((item) => (
              <Row
                key={item.id}
                left={productName(item.product_id)}
                right={`Missing ${Math.abs(
                  Number(item.variance_quantity || 0)
                )}`}
              />
            ))
          )}
        </Panel>

        <Panel title="Repeated Problem Products">
          {repeatedProblemProducts.length === 0 ? (
            <p className="text-zinc-500">No repeated problem products yet.</p>
          ) : (
            repeatedProblemProducts.map((item) => (
              <Row
                key={item.product_id}
                left={item.product_name}
                right={`${item.count} times`}
              />
            ))
          )}
        </Panel>
      </section>

      <section className="mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-2xl font-bold text-[#d08a35]">
            Closing Count Variance Table
          </h2>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-white/10 text-zinc-300">
            <tr>
              <th className="p-4">Date</th>
              <th className="p-4">Product</th>
              <th className="p-4">Expected</th>
              <th className="p-4">Actual</th>
              <th className="p-4">Variance</th>
              <th className="p-4">Value</th>
              <th className="p-4">Status</th>
              <th className="p-4">Notes</th>
            </tr>
          </thead>

          <tbody>
            {filteredCounts.map((item) => {
              const variance = Number(item.variance_quantity || 0);
              const value = Math.abs(variance) * productPrice(item.product_id);

              const status =
                variance < 0 ? "Missing" : variance > 0 ? "Extra" : "Healthy";

              return (
                <tr key={item.id} className="border-t border-white/10">
                  <td className="p-4">{item.business_date}</td>
                  <td className="p-4">{productName(item.product_id)}</td>
                  <td className="p-4">{item.expected_quantity}</td>
                  <td className="p-4">{item.actual_quantity}</td>

                  <td
                    className={`p-4 font-bold ${
                      variance < 0
                        ? "text-red-300"
                        : variance > 0
                        ? "text-yellow-300"
                        : "text-green-300"
                    }`}
                  >
                    {variance}
                  </td>

                  <td className="p-4">KES {value.toLocaleString()}</td>

                  <td className="p-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        status === "Missing"
                          ? "bg-red-500/20 text-red-300"
                          : status === "Extra"
                          ? "bg-yellow-500/20 text-yellow-300"
                          : "bg-green-500/20 text-green-300"
                      }`}
                    >
                      {status}
                    </span>
                  </td>

                  <td className="p-4 text-zinc-400">{item.notes || "-"}</td>
                </tr>
              );
            })}

            {filteredCounts.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-zinc-500">
                  No closing stock records found.
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
      <span className="text-zinc-300">{left}</span>
      <span className="font-semibold text-[#d08a35]">{right}</span>
    </div>
  );
}