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
import { formatCurrency } from "@/lib/utils/format";
import {
  isDateWithinPeriod,
  type DashboardPeriod,
} from "@/lib/utils/period";

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
  const [period, setPeriod] = useState<DashboardPeriod>("today");

  async function loadData() {
    const [countResponse, productResponse] = await Promise.all([
      supabase
        .from("closing_stock_counts")
        .select("*")
        .order("business_date", { ascending: false }),
      supabase
        .from("products")
        .select("id, product_name, brand, selling_price, cost_price"),
    ]);

    setCounts((countResponse.data || []) as ClosingCount[]);
    setProducts((productResponse.data || []) as Product[]);
  }

  useEffect(() => {
    void loadData();
  }, []);

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const filteredCounts = useMemo(
    () =>
      counts.filter((item) => isDateWithinPeriod(item.business_date, period)),
    [counts, period]
  );

  function getProductName(productId: string) {
    return productMap.get(productId)?.product_name || "Unknown Product";
  }

  function getProductPrice(productId: string) {
    return Number(productMap.get(productId)?.selling_price || 0);
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
        getProductPrice(item.product_id)
    );
  }, 0);

  const extraValue = extraRows.reduce((sum, item) => {
    return (
      sum +
      Number(item.variance_quantity || 0) * getProductPrice(item.product_id)
    );
  }, 0);

  const matchedCount = filteredCounts.filter(
    (item) => Number(item.variance_quantity || 0) === 0
  ).length;

  const repeatedProblemProducts = useMemo(() => {
    const occurrences = new Map<string, number>();

    missingRows.forEach((item) => {
      occurrences.set(
        item.product_id,
        (occurrences.get(item.product_id) || 0) + 1
      );
    });

    return Array.from(occurrences.entries())
      .map(([productId, count]) => ({
        product_id: productId,
        product_name: getProductName(productId),
        count,
      }))
      .filter((item) => item.count > 1)
      .sort((a, b) => b.count - a.count);
  }, [missingRows, productMap]);

  const insights = [
    missingRows.length > 0
      ? `${missingRows.length} products have missing stock.`
      : "No missing stock detected.",
    missingValue > 0
      ? `Missing stock value is ${formatCurrency(missingValue)}.`
      : "No stock loss value recorded.",
    matchedCount > 0
      ? `${matchedCount} products matched expected stock.`
      : "No perfectly matched stock counts yet.",
    repeatedProblemProducts.length > 0
      ? `${repeatedProblemProducts[0].product_name} has repeated negative variance.`
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
        const value = Math.abs(variance) * getProductPrice(item.product_id);

        return [
          item.business_date,
          getProductName(item.product_id),
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
      <DashboardPageHeader
        eyebrow="Owner Closing Stock"
        title="Closing Stock Control"
        description="Review stock variances, missing stock, extra stock and shrinkage risk after daily closing counts."
        actions={
          <div className="flex gap-3">
            <DashboardPeriodSelect value={period} onChange={setPeriod} />

            <button
              type="button"
              onClick={exportCSV}
              className="rounded-2xl bg-[#d08a35] px-5 py-3 font-bold text-black hover:bg-[#e9a34c]"
            >
              Export CSV
            </button>
          </div>
        }
      />

      <section className="mt-8 grid gap-5 md:grid-cols-4">
        <DashboardMetricCard
          title="Products Counted"
          value={filteredCounts.length.toString()}
        />
        <DashboardMetricCard
          title="With Variance"
          value={varianceRows.length.toString()}
        />
        <DashboardMetricCard
          title="Missing Value"
          value={formatCurrency(missingValue)}
        />
        <DashboardMetricCard
          title="Extra Value"
          value={formatCurrency(extraValue)}
        />
      </section>

      <div className="mt-8">
        <DashboardInsightsSection
          title="Alerts & Business Insights"
          insights={insights}
        />
      </div>

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <DashboardPanel title="Shrinkage Focus" contentClassName="mt-5 space-y-2">
          {missingRows.length === 0 ? (
            <p className="text-zinc-500">No missing stock detected.</p>
          ) : (
            missingRows.slice(0, 8).map((item) => (
              <DashboardListRow
                key={item.id}
                left={getProductName(item.product_id)}
                right={`Missing ${Math.abs(Number(item.variance_quantity || 0))}`}
              />
            ))
          )}
        </DashboardPanel>

        <DashboardPanel
          title="Repeated Problem Products"
          contentClassName="mt-5 space-y-2"
        >
          {repeatedProblemProducts.length === 0 ? (
            <p className="text-zinc-500">No repeated problem products yet.</p>
          ) : (
            repeatedProblemProducts.map((item) => (
              <DashboardListRow
                key={item.product_id}
                left={item.product_name}
                right={`${item.count} times`}
              />
            ))
          )}
        </DashboardPanel>
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
              const value = Math.abs(variance) * getProductPrice(item.product_id);
              const status =
                variance < 0 ? "Missing" : variance > 0 ? "Extra" : "Healthy";

              return (
                <tr key={item.id} className="border-t border-white/10">
                  <td className="p-4">{item.business_date}</td>
                  <td className="p-4">{getProductName(item.product_id)}</td>
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

                  <td className="p-4">{formatCurrency(value)}</td>

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
