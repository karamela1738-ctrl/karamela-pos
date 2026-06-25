"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type SalesSummary = {
  cash: number;
  mpesa: number;
  card: number;
};

export default function ReconciliationPage() {
  const [sales, setSales] = useState<SalesSummary>({
    cash: 0,
    mpesa: 0,
    card: 0,
  });

  const [cashCounted, setCashCounted] = useState("");
  const [mpesaConfirmed, setMpesaConfirmed] = useState("");
  const [cardConfirmed, setCardConfirmed] = useState("");
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
    loadTodaySales();
  }, []);

  const expectedTotal = sales.cash + sales.mpesa + sales.card;

  const countedTotal =
    Number(cashCounted || 0) +
    Number(mpesaConfirmed || 0) +
    Number(cardConfirmed || 0);

  const variance = countedTotal - expectedTotal;

  async function saveReconciliation() {
    setLoading(true);

    const { data: stall, error: stallError } = await supabase
      .from("stalls")
      .select("id")
      .limit(1)
      .single();

    if (stallError || !stall) {
      alert("Could not find stall");
      setLoading(false);
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    const { error } = await supabase.from("payment_reconciliations").upsert(
      {
        stall_id: stall.id,
        business_date: today,
        cash_expected: sales.cash,
        cash_counted: Number(cashCounted || 0),
        mpesa_expected: sales.mpesa,
        mpesa_confirmed: Number(mpesaConfirmed || 0),
        card_expected: sales.card,
        card_confirmed: Number(cardConfirmed || 0),
        notes,
      },
      {
        onConflict: "stall_id,business_date",
      }
    );

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Payment reconciliation saved successfully");
  }

  return (
    <main className="min-h-screen bg-[#080604] p-8 text-white">
      <h1 className="text-4xl font-bold text-[#d08a35]">
        Payment Reconciliation
      </h1>

      <p className="mt-2 text-zinc-400">
        Compare expected sales against cash, Mpesa and card payments received.
      </p>

      <div className="mt-8 grid gap-5 md:grid-cols-4">
        <Card title="Cash Expected" value={`KES ${sales.cash}`} />
        <Card title="Mpesa Expected" value={`KES ${sales.mpesa}`} />
        <Card title="Card Expected" value={`KES ${sales.card}`} />
        <Card title="Total Expected" value={`KES ${expectedTotal}`} />
      </div>

      <div className="mt-8 grid gap-6 rounded-[2rem] border border-[#c47a2c]/20 bg-white/5 p-6 md:grid-cols-3">
        <Input
          label="Cash Counted"
          value={cashCounted}
          onChange={setCashCounted}
        />

        <Input
          label="Mpesa Confirmed"
          value={mpesaConfirmed}
          onChange={setMpesaConfirmed}
        />

        <Input
          label="Card Confirmed"
          value={cardConfirmed}
          onChange={setCardConfirmed}
        />

        <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
          <p className="text-sm text-zinc-400">Total Counted</p>
          <p className="mt-2 text-3xl font-bold">KES {countedTotal}</p>
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
          <p className="mt-2 text-3xl font-bold">KES {variance}</p>
        </div>

        <textarea
          placeholder="Notes e.g. cash short, Mpesa pending, card settlement delay"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="min-h-32 rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none md:col-span-3"
        />

        <button
          onClick={saveReconciliation}
          disabled={loading}
          className="rounded-2xl bg-[#d08a35] px-5 py-4 font-bold text-black hover:bg-[#e9a34c] disabled:opacity-50 md:col-span-3"
        >
          {loading ? "Saving..." : "Save Reconciliation"}
        </button>
      </div>
    </main>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-zinc-400">{title}</p>
      <p className="mt-3 text-2xl font-bold text-[#d08a35]">{value}</p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm text-zinc-400">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none"
      />
    </label>
  );
}