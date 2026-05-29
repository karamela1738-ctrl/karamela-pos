"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Staff = {
  id: string;
  full_name: string;
  role: string;
};

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [time, setTime] = useState("");

  useEffect(() => {
    const savedStaff = localStorage.getItem("karamela_staff");

    if (savedStaff) {
      setStaff(JSON.parse(savedStaff));
    }

    const timer = setInterval(() => {
      setTime(
        new Date().toLocaleTimeString("en-KE", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }, 1000);

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
          <StatCard title="Today Sales" value="KES 0" label="No sales yet" />
          <StatCard title="Transactions" value="0" label="Today" />
          <StatCard title="Waste Logged" value="0" label="Items" />
          <StatCard title="Shift Status" value="Open" label="Active shift" />
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <ActionCard
            title="Sales POS"
            description="Open the tablet sales screen and record customer purchases quickly."
            href="/dashboard/pos"
            button="Start Selling"
          />

          <ActionCard
            title="Waste Log"
            description="Record damaged, melted, expired, sampled, or missing stock."
            href="/dashboard/waste"
            button="Record Waste"
          />

          <ActionCard
            title="Closing Stock"
            description="Count remaining products at the end of the day and detect variance."
            href="/dashboard/closing-stock"
            button="Start Count"
          />

          <ActionCard
            title="Payment Reconciliation"
            description="Compare cash, Mpesa, and card payments against system sales."
            href="/dashboard/reconciliation"
            button="Reconcile"
          />

          <ActionCard
            title="Inventory Check"
            description="View current stock levels and low-stock products."
            href="/dashboard/inventory"
            button="View Stock"
          />

          <ActionCard
            title="End Shift"
            description="Complete the day after sales, stock count, waste and payments are done."
            href="/dashboard/end-shift"
            button="End Shift"
          />
        </div>
      </section>
    </main>
  );
}

function StatCard({
  title,
  value,
  label,
}: {
  title: string;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur">
      <p className="text-sm text-zinc-400">{title}</p>
      <p className="mt-3 text-3xl font-bold text-white">{value}</p>
      <p className="mt-1 text-xs text-[#d08a35]">{label}</p>
    </div>
  );
}

function ActionCard({
  title,
  description,
  href,
  button,
}: {
  title: string;
  description: string;
  href: string;
  button: string;
}) {
  return (
    <div className="rounded-[2rem] border border-[#c47a2c]/20 bg-black/30 p-6 shadow-2xl transition hover:-translate-y-1 hover:border-[#d08a35]/60">
      <h2 className="text-2xl font-bold text-[#d08a35]">{title}</h2>
      <p className="mt-3 min-h-20 text-sm leading-6 text-zinc-400">
        {description}
      </p>

      <Link
        href={href}
        className="mt-6 inline-flex w-full justify-center rounded-2xl bg-[#d08a35] px-5 py-3 font-bold text-black hover:bg-[#e9a34c]"
      >
        {button}
      </Link>
    </div>
  );
}