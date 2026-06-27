"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  DashboardActionCard,
  DashboardInsightsSection,
  DashboardMetricCard,
} from "@/components/dashboard/ui";
import { logoutStaffSession } from "@/lib/services/auth";
import {
  getOwnerDashboardSnapshot,
  type OwnerDashboardSnapshot,
} from "@/lib/services/operations";
import { subscribeDashboardRefresh } from "@/lib/utils/dashboard-refresh";
import { formatCurrency, formatDate } from "@/lib/utils/format";

export default function OwnerDashboard() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<OwnerDashboardSnapshot | null>(null);

  async function loadData() {
    try {
      setSnapshot(await getOwnerDashboardSnapshot());
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    return subscribeDashboardRefresh(() => {
      void loadData();
    });
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.log("OWNER SNAPSHOT", snapshot);
    }
  }, [snapshot]);

  const insights = useMemo(
    () => [
      (snapshot?.today_sales || 0) > 0
        ? `Today's sales stand at ${formatCurrency(snapshot?.today_sales)}.`
        : "No sales recorded today yet.",
      (snapshot?.today_waste || 0) > 0
        ? `Waste today is ${formatCurrency(snapshot?.today_waste)}. Review shrinkage.`
        : "No waste recorded today.",
      (snapshot?.low_stock_count || 0) > 0
        ? `${snapshot?.low_stock_count} products are at or below reorder level.`
        : "Stock levels look healthy.",
      snapshot?.closing_stock_complete
        ? "Closing stock is locked for the current business date."
        : `Closing stock still needs ${Math.max(
            (snapshot?.total_products || 0) - (snapshot?.counted_products || 0),
            0
          )} product counts.`,
      snapshot?.reconciliation_complete
        ? `Reconciliation recorded. Variance ${formatCurrency(
            snapshot?.reconciliation_variance
          )}.`
        : "Payment reconciliation is still pending.",
    ],
    [snapshot]
  );

  async function logout() {
    await logoutStaffSession();
    router.replace("/login");
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#070503] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#b56a1c_0%,transparent_32%),radial-gradient(circle_at_bottom_right,#3a1705_0%,transparent_38%)] opacity-70" />

      <section className="relative mx-auto max-w-7xl px-6 py-8">
        <div className="rounded-[2.5rem] border border-[#d08a35]/25 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
          <p className="text-sm uppercase tracking-[0.35em] text-[#d08a35]">
            Karamela Control Center
          </p>

          <div className="mt-4 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <h1 className="text-5xl font-black tracking-tight md:text-6xl">
                Owner Dashboard
              </h1>
              <p className="mt-3 max-w-2xl text-zinc-400">
                Sales performance, inventory control, waste monitoring,
                payment reconciliation and staff activity.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="rounded-3xl border border-white/10 bg-black/30 px-6 py-4">
                <p className="text-sm text-zinc-400">Today</p>
                <p className="text-2xl font-bold text-[#d08a35]">
                  {snapshot?.business_date
                    ? formatDate(snapshot.business_date)
                    : new Date().toLocaleDateString()}
                </p>
              </div>

              <button
                type="button"
                onClick={logout}
                className="rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-4 font-bold text-red-200 hover:bg-red-500/20"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-4">
          <DashboardMetricCard
            title="Today's Sales"
            value={formatCurrency(snapshot?.today_sales)}
            accentClassName="text-white font-black"
          />
          <DashboardMetricCard
            title="Inventory Value"
            value={formatCurrency(snapshot?.inventory_value)}
            accentClassName="text-white font-black"
          />
          <DashboardMetricCard
            title="Waste Today"
            value={formatCurrency(snapshot?.today_waste)}
            accentClassName="text-white font-black"
          />
          <DashboardMetricCard
            title="Low Stock"
            value={String(snapshot?.low_stock_count || 0)}
            accentClassName="text-white font-black"
            footer={
              <p className="mt-2 text-xs text-zinc-400">
                {snapshot?.counted_products || 0}/{snapshot?.total_products || 0} products counted for close
              </p>
            }
          />
        </div>

        <div className="mt-8">
          <DashboardInsightsSection
            title="Alerts & Business Insights"
            insights={insights}
            columnsClassName="md:grid-cols-3"
          />
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <DashboardActionCard
            title="Sales Reports"
            description="Daily, weekly and monthly sales performance with PDF reports."
            href="/dashboard/reports"
          />

          <DashboardActionCard
            title="Owner Inventory"
            description="Inventory value, low-stock alerts, fast movers and slow movers."
            href="/dashboard/owner-inventory"
          />

          <DashboardActionCard
            title="Waste Analysis"
            description="Monitor shrinkage, theft, damaged stock and loss value."
            href="/dashboard/owner-waste"
          />

          <DashboardActionCard
            title="Payment Control"
            description="Review cash, Mpesa, card payments and payment variance."
            href="/dashboard/owner-reconciliation"
          />

          <DashboardActionCard
            title="Closing Stock"
            description="Review stock counts, missing stock and variance value."
            href="/dashboard/owner-closing-stock"
          />

          <DashboardActionCard
            title="Staff Activity"
            description="Monitor staff sales, waste, closing count and shift activity."
            href="/dashboard/staff-activity"
          />

          <DashboardActionCard
            title="Inventory Movements"
            description="Audit stock changes with actor names, references and movement notes."
            href="/dashboard/inventory-movements"
          />
        </div>
      </section>
    </main>
  );
}
