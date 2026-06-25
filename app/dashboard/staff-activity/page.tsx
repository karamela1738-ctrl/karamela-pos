"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Activity = {
  id: string;
  type: string;
  description: string;
  amount?: number;
  created_at: string;
};

export default function StaffActivityPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [period, setPeriod] = useState("today");

  async function loadActivity() {
    const [salesRes, wasteRes, closingRes, reconRes, shiftRes] =
      await Promise.all([
        supabase
          .from("sales")
          .select("id,total_amount,payment_method,created_at"),

        supabase
          .from("waste_logs")
          .select("id,quantity,reason,value_amount,created_at"),

        supabase
          .from("closing_stock_counts")
          .select("id,business_date,created_at"),

        supabase
          .from("payment_reconciliations")
          .select("id,business_date,variance,created_at"),

        supabase
          .from("shift_logs")
          .select("id,action,created_at"),
      ]);

    const saleActivities =
      salesRes.data?.map((sale) => ({
        id: sale.id,
        type: "Sale",
        description: `${sale.payment_method} sale completed`,
        amount: Number(sale.total_amount || 0),
        created_at: sale.created_at,
      })) || [];

    const wasteActivities =
      wasteRes.data?.map((waste) => ({
        id: waste.id,
        type: "Waste",
        description: `${waste.quantity} item(s) recorded as ${waste.reason}`,
        amount: Number(waste.value_amount || 0),
        created_at: waste.created_at,
      })) || [];

    const closingActivities =
      closingRes.data?.map((item) => ({
        id: item.id,
        type: "Closing Stock",
        description: `Closing stock count submitted for ${item.business_date}`,
        created_at: item.created_at,
      })) || [];

    const reconActivities =
      reconRes.data?.map((item) => ({
        id: item.id,
        type: "Reconciliation",
        description: `Payment reconciliation completed. Variance KES ${
          item.variance || 0
        }`,
        amount: Number(item.variance || 0),
        created_at: item.created_at,
      })) || [];

    const shiftActivities =
      shiftRes.data?.map((shift) => ({
        id: shift.id,
        type: "Shift",
        description: shift.action || "Shift activity",
        created_at: shift.created_at,
      })) || [];

    setActivities(
      [
        ...saleActivities,
        ...wasteActivities,
        ...closingActivities,
        ...reconActivities,
        ...shiftActivities,
      ].sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
      )
    );
  }

  useEffect(() => {
    loadActivity();
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

  const filtered = useMemo(() => {
    const start = startDate();
    return activities.filter((item) => new Date(item.created_at) >= start);
  }, [activities, period]);

  const salesCount = filtered.filter((item) => item.type === "Sale").length;
  const wasteCount = filtered.filter((item) => item.type === "Waste").length;
  const closingCount = filtered.filter(
    (item) => item.type === "Closing Stock"
  ).length;
  const reconciliationCount = filtered.filter(
    (item) => item.type === "Reconciliation"
  ).length;

  const insights = [
    salesCount > 0
      ? `✅ Staff completed ${salesCount} sale activities.`
      : "⚠️ No sales activity recorded for this period.",
    wasteCount > 0
      ? `⚠️ ${wasteCount} waste entries were recorded.`
      : "✅ No waste activity recorded.",
    closingCount > 0
      ? "✅ Closing stock count has been submitted."
      : "⚠️ Closing stock count has not been submitted.",
    reconciliationCount > 0
      ? "✅ Payment reconciliation has been completed."
      : "⚠️ Payment reconciliation has not been completed.",
  ];

  return (
    <main className="min-h-screen bg-[#080604] p-8 text-white">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-[#d08a35]">
            Owner Monitoring
          </p>

          <h1 className="mt-3 text-5xl font-bold">Staff Activity</h1>

          <p className="mt-3 text-zinc-400">
            Monitor sales, waste, closing stock, reconciliation and shift
            activity.
          </p>
        </div>

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
      </div>

      <section className="mt-8 grid gap-5 md:grid-cols-4">
        <Card title="Sales Actions" value={salesCount.toString()} />
        <Card title="Waste Entries" value={wasteCount.toString()} />
        <Card title="Closing Counts" value={closingCount.toString()} />
        <Card
          title="Reconciliations"
          value={reconciliationCount.toString()}
        />
      </section>

      <section className="mt-8 rounded-[2rem] border border-[#d08a35]/20 bg-white/5 p-6">
        <h2 className="text-2xl font-bold text-[#d08a35]">
          Activity Insights
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

      <section className="mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-2xl font-bold text-[#d08a35]">
            Activity Timeline
          </h2>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-white/10 text-zinc-300">
            <tr>
              <th className="p-4">Time</th>
              <th className="p-4">Activity</th>
              <th className="p-4">Description</th>
              <th className="p-4">Amount</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((item) => (
              <tr key={`${item.type}-${item.id}`} className="border-t border-white/10">
                <td className="p-4 text-zinc-400">
                  {new Date(item.created_at).toLocaleString()}
                </td>

                <td className="p-4 font-bold text-[#d08a35]">{item.type}</td>

                <td className="p-4">{item.description}</td>

                <td className="p-4">
                  {item.amount !== undefined ? `KES ${item.amount}` : "-"}
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-zinc-500">
                  No staff activity found.
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