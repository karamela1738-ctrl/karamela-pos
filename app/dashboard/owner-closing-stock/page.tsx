"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import {
  DashboardInsightsSection,
  DashboardListRow,
  DashboardMetricCard,
  DashboardPageHeader,
  DashboardPanel,
  DashboardReportDateBanner,
  DashboardPeriodSelect,
} from "@/components/dashboard/ui";
import { logDashboardQuery } from "@/lib/services/dashboard";
import {
  getOwnerClosingStockRows,
  type OwnerClosingStockRow,
} from "@/lib/services/operations";
import { subscribeDashboardRefresh } from "@/lib/utils/dashboard-refresh";
import {
  formatBusinessDateRange,
  formatCurrency,
} from "@/lib/utils/format";
import {
  getDashboardPeriodLabel,
  getDashboardPeriodSummary,
  type DashboardPeriod,
} from "@/lib/utils/period";

export default function OwnerClosingStockPage() {
  const [counts, setCounts] = useState<OwnerClosingStockRow[]>([]);
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    try {
      const rows = await getOwnerClosingStockRows(period);

      setCounts(rows);
      setError(null);

      logDashboardQuery("owner-closing-stock", {
        period,
        row_count: rows.length,
      });

      if (process.env.NODE_ENV !== "production") {
        console.log("[owner-closing-stock]", {
          period,
          countRows: rows.length,
        });
      }
    } catch (error) {
      console.error(error);
      setError(
        error instanceof Error
          ? error.message
          : "Unable to load closing stock analysis."
      );
      setCounts([]);
    }
  }

  const runLoadData = useEffectEvent(() => {
    void loadData();
  });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      runLoadData();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [period]);

  useEffect(() => {
    return subscribeDashboardRefresh(() => {
      runLoadData();
    });
  }, []);
  const filteredCounts = counts;

  const productMetaById = useMemo(() => {
    const meta = new Map<string, { productName: string; sellingPrice: number }>();

    filteredCounts.forEach((item) => {
      if (!meta.has(item.product_id)) {
        meta.set(item.product_id, {
          productName: item.product_name || "Unknown Product",
          sellingPrice: Number(item.selling_price || 0),
        });
      }
    });

    return meta;
  }, [filteredCounts]);

  function getProductName(productId: string) {
    return productMetaById.get(productId)?.productName || "Unknown Product";
  }

  function getProductPrice(productId: string) {
    return productMetaById.get(productId)?.sellingPrice || 0;
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
  const periodLabel = getDashboardPeriodLabel(period);
  const periodSummary = getDashboardPeriodSummary(period);
  const reportDateRange = formatBusinessDateRange(
    periodSummary.startBusinessDate,
    periodSummary.endBusinessDate
  );

  const repeatedProblemProducts = Array.from(
    missingRows.reduce((occurrences, item) => {
      occurrences.set(
        item.product_id,
        (occurrences.get(item.product_id) || 0) + 1
      );

      return occurrences;
    }, new Map<string, number>())
  )
    .map(([productId, count]) => ({
      product_id: productId,
      product_name:
        productMetaById.get(productId)?.productName || "Unknown Product",
      count,
    }))
    .filter((item) => item.count > 1)
    .sort((a, b) => b.count - a.count);

  const insights =
    filteredCounts.length === 0
      ? [
          `No closing stock records were found for ${periodLabel}.`,
          "Variance value will appear after staff submit stock counts.",
          "Matched product counts will appear after counting starts.",
          "Repeated problem products will appear after multiple count cycles.",
        ]
      : [
          missingRows.length > 0
            ? `${missingRows.length} products have missing stock in ${periodLabel}.`
            : `No missing stock detected in ${periodLabel}.`,
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
    <main className="dashboard-page-shell">
      {error && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
          {error}
        </div>
      )}

      <DashboardPageHeader
        eyebrow="Owner Closing Stock"
        title="Closing Stock Control"
        description="Review stock variances, missing stock, extra stock and shrinkage risk after daily closing counts."
        actions={
          <div className="flex w-full flex-col gap-3 sm:flex-row">
            <DashboardPeriodSelect value={period} onChange={setPeriod} />

            <button
              type="button"
              onClick={exportCSV}
              className="w-full rounded-2xl bg-[#d08a35] px-5 py-3 font-bold text-black hover:bg-[#e9a34c] sm:w-auto"
            >
              Export CSV
            </button>
          </div>
        }
      />

      <DashboardReportDateBanner value={reportDateRange} />

      <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
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

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <DashboardPanel title="Shrinkage Focus" contentClassName="mt-5 space-y-2">
          {missingRows.length === 0 ? (
            <p className="text-zinc-500">No missing stock detected.</p>
          ) : (
            missingRows.slice(0, 8).map((item) => (
              <DashboardListRow
                key={item.count_id}
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

      <section className="dashboard-table-shell mt-8 rounded-[2rem] border border-white/10 bg-white/5">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-2xl font-bold text-[#d08a35]">
            Closing Count Variance Table
          </h2>
        </div>

        <table className="dashboard-data-table w-full text-left text-sm">
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
                <tr key={item.count_id} className="border-t border-white/10">
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
