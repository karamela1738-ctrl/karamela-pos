"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DashboardInsightsSection,
  DashboardMetricCard,
  DashboardPageHeader,
  DashboardPeriodSelect,
} from "@/components/dashboard/ui";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import {
  isDateWithinPeriod,
  type DashboardPeriod,
} from "@/lib/utils/period";

type Activity = {
  id: string;
  type: string;
  description: string;
  amount?: number;
  created_at: string;
};

export default function StaffActivityPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [period, setPeriod] = useState<DashboardPeriod>("today");

  async function loadActivity() {
    const [salesRes, wasteRes, closingRes, reconRes, shiftRes] =
      await Promise.all([
        supabase.from("sales").select("id,total_amount,payment_method,created_at"),
        supabase
          .from("waste_logs")
          .select("id,quantity,reason,value_amount,created_at"),
        supabase.from("closing_stock_counts").select("id,business_date,created_at"),
        supabase
          .from("payment_reconciliations")
          .select("id,business_date,variance,created_at"),
        supabase.from("shift_logs").select("id,action,created_at"),
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

    const reconciliationActivities =
      reconRes.data?.map((item) => ({
        id: item.id,
        type: "Reconciliation",
        description: `Payment reconciliation completed. Variance ${formatCurrency(item.variance || 0)}`,
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
        ...reconciliationActivities,
        ...shiftActivities,
      ].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    );
  }

  useEffect(() => {
    void loadActivity();
  }, []);

  const filteredActivities = useMemo(
    () =>
      activities.filter((activity) =>
        isDateWithinPeriod(activity.created_at, period)
      ),
    [activities, period]
  );

  const salesCount = filteredActivities.filter(
    (item) => item.type === "Sale"
  ).length;
  const wasteCount = filteredActivities.filter(
    (item) => item.type === "Waste"
  ).length;
  const closingCount = filteredActivities.filter(
    (item) => item.type === "Closing Stock"
  ).length;
  const reconciliationCount = filteredActivities.filter(
    (item) => item.type === "Reconciliation"
  ).length;

  const insights = [
    salesCount > 0
      ? `Staff completed ${salesCount} sale activities.`
      : "No sales activity recorded for this period.",
    wasteCount > 0
      ? `${wasteCount} waste entries were recorded.`
      : "No waste activity recorded.",
    closingCount > 0
      ? "Closing stock count has been submitted."
      : "Closing stock count has not been submitted.",
    reconciliationCount > 0
      ? "Payment reconciliation has been completed."
      : "Payment reconciliation has not been completed.",
  ];

  return (
    <main className="min-h-screen bg-[#080604] p-8 text-white">
      <DashboardPageHeader
        eyebrow="Owner Monitoring"
        title="Staff Activity"
        description="Monitor sales, waste, closing stock, reconciliation and shift activity."
        actions={<DashboardPeriodSelect value={period} onChange={setPeriod} />}
      />

      <section className="mt-8 grid gap-5 md:grid-cols-4">
        <DashboardMetricCard title="Sales Actions" value={salesCount.toString()} />
        <DashboardMetricCard title="Waste Entries" value={wasteCount.toString()} />
        <DashboardMetricCard title="Closing Counts" value={closingCount.toString()} />
        <DashboardMetricCard
          title="Reconciliations"
          value={reconciliationCount.toString()}
        />
      </section>

      <div className="mt-8">
        <DashboardInsightsSection title="Activity Insights" insights={insights} />
      </div>

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
            {filteredActivities.map((item) => (
              <tr
                key={`${item.type}-${item.id}`}
                className="border-t border-white/10"
              >
                <td className="p-4 text-zinc-400">{formatDateTime(item.created_at)}</td>
                <td className="p-4 font-bold text-[#d08a35]">{item.type}</td>
                <td className="p-4">{item.description}</td>
                <td className="p-4">
                  {item.amount !== undefined ? formatCurrency(item.amount) : "-"}
                </td>
              </tr>
            ))}

            {filteredActivities.length === 0 && (
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
