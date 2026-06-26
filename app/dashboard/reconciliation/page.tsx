"use client";

import { useEffect, useState } from "react";
import {
  DashboardMetricCard,
  DashboardPageHeader,
} from "@/components/dashboard/ui";
import { supabase } from "@/lib/supabase/client";
import { getMainStall } from "@/lib/services/stalls";
import { savePaymentReconciliationWorkflow } from "@/lib/services/workflows";
import { formatCurrency } from "@/lib/utils/format";

type SalesSummary = {
  cash: number;
  mpesa: number;
  card: number;
};

const RECONCILIATION_FIELDS = [
  { key: "cash", label: "Cash Counted" },
  { key: "mpesa", label: "Mpesa Confirmed" },
  { key: "card", label: "Card Confirmed" },
] as const;

export default function ReconciliationPage() {
  const [sales, setSales] = useState<SalesSummary>({
    cash: 0,
    mpesa: 0,
    card: 0,
  });
  const [amounts, setAmounts] = useState({
    cash: "",
    mpesa: "",
    card: "",
  });
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadTodaySales() {
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("sales")
      .select("payment_method, total_amount, created_at")
      .gte("created_at", `${today}T00:00:00`)
      .lte("created_at", `${today}T23:59:59`);

    if (error) {
      console.error(error);
      return;
    }

    const summary = { cash: 0, mpesa: 0, card: 0 };

    data?.forEach((sale) => {
      const method = sale.payment_method as keyof SalesSummary;

      if (method === "cash" || method === "mpesa" || method === "card") {
        summary[method] += Number(sale.total_amount || 0);
      }
    });

    setSales(summary);
  }

  useEffect(() => {
    void loadTodaySales();
  }, []);

  const expectedTotal = sales.cash + sales.mpesa + sales.card;
  const countedTotal =
    Number(amounts.cash || 0) + Number(amounts.mpesa || 0) + Number(amounts.card || 0);
  const variance = countedTotal - expectedTotal;

  function updateAmount(key: keyof typeof amounts, value: string) {
    setAmounts((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function saveReconciliation() {
    setLoading(true);

    try {
      const stall = await getMainStall();

      if (!stall) {
        alert("Could not find stall");
        return;
      }

      const today = new Date().toISOString().slice(0, 10);

      await savePaymentReconciliationWorkflow({
        stallId: stall.id,
        businessDate: today,
        cashCounted: Number(amounts.cash || 0),
        mpesaConfirmed: Number(amounts.mpesa || 0),
        cardConfirmed: Number(amounts.card || 0),
        notes,
      });

      alert("Payment reconciliation saved successfully");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unable to save reconciliation right now."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#080604] p-8 text-white">
      <DashboardPageHeader
        title="Payment Reconciliation"
        description="Compare expected sales against cash, Mpesa and card payments received."
      />

      <section className="mt-8 grid gap-5 md:grid-cols-4">
        <DashboardMetricCard
          title="Cash Expected"
          value={formatCurrency(sales.cash)}
        />
        <DashboardMetricCard
          title="Mpesa Expected"
          value={formatCurrency(sales.mpesa)}
        />
        <DashboardMetricCard
          title="Card Expected"
          value={formatCurrency(sales.card)}
        />
        <DashboardMetricCard
          title="Total Expected"
          value={formatCurrency(expectedTotal)}
        />
      </section>

      <section className="mt-8 grid gap-6 rounded-[2rem] border border-[#c47a2c]/20 bg-white/5 p-6 md:grid-cols-3">
        {RECONCILIATION_FIELDS.map((field) => (
          <label key={field.key} className="block">
            <span className="text-sm text-zinc-400">{field.label}</span>
            <input
              type="number"
              value={amounts[field.key]}
              onChange={(event) => updateAmount(field.key, event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none"
            />
          </label>
        ))}

        <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
          <p className="text-sm text-zinc-400">Total Counted</p>
          <p className="mt-2 text-3xl font-bold">{formatCurrency(countedTotal)}</p>
        </div>

        <div
          className={`rounded-2xl border p-5 ${
            variance === 0
              ? "border-green-500/30 bg-green-500/10"
              : variance < 0
                ? "border-red-500/30 bg-red-500/10"
                : "border-[#d08a35]/30 bg-[#d08a35]/10"
          }`}
        >
          <p className="text-sm text-zinc-400">Variance</p>
          <p className="mt-2 text-3xl font-bold">{formatCurrency(variance)}</p>
        </div>

        <textarea
          placeholder="Notes e.g. cash short, Mpesa pending, card settlement delay"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="min-h-32 rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none md:col-span-3"
        />

        <button
          type="button"
          onClick={saveReconciliation}
          disabled={loading}
          className="rounded-2xl bg-[#d08a35] px-5 py-4 font-bold text-black hover:bg-[#e9a34c] disabled:opacity-50 md:col-span-3"
        >
          {loading ? "Saving..." : "Save Reconciliation"}
        </button>
      </section>
    </main>
  );
}
