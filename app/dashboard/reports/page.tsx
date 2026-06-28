"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  DashboardInsightsSection,
  DashboardMetricCard,
  DashboardPageHeader,
  DashboardReportDateBanner,
  DashboardPeriodSelect,
} from "@/components/dashboard/ui";
import { logDashboardQuery } from "@/lib/services/dashboard";
import {
  getOwnerSaleItemRows,
  getOwnerSalesRows,
  getOwnerWasteRows,
  type OwnerSaleItemRow,
  type OwnerSaleRow,
  type OwnerWasteRow,
} from "@/lib/services/operations";
import { subscribeDashboardRefresh } from "@/lib/utils/dashboard-refresh";
import {
  formatBusinessDateRange,
  formatCurrency,
} from "@/lib/utils/format";
import {
  getDashboardPeriodHeading,
  getDashboardPeriodLabel,
  getDashboardPeriodSummary,
  type DashboardPeriod,
} from "@/lib/utils/period";

export default function SalesReportsPage() {
  const [sales, setSales] = useState<OwnerSaleRow[]>([]);
  const [items, setItems] = useState<OwnerSaleItemRow[]>([]);
  const [waste, setWaste] = useState<OwnerWasteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);

  async function loadReports() {
    setLoading(true);

    try {
      const [filteredSales, filteredItems, hydratedWaste] = await Promise.all([
        getOwnerSalesRows(period),
        getOwnerSaleItemRows(period),
        getOwnerWasteRows(period),
      ]);

      setSales(filteredSales);
      setItems(filteredItems);
      setWaste(hydratedWaste);
      setReportsError(null);
      setReportsLoaded(true);

      logDashboardQuery("sales-reports", {
        period,
        sales_rows: filteredSales.length,
        item_rows: filteredItems.length,
        waste_rows: hydratedWaste.length,
        waste_value: hydratedWaste.reduce(
          (sum, log) => sum + Number(log.effective_value || 0),
          0
        ),
      });

      if (process.env.NODE_ENV !== "production") {
        console.log("[reports:waste]", {
          period,
          wasteRows: hydratedWaste.length,
          wasteValue: hydratedWaste.reduce(
            (sum, log) => sum + Number(log.effective_value || 0),
            0
          ),
        });
      }
    } catch (error) {
      console.error(error);
      setReportsError(
        error instanceof Error ? error.message : "Unable to load reports."
      );
      setReportsLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  const runLoadReports = useEffectEvent(() => {
    void loadReports();
  });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      runLoadReports();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [period]);

  useEffect(() => {
    return subscribeDashboardRefresh(() => {
      runLoadReports();
    });
  }, []);

  const totalSales = sales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);

  const transactions = sales.length;
  const averageSale = transactions > 0 ? totalSales / transactions : 0;
  const periodLabel = getDashboardPeriodLabel(period);
  const periodHeading = getDashboardPeriodHeading(period);
  const periodSummary = getDashboardPeriodSummary(period);
  const reportDateRange = formatBusinessDateRange(
    periodSummary.startBusinessDate,
    periodSummary.endBusinessDate
  );

  const wasteValue = waste.reduce(
    (sum, log) => sum + Number(log.effective_value || 0),
    0
  );

  const paymentTotals = useMemo(
    () =>
      sales.reduce(
        (totals, sale) => {
          const method = sale.payment_method || "cash";

          totals[method] = (totals[method] || 0) + Number(sale.total_amount || 0);
          return totals;
        },
        {} as Record<string, number>
      ),
    [sales]
  );

  const productPerformance = useMemo(() => {
    const performance = new Map<
      string,
      { product_name: string; quantity: number; revenue: number }
    >();

    items.forEach((item) => {
      const existing = performance.get(item.product_name);

      if (existing) {
        existing.quantity += Number(item.quantity || 0);
        existing.revenue += Number(item.subtotal || 0);
        return;
      }

      performance.set(item.product_name, {
        product_name: item.product_name,
        quantity: Number(item.quantity || 0),
        revenue: Number(item.subtotal || 0),
      });
    });

    return Array.from(performance.values()).sort((a, b) => b.quantity - a.quantity);
  }, [items]);

  const bestSeller = productPerformance[0];

  const insights = [
    totalSales > 0
      ? `Sales for ${periodLabel} are ${formatCurrency(totalSales)}.`
      : `No sales have been recorded for ${periodLabel}.`,
    bestSeller
      ? `${bestSeller.product_name} is the fastest moving product for ${periodLabel} with ${bestSeller.quantity} units sold.`
      : `No product movement has been recorded for ${periodLabel}.`,
    wasteValue > 0
      ? `Waste recorded for ${periodLabel} is ${formatCurrency(wasteValue)}. Monitor shrinkage closely.`
      : `No waste recorded for ${periodLabel}. Good stock control so far.`,
    averageSale > 0
      ? `Average transaction value for ${periodLabel} is ${formatCurrency(Math.round(averageSale))}.`
      : `Average transaction value will appear after sales are recorded for ${periodLabel}.`,
  ];

  function downloadPDF() {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("Karamela Sales Report", 14, 20);

    doc.setFontSize(10);
    doc.text(`Period: ${periodHeading}`, 14, 28);
    doc.text(`Date Range: ${reportDateRange}`, 14, 34);

    autoTable(doc, {
      startY: 42,
      head: [["Metric", "Value"]],
      body: [
        ["Total Sales", formatCurrency(totalSales)],
        ["Transactions", transactions.toString()],
        ["Average Sale", formatCurrency(Math.round(averageSale))],
        ["Waste Value", formatCurrency(wasteValue)],
        ["Cash Sales", formatCurrency(paymentTotals.cash || 0)],
        ["Mpesa Sales", formatCurrency(paymentTotals.mpesa || 0)],
        ["Card Sales", formatCurrency(paymentTotals.card || 0)],
      ],
    });

    autoTable(doc, {
      startY: 95,
      head: [["Product", "Units Sold", "Revenue"]],
      body: productPerformance.slice(0, 20).map((item) => [
        item.product_name,
        item.quantity,
        formatCurrency(item.revenue),
      ]),
    });

    autoTable(doc, {
      startY: 180,
      head: [["Business Insights"]],
      body: insights.map((insight) => [insight]),
    });

    doc.save("karamela-sales-report.pdf");
  }

  if (loading) {
    return (
      <main className="dashboard-page-shell">
        Loading reports...
      </main>
    );
  }

  return (
    <main className="dashboard-page-shell">
      {reportsError && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
          {reportsError}
        </div>
      )}

      <DashboardPageHeader
        title="Sales Reports"
        description="Daily sales, product performance, payments and business insights."
        titleClassName="mt-2 text-3xl font-bold text-[#d08a35] sm:mt-3 sm:text-4xl lg:text-5xl"
        actions={
          <div className="flex w-full flex-col gap-3 sm:flex-row">
            <DashboardPeriodSelect value={period} onChange={setPeriod} />
            <button
              type="button"
              onClick={downloadPDF}
              className="w-full rounded-2xl bg-[#d08a35] px-6 py-4 font-bold text-black hover:bg-[#e9a34c] sm:w-auto"
            >
              Download PDF Report
            </button>
          </div>
        }
      />

      <DashboardReportDateBanner value={reportDateRange} />

      <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardMetricCard
          title={`${periodHeading} Sales`}
          value={formatCurrency(totalSales)}
        />
        <DashboardMetricCard
          title="Transactions"
          value={transactions.toString()}
        />
        <DashboardMetricCard
          title="Average Sale"
          value={formatCurrency(Math.round(averageSale))}
        />
        <DashboardMetricCard
          title="Waste Value"
          value={formatCurrency(wasteValue)}
        />
      </section>

      <section className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        <DashboardMetricCard
          title="Cash Sales"
          value={formatCurrency(paymentTotals.cash || 0)}
          className="border-white/10 bg-black/30"
          accentClassName="text-white"
        />
        <DashboardMetricCard
          title="Mpesa Sales"
          value={formatCurrency(paymentTotals.mpesa || 0)}
          className="border-white/10 bg-black/30"
          accentClassName="text-white"
        />
        <DashboardMetricCard
          title="Card Sales"
          value={formatCurrency(paymentTotals.card || 0)}
          className="border-white/10 bg-black/30"
          accentClassName="text-white"
        />
      </section>

      <div className="mt-8">
        <DashboardInsightsSection
          title="Business Insights"
          insights={insights}
        />
      </div>

      <section className="dashboard-table-shell mt-8 rounded-[2rem] border border-white/10 bg-white/5">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-2xl font-bold text-[#d08a35]">
            Product Performance
          </h2>
        </div>

        <table className="dashboard-data-table w-full text-left text-sm">
          <thead className="bg-white/10 text-zinc-300">
            <tr>
              <th className="p-4">Product</th>
              <th className="p-4">Units Sold</th>
              <th className="p-4">Revenue</th>
            </tr>
          </thead>

          <tbody>
            {productPerformance.map((item) => (
              <tr key={item.product_name} className="border-t border-white/10">
                <td className="p-4">{item.product_name}</td>
                <td className="p-4">{item.quantity}</td>
                <td className="p-4 text-[#d08a35]">
                  {formatCurrency(item.revenue)}
                </td>
              </tr>
            ))}

            {reportsError && productPerformance.length === 0 && (
              <tr>
                <td colSpan={3} className="p-6 text-center text-amber-200">
                  {reportsError}
                </td>
              </tr>
            )}

            {!reportsError && reportsLoaded && productPerformance.length === 0 && (
              <tr>
                <td colSpan={3} className="p-6 text-center text-zinc-500">
                  No sales items recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
