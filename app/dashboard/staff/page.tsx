"use client";

import { useEffect, useState } from "react";
import {
  DashboardActionCard,
  DashboardMetricCard,
} from "@/components/dashboard/ui";
import { getStoredStaffSession, type StaffSession } from "@/lib/services/auth";

const STAFF_STATS = [
  { title: "Today Sales", value: "KES 0", label: "No sales yet" },
  { title: "Transactions", value: "0", label: "Today" },
  { title: "Waste Logged", value: "0", label: "Items" },
  { title: "Shift Status", value: "Open", label: "Active shift" },
];

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

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffSession | null>(null);
  const [time, setTime] = useState("");

  useEffect(() => {
    setStaff(getStoredStaffSession());

    function updateTime() {
      setTime(
        new Date().toLocaleTimeString("en-KE", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }

    updateTime();

    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <main className="min-h-screen bg-[#070503] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#9a5a18_0%,transparent_35%),radial-gradient(circle_at_bottom_right,#2a1205_0%,transparent_40%)] opacity-70" />

      <section className="relative mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-col justify-between gap-6 rounded-[2rem] border border-[#c47a2c]/20 bg-white/5 p-6 shadow-2xl backdrop-blur-xl md:flex-row md:items-center">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-[#d08a35]">
              Staff Workspace
            </p>

            <h1 className="mt-3 text-4xl font-bold">
              Welcome,{" "}
              <span className="text-[#d08a35]">
                {staff?.full_name || "Staff"}
              </span>
            </h1>

            <p className="mt-2 text-zinc-400">
              Daily sales, stock count, waste recording and reconciliation.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/30 px-6 py-4 text-right">
            <p className="text-sm text-zinc-400">Current Time</p>
            <p className="text-3xl font-bold text-[#d08a35]">
              {time || "--:--"}
            </p>
            <p className="mt-1 text-xs uppercase tracking-widest text-zinc-500">
              Main Candy Stall
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-4">
          {STAFF_STATS.map((stat) => (
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

        <div className="mt-8 grid gap-6 md:grid-cols-3">
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
