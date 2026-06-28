"use client";

import { useEffect, useState } from "react";
import {
  DashboardActionCard,
  DashboardMetricCard,
} from "@/components/dashboard/ui";
import { getStaffDashboardSnapshot, type StaffDashboardSnapshot } from "@/lib/services/dashboard";
import { validateStoredStaffSession, type StaffSession } from "@/lib/services/auth";
import { getBusinessDayStatus } from "@/lib/services/operations";
import { getMainStall } from "@/lib/services/stalls";
import { subscribeDashboardRefresh } from "@/lib/utils/dashboard-refresh";
import { formatCurrency, formatDate } from "@/lib/utils/format";

const STAFF_ACTIONS = [
  {
    title: "Sales POS",
    description:
      "Open the tablet sales screen and record customer purchases quickly.",
    href: "/dashboard/pos",
    buttonLabel: "Start Selling",
  },
  {
    title: "Waste Log",
    description:
      "Record damaged, melted, expired, sampled, or missing stock.",
    href: "/dashboard/waste",
    buttonLabel: "Record Waste",
  },
  {
    title: "Closing Stock",
    description:
      "Count remaining products at the end of the day and detect variance.",
    href: "/dashboard/closing-stock",
    buttonLabel: "Start Count",
  },
  {
    title: "Payment Reconciliation",
    description:
      "Compare cash, Mpesa, and card payments against system sales.",
    href: "/dashboard/reconciliation",
    buttonLabel: "Reconcile",
  },
  {
    title: "Inventory Check",
    description: "View current stock levels and low-stock products.",
    href: "/dashboard/inventory",
    buttonLabel: "View Stock",
  },
  {
    title: "End Shift",
    description:
      "Complete the day after sales, stock count, waste and payments are done.",
    href: "/dashboard/end-shift",
    buttonLabel: "End Shift",
  },
];

function getCurrentTime() {
  return new Date().toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Nairobi",
  });
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffSession | null>(null);
  const [time, setTime] = useState(() => getCurrentTime());
  const [summary, setSummary] = useState<StaffDashboardSnapshot | null>(null);
  const [stallId, setStallId] = useState("");
  const [canEndShift, setCanEndShift] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  async function loadStaff() {
    try {
      setStaff(await validateStoredStaffSession());
    } catch {
      setStaff(null);
    }
  }

  async function loadSnapshot() {
    setMetricsLoading(true);

    try {
      const stall = await getMainStall();
      const [nextSummary, status] = await Promise.all([
        getStaffDashboardSnapshot(stall.id),
        getBusinessDayStatus(),
      ]);

      setStallId(stall.id);
      setCanEndShift(status.can_end_shift);
      setSummary(nextSummary);
      setMetricsError(null);
    } catch (error) {
      console.error(error);
      setMetricsError(
        error instanceof Error
          ? error.message
          : "Unable to load dashboard totals."
      );
    } finally {
      setMetricsLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void Promise.all([loadStaff(), loadSnapshot()]);
    }, 0);
    const timerId = window.setInterval(() => {
      setTime(getCurrentTime());
    }, 1000);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(timerId);
    };
  }, []);

  useEffect(() => {
    return subscribeDashboardRefresh(() => {
      void loadSnapshot();
    });
  }, []);

  useEffect(() => {
    console.log("STAFF SUMMARY", summary);
  }, [summary]);

  const staffStats = [
    {
      title: "Today Sales",
      value: metricsLoading
        ? "Loading..."
        : formatCurrency(summary?.todaySales),
      label: metricsError
        ? metricsError
        : summary?.businessDate
          ? `Business date ${formatDate(summary.businessDate)}`
          : "No sales recorded yet",
    },
    {
      title: "Transactions",
      value: metricsLoading ? "..." : String(summary?.transactionCount || 0),
      label: metricsError
        ? "Refresh required"
        : summary
          ? `${summary.transactionCount} sale${summary.transactionCount === 1 ? "" : "s"} today`
          : "No transactions yet",
    },
    {
      title: "Waste Logged",
      value: metricsLoading ? "..." : String(summary?.wasteLogged || 0),
      label: metricsError
        ? "Refresh required"
        : summary
          ? `${summary.totalWasteQuantity} item${summary.totalWasteQuantity === 1 ? "" : "s"} affected`
          : "No waste recorded yet",
    },
    {
      title: "Shift Status",
      value: metricsLoading
        ? "..."
        : canEndShift
          ? "Ready"
          : "Open",
      label: metricsError
        ? "Unable to verify shift state"
        : canEndShift
          ? "Closing tasks complete"
          : "Active business day",
    },
  ];

  return (
    <main className="dashboard-page-shell bg-[#070503]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#9a5a18_0%,transparent_35%),radial-gradient(circle_at_bottom_right,#2a1205_0%,transparent_40%)] opacity-70" />

      <section className="dashboard-width relative py-2 sm:py-4">
        <div className="flex flex-col justify-between gap-6 rounded-[2rem] border border-[#c47a2c]/20 bg-white/5 p-6 shadow-2xl backdrop-blur-xl md:flex-row md:items-center">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-[#d08a35]">
              Staff Workspace
            </p>

            <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
              Welcome,{" "}
              <span className="text-[#d08a35]">
                {staff?.full_name || "Staff"}
              </span>
            </h1>

            <p className="mt-2 text-zinc-400">
              Daily sales, stock count, waste recording and reconciliation.
            </p>
          </div>

          <div className="w-full rounded-3xl border border-white/10 bg-black/30 px-5 py-4 text-left sm:w-auto sm:px-6 sm:text-right">
            <p className="text-sm text-zinc-400">Current Time</p>
            <p className="text-3xl font-bold text-[#d08a35]">
              {time || "--:--"}
            </p>
            <p className="mt-1 text-xs uppercase tracking-widest text-zinc-500">
              {stallId
                ? `Stall ${stallId.slice(0, 8)}`
                : "Active Stall"}
            </p>
          </div>
        </div>

        {metricsError && (
          <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
            {metricsError}
          </div>
        )}

        <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {staffStats.map((stat) => (
            <DashboardMetricCard
              key={stat.title}
              title={stat.title}
              value={stat.value}
              className="border-white/10 bg-white/5 shadow-xl backdrop-blur"
              accentClassName="text-white"
              valueClassName="mt-3 text-3xl font-bold"
              titleClassName="text-sm text-zinc-400"
              footer={
                <p className="mt-1 text-xs text-[#d08a35]">{stat.label}</p>
              }
            />
          ))}
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {STAFF_ACTIONS.map((action) => (
            <DashboardActionCard
              key={action.title}
              title={action.title}
              description={action.description}
              href={action.href}
              buttonLabel={action.buttonLabel}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
