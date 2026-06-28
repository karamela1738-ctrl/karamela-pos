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
  getOwnerSalesRows,
  getOwnerWasteRows,
  type OwnerSaleRow,
  type OwnerWasteRow,
} from "@/lib/services/operations";
import { subscribeDashboardRefresh } from "@/lib/utils/dashboard-refresh";
import {
  formatBusinessDateRange,
  formatCurrency,
  formatDate,
} from "@/lib/utils/format";
import {
  getDashboardPeriodLabel,
  getDashboardPeriodSummary,
  type DashboardPeriod,
} from "@/lib/utils/period";

export default function OwnerWastePage() {
  const [wasteLogs, setWasteLogs] = useState<OwnerWasteRow[]>([]);
  const [sales, setSales] = useState<OwnerSaleRow[]>([]);
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    try {
      const [hydratedWaste, salesRows] = await Promise.all([
        getOwnerWasteRows(period),
        getOwnerSalesRows(period),
      ]);

      setWasteLogs(hydratedWaste);
      setSales(salesRows);
      setError(null);

      logDashboardQuery("owner-waste", {
        period,
        waste_rows: hydratedWaste.length,
        sales_rows: salesRows.length,
      });

      if (process.env.NODE_ENV !== "production") {
        console.log("[owner-waste]", {
          period,
          wasteRows: hydratedWaste.length,
          salesRows: salesRows.length,
          wasteValue: hydratedWaste.reduce(
            (sum, log) => sum + Number(log.effective_value || 0),
            0
          ),
        });
      }
    } catch (loadError) {
      console.error(loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load waste analysis."
      );
      setWasteLogs([]);
      setSales([]);
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
  const filteredWaste = wasteLogs;
  const filteredSales = sales;

  const totalWasteValue = filteredWaste.reduce(
    (sum, log) => sum + Number(log.effective_value || 0),
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
  const periodLabel = getDashboardPeriodLabel(period);
  const periodSummary = getDashboardPeriodSummary(period);
  const reportDateRange = formatBusinessDateRange(
    periodSummary.startBusinessDate,
    periodSummary.endBusinessDate
  );

  const wasteRatio = totalSales > 0 ? (totalWasteValue / totalSales) * 100 : 0;
  const wasteRatioDisplay = totalSales > 0 ? `${wasteRatio.toFixed(1)}%` : "N/A";

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
        current.value += Number(log.effective_value || 0);
        return;
      }

      breakdown.set(key, {
        reason: key,
        count: 1,
        value: Number(log.effective_value || 0),
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
      const productName = log.product_name || "Unknown Product";
      const key = log.product_id || productName;
      const current = breakdown.get(key);

      if (current) {
        current.qty += Number(log.quantity || 0);
        current.value += Number(log.effective_value || 0);
        return;
      }

      breakdown.set(key, {
        product_id: key,
        product_name: productName,
        qty: Number(log.quantity || 0),
        value: Number(log.effective_value || 0),
      });
    });

    return Array.from(breakdown.values()).sort((a, b) => b.value - a.value);
  }, [filteredWaste]);

  const categoryWaste = useMemo(() => {
    const breakdown = new Map<string, number>();

    filteredWaste.forEach((log) => {
      const category = log.category || "Uncategorized";

      breakdown.set(
        category,
        (breakdown.get(category) || 0) + Number(log.effective_value || 0)
      );
    });

    return Array.from(breakdown.entries())
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredWaste]);

  const theftAndUnknown = filteredWaste.filter(
    (log) => log.reason === "theft" || log.reason === "unknown"
  );

  const insights = [
    totalWasteValue > 0
      ? `Waste value for ${periodLabel} is ${formatCurrency(totalWasteValue)}.`
      : `No waste recorded for ${periodLabel}.`,
    totalSales <= 0
      ? totalWasteValue > 0
        ? `Waste was recorded for ${periodLabel}, but no sales were recorded, so the waste ratio is not available yet.`
        : `No sales were recorded for ${periodLabel}, so the waste ratio is not available yet.`
      : wasteRatio > 5
        ? `Waste ratio is ${wasteRatio.toFixed(1)}%, which is high.`
        : wasteRatio > 2
          ? `Waste ratio is ${wasteRatio.toFixed(1)}%. Monitor closely.`
          : `Waste ratio is ${wasteRatio.toFixed(1)}%, which is healthy.`,
    productWaste[0]
      ? `${productWaste[0].product_name} has the highest waste value for ${periodLabel}.`
      : "No product waste pattern detected yet.",
    theftAndUnknown.length > 0
      ? `${theftAndUnknown.length} theft or unknown loss entries need review.`
      : "No theft or unknown loss entries detected.",
  ];

  function downloadCSV() {
    const rows = [
      ["Product", "Quantity", "Reason", "Value", "Date", "Notes"],
      ...filteredWaste.map((log) => {
        return [
          log.product_name || "Unknown",
          log.quantity,
          log.reason,
          log.effective_value || 0,
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
    <main className="dashboard-page-shell">
      {error && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
          {error}
        </div>
      )}

      <DashboardPageHeader
        eyebrow="Owner Waste"
        title="Waste & Shrinkage Dashboard"
        description="Track losses, damaged stock, theft, unknown shrinkage and waste impact."
        actions={
          <div className="flex w-full flex-col gap-3 sm:flex-row">
            <DashboardPeriodSelect value={period} onChange={setPeriod} />

            <button
              type="button"
              onClick={downloadCSV}
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
          title="Waste Value"
          value={formatCurrency(totalWasteValue)}
        />
        <DashboardMetricCard
          title="Waste Quantity"
          value={totalWasteQty.toString()}
        />
        <DashboardMetricCard
          title="Waste Ratio"
          value={wasteRatioDisplay}
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

      <section className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
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

      <section className="dashboard-table-shell mt-8 rounded-[2rem] border border-white/10 bg-white/5">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-2xl font-bold text-[#d08a35]">
            Recent Waste Entries
          </h2>
        </div>

        <table className="dashboard-data-table w-full text-left text-sm">
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
              return (
                <tr key={log.waste_id} className="border-t border-white/10">
                  <td className="p-4">{log.product_name || "Unknown"}</td>
                  <td className="p-4">{log.quantity}</td>
                  <td className="p-4 capitalize text-[#d08a35]">{log.reason}</td>
                  <td className="p-4">{formatCurrency(log.effective_value)}</td>
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
