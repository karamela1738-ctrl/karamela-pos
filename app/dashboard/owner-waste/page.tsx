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
import { supabase } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import {
  isDateWithinPeriod,
  type DashboardPeriod,
} from "@/lib/utils/period";

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
  const [period, setPeriod] = useState<DashboardPeriod>("today");

  async function loadData() {
    const [wasteResponse, productResponse, salesResponse] = await Promise.all([
      supabase
        .from("waste_logs")
        .select("id, product_id, quantity, reason, value_amount, notes, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("products")
        .select("id, product_name, brand, category, selling_price, cost_price"),
      supabase.from("sales").select("total_amount, created_at"),
    ]);

    setWasteLogs(wasteResponse.data || []);
    setProducts(productResponse.data || []);
    setSales(salesResponse.data || []);
  }

  useEffect(() => {
    void loadData();
  }, []);

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const filteredWaste = useMemo(
    () => wasteLogs.filter((log) => isDateWithinPeriod(log.created_at, period)),
    [wasteLogs, period]
  );

  const filteredSales = useMemo(
    () => sales.filter((sale) => isDateWithinPeriod(sale.created_at, period)),
    [sales, period]
  );

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
    const breakdown = new Map<
      string,
      { reason: string; count: number; value: number }
    >();

    filteredWaste.forEach((log) => {
      const key = log.reason || "unknown";
      const current = breakdown.get(key);

      if (current) {
        current.count += 1;
        current.value += Number(log.value_amount || 0);
        return;
      }

      breakdown.set(key, {
        reason: key,
        count: 1,
        value: Number(log.value_amount || 0),
      });
    });

    return Array.from(breakdown.values()).sort((a, b) => b.value - a.value);
  }, [filteredWaste]);

  const productWaste = useMemo(() => {
    const breakdown = new Map<
      string,
      { product_id: string; product_name: string; qty: number; value: number }
    >();

    filteredWaste.forEach((log) => {
      const product = log.product_id ? productMap.get(log.product_id) : null;
      const productName = product?.product_name || "Unknown Product";
      const key = log.product_id || productName;
      const current = breakdown.get(key);

      if (current) {
        current.qty += Number(log.quantity || 0);
        current.value += Number(log.value_amount || 0);
        return;
      }

      breakdown.set(key, {
        product_id: key,
        product_name: productName,
        qty: Number(log.quantity || 0),
        value: Number(log.value_amount || 0),
      });
    });

    return Array.from(breakdown.values()).sort((a, b) => b.value - a.value);
  }, [filteredWaste, productMap]);

  const categoryWaste = useMemo(() => {
    const breakdown = new Map<string, number>();

    filteredWaste.forEach((log) => {
      const product = log.product_id ? productMap.get(log.product_id) : null;
      const category = product?.category || "Uncategorized";

      breakdown.set(
        category,
        (breakdown.get(category) || 0) + Number(log.value_amount || 0)
      );
    });

    return Array.from(breakdown.entries())
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredWaste, productMap]);

  const theftAndUnknown = filteredWaste.filter(
    (log) => log.reason === "theft" || log.reason === "unknown"
  );

  const insights = [
    totalWasteValue > 0
      ? `Waste value for this period is ${formatCurrency(totalWasteValue)}.`
      : "No waste recorded for this period.",
    wasteRatio > 5
      ? `Waste ratio is ${wasteRatio.toFixed(1)}%, which is high.`
      : wasteRatio > 2
        ? `Waste ratio is ${wasteRatio.toFixed(1)}%. Monitor closely.`
        : `Waste ratio is ${wasteRatio.toFixed(1)}%, which is healthy.`,
    productWaste[0]
      ? `${productWaste[0].product_name} has the highest waste value.`
      : "No product waste pattern detected yet.",
    theftAndUnknown.length > 0
      ? `${theftAndUnknown.length} theft or unknown loss entries need review.`
      : "No theft or unknown loss entries detected.",
  ];

  function downloadCSV() {
    const rows = [
      ["Product", "Quantity", "Reason", "Value", "Date", "Notes"],
      ...filteredWaste.map((log) => {
        const product = log.product_id ? productMap.get(log.product_id) : null;

        return [
          product?.product_name || "Unknown",
          log.quantity,
          log.reason,
          log.value_amount || 0,
          formatDate(log.created_at),
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
      <DashboardPageHeader
        eyebrow="Owner Waste"
        title="Waste & Shrinkage Dashboard"
        description="Track losses, damaged stock, theft, unknown shrinkage and waste impact."
        actions={
          <div className="flex gap-3">
            <DashboardPeriodSelect value={period} onChange={setPeriod} />

            <button
              type="button"
              onClick={downloadCSV}
              className="rounded-2xl bg-[#d08a35] px-5 py-3 font-bold text-black hover:bg-[#e9a34c]"
            >
              Export CSV
            </button>
          </div>
        }
      />

      <section className="mt-8 grid gap-5 md:grid-cols-4">
        <DashboardMetricCard
          title="Waste Value"
          value={formatCurrency(totalWasteValue)}
        />
        <DashboardMetricCard
          title="Waste Quantity"
          value={totalWasteQty.toString()}
        />
        <DashboardMetricCard
          title="Waste Ratio"
          value={`${wasteRatio.toFixed(1)}%`}
        />
        <DashboardMetricCard
          title="Theft / Unknown"
          value={theftAndUnknown.length.toString()}
        />
      </section>

      <div className="mt-8">
        <DashboardInsightsSection
          title="Alerts & Business Insights"
          insights={insights}
        />
      </div>

      <section className="mt-8 grid gap-6 md:grid-cols-3">
        <DashboardPanel title="Waste by Reason" contentClassName="mt-5 space-y-2">
          {reasonBreakdown.length === 0 ? (
            <p className="text-zinc-500">No waste data yet.</p>
          ) : (
            reasonBreakdown.map((item) => (
              <DashboardListRow
                key={item.reason}
                left={item.reason}
                right={formatCurrency(item.value)}
                leftClassName="capitalize text-zinc-300"
              />
            ))
          )}
        </DashboardPanel>

        <DashboardPanel
          title="Most Wasted Products"
          contentClassName="mt-5 space-y-2"
        >
          {productWaste.length === 0 ? (
            <p className="text-zinc-500">No wasted products yet.</p>
          ) : (
            productWaste.slice(0, 5).map((item) => (
              <DashboardListRow
                key={item.product_id}
                left={item.product_name}
                right={formatCurrency(item.value)}
              />
            ))
          )}
        </DashboardPanel>

        <DashboardPanel
          title="Waste by Category"
          contentClassName="mt-5 space-y-2"
        >
          {categoryWaste.length === 0 ? (
            <p className="text-zinc-500">No category waste yet.</p>
          ) : (
            categoryWaste.slice(0, 5).map((item) => (
              <DashboardListRow
                key={item.category}
                left={item.category}
                right={formatCurrency(item.value)}
              />
            ))
          )}
        </DashboardPanel>
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
              const product = log.product_id ? productMap.get(log.product_id) : null;

              return (
                <tr key={log.id} className="border-t border-white/10">
                  <td className="p-4">{product?.product_name || "Unknown"}</td>
                  <td className="p-4">{log.quantity}</td>
                  <td className="p-4 capitalize text-[#d08a35]">{log.reason}</td>
                  <td className="p-4">{formatCurrency(log.value_amount)}</td>
                  <td className="p-4 text-zinc-400">{formatDate(log.created_at)}</td>
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
