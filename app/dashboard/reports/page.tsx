"use client";

import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  DashboardInsightsSection,
  DashboardMetricCard,
  DashboardPageHeader,
} from "@/components/dashboard/ui";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/format";

type Sale = {
  id: string;
  total_amount: number;
  payment_method: string;
  created_at: string;
};

type SaleItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

type WasteLog = {
  id: string;
  quantity: number;
  reason: string;
  value_amount: number | null;
  created_at: string;
};

export default function SalesReportsPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [waste, setWaste] = useState<WasteLog[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadReports() {
    setLoading(true);

    const today = new Date().toISOString().slice(0, 10);
    const startOfDay = `${today}T00:00:00`;
    const endOfDay = `${today}T23:59:59`;

    const [salesResponse, itemsResponse, wasteResponse] = await Promise.all([
      supabase
        .from("sales")
        .select("id,total_amount,payment_method,created_at")
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay)
        .order("created_at", { ascending: false }),
      supabase
        .from("sale_items")
        .select("id,product_name,quantity,unit_price,subtotal")
        .order("product_name"),
      supabase
        .from("waste_logs")
        .select("id,quantity,reason,value_amount,created_at")
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay),
    ]);

    setSales(salesResponse.data || []);
    setItems(itemsResponse.data || []);
    setWaste(wasteResponse.data || []);
    setLoading(false);
  }

  useEffect(() => {
    void loadReports();
  }, []);

  const totalSales = sales.reduce(
    (sum, sale) => sum + Number(sale.total_amount || 0),
    0
  );

  const transactions = sales.length;
  const averageSale = transactions > 0 ? totalSales / transactions : 0;

  const wasteValue = waste.reduce(
    (sum, log) => sum + Number(log.value_amount || 0),
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
      ? `Today's sales are ${formatCurrency(totalSales)}.`
      : "No sales have been recorded today yet.",
    bestSeller
      ? `${bestSeller.product_name} is the fastest moving product with ${bestSeller.quantity} units sold.`
      : "No product movement yet.",
    wasteValue > 0
      ? `Waste recorded today is ${formatCurrency(wasteValue)}. Monitor shrinkage closely.`
      : "No waste recorded today. Good stock control so far.",
    averageSale > 0
      ? `Average transaction value is ${formatCurrency(Math.round(averageSale))}.`
      : "Average transaction value will appear after sales are recorded.",
  ];

  function downloadPDF() {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("Karamela Sales Report", 14, 20);

    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 28);

    autoTable(doc, {
      startY: 36,
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
      <main className="min-h-screen bg-[#080604] p-8 text-white">
        Loading reports...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080604] p-8 text-white">
      <DashboardPageHeader
        title="Sales Reports"
        description="Daily sales, product performance, payments and business insights."
        titleClassName="text-5xl font-bold text-[#d08a35]"
        actions={
          <button
            type="button"
            onClick={downloadPDF}
            className="rounded-2xl bg-[#d08a35] px-6 py-4 font-bold text-black hover:bg-[#e9a34c]"
          >
            Download PDF Report
          </button>
        }
      />

      <section className="mt-8 grid gap-5 md:grid-cols-4">
        <DashboardMetricCard
          title="Today's Sales"
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

      <section className="mt-8 grid gap-6 md:grid-cols-3">
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

      <section className="mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-2xl font-bold text-[#d08a35]">
            Product Performance
          </h2>
        </div>

        <table className="w-full text-left text-sm">
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

            {productPerformance.length === 0 && (
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
