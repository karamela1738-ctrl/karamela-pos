"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DashboardInsightsSection,
  DashboardMetricCard,
  DashboardPageHeader,
  DashboardPeriodSelect,
} from "@/components/dashboard/ui";
import {
  getStaffActivityFeed,
  type StaffActivityItem,
} from "@/lib/services/operations";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import {
  isDateWithinPeriod,
  type DashboardPeriod,
} from "@/lib/utils/period";

export default function StaffActivityPage() {
  const [activities, setActivities] = useState<StaffActivityItem[]>([]);
  const [period, setPeriod] = useState<DashboardPeriod>("today");

  async function loadActivity() {
    try {
      setActivities(await getStaffActivityFeed());
    } catch (error) {
      console.error(error);
    }
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
    (item) => item.activity_type === "Sale"
  ).length;
  const wasteCount = filteredActivities.filter(
    (item) => item.activity_type === "Waste"
  ).length;
  const closingCount = filteredActivities.filter(
    (item) => item.activity_type === "Closing Stock"
  ).length;
  const reconciliationCount = filteredActivities.filter(
    (item) => item.activity_type === "Reconciliation"
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
                key={item.activity_id}
                className="border-t border-white/10"
              >
                <td className="p-4 text-zinc-400">{formatDateTime(item.created_at)}</td>
                <td className="p-4 font-bold text-[#d08a35]">{item.activity_type}</td>
                <td className="p-4">
                  <div>{item.description}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    By {item.staff_name}
                  </div>
                </td>
                <td className="p-4">
                  {item.amount !== null ? formatCurrency(item.amount) : "-"}
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
