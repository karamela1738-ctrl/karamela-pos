"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  created_at?: string;
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

    const { data: salesData } = await supabase
      .from("sales")
      .select("id,total_amount,payment_method,created_at")
      .gte("created_at", `${today}T00:00:00`)
      .lte("created_at", `${today}T23:59:59`)
      .order("created_at", { ascending: false });

    const { data: itemData } = await supabase
      .from("sale_items")
      .select("id,product_name,quantity,unit_price,subtotal")
      .order("product_name");

    const { data: wasteData } = await supabase
      .from("waste_logs")
      .select("id,quantity,reason,value_amount,created_at")
      .gte("created_at", `${today}T00:00:00`)
      .lte("created_at", `${today}T23:59:59`);

    setSales(salesData || []);
    setItems(itemData || []);
    setWaste(wasteData || []);
    setLoading(false);
  }

  useEffect(() => {
    loadReports();
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

  const paymentTotals = useMemo(() => {
    return sales.reduce(
      (acc, sale) => {
        const method = sale.payment_method || "cash";
        acc[method] = (acc[method] || 0) + Number(sale.total_amount || 0);
        return acc;
      },
      {} as Record<string, number>
    );
  }, [sales]);

  const productPerformance = useMemo(() => {
    const map = new Map<
      string,
      { product_name: string; quantity: number; revenue: number }
    >();

    items.forEach((item) => {
      const existing = map.get(item.product_name);

      if (existing) {
        existing.quantity += Number(item.quantity || 0);
        existing.revenue += Number(item.subtotal || 0);
      } else {
        map.set(item.product_name, {
          product_name: item.product_name,
          quantity: Number(item.quantity || 0),
          revenue: Number(item.subtotal || 0),
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
  }, [items]);

  const bestSeller = productPerformance[0];

  const insights = [
    totalSales > 0
      ? `Today's sales are KES ${totalSales.toLocaleString()}.`
      : "No sales have been recorded today yet.",
    bestSeller
      ? `${bestSeller.product_name} is the fastest moving product with ${bestSeller.quantity} units sold.`
      : "No product movement yet.",
    wasteValue > 0
      ? `Waste recorded today is KES ${wasteValue.toLocaleString()}. Monitor shrinkage closely.`
      : "No waste recorded today. Good stock control so far.",
    averageSale > 0
      ? `Average transaction value is KES ${averageSale.toFixed(0)}.`
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
        ["Total Sales", `KES ${totalSales.toLocaleString()}`],
        ["Transactions", transactions.toString()],
        ["Average Sale", `KES ${averageSale.toFixed(0)}`],
        ["Waste Value", `KES ${wasteValue.toLocaleString()}`],
        ["Cash Sales", `KES ${(paymentTotals.cash || 0).toLocaleString()}`],
        ["Mpesa Sales", `KES ${(paymentTotals.mpesa || 0).toLocaleString()}`],
        ["Card Sales", `KES ${(paymentTotals.card || 0).toLocaleString()}`],
      ],
    });

    autoTable(doc, {
      startY: 95,
      head: [["Product", "Units Sold", "Revenue"]],
      body: productPerformance.slice(0, 20).map((item) => [
        item.product_name,
        item.quantity,
        `KES ${item.revenue.toLocaleString()}`,
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
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
        <div>
          <h1 className="text-5xl font-bold text-[#d08a35]">Sales Reports</h1>
          <p className="mt-2 text-zinc-400">
            Daily sales, product performance, payments and business insights.
          </p>
        </div>

        <button
          onClick={downloadPDF}
          className="rounded-2xl bg-[#d08a35] px-6 py-4 font-bold text-black hover:bg-[#e9a34c]"
        >
          Download PDF Report
        </button>
      </div>

      <section className="mt-8 grid gap-5 md:grid-cols-4">
        <Card title="Today's Sales" value={`KES ${totalSales.toLocaleString()}`} />
        <Card title="Transactions" value={transactions.toString()} />
        <Card title="Average Sale" value={`KES ${averageSale.toFixed(0)}`} />
        <Card title="Waste Value" value={`KES ${wasteValue.toLocaleString()}`} />
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-3">
        <PaymentCard title="Cash" amount={paymentTotals.cash || 0} />
        <PaymentCard title="Mpesa" amount={paymentTotals.mpesa || 0} />
        <PaymentCard title="Card" amount={paymentTotals.card || 0} />
      </section>

      <section className="mt-8 rounded-[2rem] border border-[#d08a35]/20 bg-white/5 p-6">
        <h2 className="text-2xl font-bold text-[#d08a35]">Business Insights</h2>

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
                  KES {item.revenue.toLocaleString()}
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

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-3xl border border-[#d08a35]/20 bg-white/5 p-6">
      <p className="text-sm text-zinc-400">{title}</p>
      <p className="mt-3 text-3xl font-bold text-[#d08a35]">{value}</p>
    </div>
  );
}

function PaymentCard({ title, amount }: { title: string; amount: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/30 p-6">
      <p className="text-sm text-zinc-400">{title} Sales</p>
      <p className="mt-3 text-3xl font-bold text-white">
        KES {amount.toLocaleString()}
      </p>
    </div>
  );
}