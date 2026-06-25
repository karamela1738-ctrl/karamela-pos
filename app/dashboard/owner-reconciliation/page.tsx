"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Sale = {
  id: string;
  total_amount: number;
  payment_method: string;
  created_at: string;
};

type Reconciliation = {
  id: string;
  business_date: string;
  cash_expected: number;
  cash_counted: number;
  mpesa_expected: number;
  mpesa_confirmed: number;
  card_expected: number;
  card_confirmed: number;
  variance: number;
  notes: string | null;
  created_at: string;
};

export default function OwnerReconciliationPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [recons, setRecons] = useState<Reconciliation[]>([]);
  const [period, setPeriod] = useState("today");

  async function loadData() {
    const { data: salesData } = await supabase
      .from("sales")
      .select("id,total_amount,payment_method,created_at")
      .order("created_at", { ascending: false });

    const { data: reconData } = await supabase
      .from("payment_reconciliations")
      .select("*")
      .order("business_date", { ascending: false });

    setSales(salesData || []);
    setRecons((reconData || []) as Reconciliation[]);
  }

  useEffect(() => {
    loadData();
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

  const filteredSales = useMemo(() => {
    const start = startDate();
    return sales.filter((sale) => new Date(sale.created_at) >= start);
  }, [sales, period]);

  const filteredRecons = useMemo(() => {
    const start = startDate();
    return recons.filter((recon) => new Date(recon.business_date) >= start);
  }, [recons, period]);

  const expectedByPayment = useMemo(() => {
    return filteredSales.reduce(
      (acc, sale) => {
        const method = sale.payment_method || "cash";

        if (method === "cash") acc.cash += Number(sale.total_amount || 0);
        if (method === "mpesa") acc.mpesa += Number(sale.total_amount || 0);
        if (method === "card") acc.card += Number(sale.total_amount || 0);

        return acc;
      },
      { cash: 0, mpesa: 0, card: 0 }
    );
  }, [filteredSales]);

  const totalExpected =
    expectedByPayment.cash + expectedByPayment.mpesa + expectedByPayment.card;

  const totalCounted = filteredRecons.reduce((sum, item) => {
    return (
      sum +
      Number(item.cash_counted || 0) +
      Number(item.mpesa_confirmed || 0) +
      Number(item.card_confirmed || 0)
    );
  }, 0);

  const totalVariance = totalCounted - totalExpected;

  const unreconciled =
    filteredSales.length > 0 && filteredRecons.length === 0 ? true : false;

  const cashShortage = filteredRecons.reduce((sum, item) => {
    const cashVariance =
      Number(item.cash_counted || 0) - Number(item.cash_expected || 0);

    return cashVariance < 0 ? sum + Math.abs(cashVariance) : sum;
  }, 0);

  const mpesaShortage = filteredRecons.reduce((sum, item) => {
    const mpesaVariance =
      Number(item.mpesa_confirmed || 0) - Number(item.mpesa_expected || 0);

    return mpesaVariance < 0 ? sum + Math.abs(mpesaVariance) : sum;
  }, 0);

  const insights = [
    unreconciled
      ? "🚨 Sales exist but payment reconciliation has not been completed."
      : "✅ Reconciliation records exist for this period.",
    totalVariance < 0
      ? `🔴 Total shortage detected: KES ${Math.abs(
          totalVariance
        ).toLocaleString()}.`
      : totalVariance > 0
      ? `🟡 Excess payment recorded: KES ${totalVariance.toLocaleString()}.`
      : "🟢 Payments match expected sales.",
    cashShortage > 0
      ? `⚠️ Cash shortage detected: KES ${cashShortage.toLocaleString()}.`
      : "✅ No cash shortage detected.",
    mpesaShortage > 0
      ? `⚠️ Mpesa shortage detected: KES ${mpesaShortage.toLocaleString()}.`
      : "✅ Mpesa payments look balanced.",
  ];

  function exportCSV() {
    const rows = [
      [
        "Date",
        "Cash Expected",
        "Cash Counted",
        "Mpesa Expected",
        "Mpesa Confirmed",
        "Card Expected",
        "Card Confirmed",
        "Variance",
        "Notes",
      ],
      ...filteredRecons.map((item) => [
        item.business_date,
        item.cash_expected,
        item.cash_counted,
        item.mpesa_expected,
        item.mpesa_confirmed,
        item.card_expected,
        item.card_confirmed,
        item.variance,
        item.notes || "",
      ]),
    ];

    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "karamela-reconciliation-report.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[#080604] p-8 text-white">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-[#d08a35]">
            Owner Reconciliation
          </p>

          <h1 className="mt-3 text-5xl font-bold">
            Payment Control Dashboard
          </h1>

          <p className="mt-3 text-zinc-400">
            Review cash, Mpesa, card payments, shortages, excesses and daily
            reconciliation status.
          </p>
        </div>

        <div className="flex gap-3">
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

          <button
            onClick={exportCSV}
            className="rounded-2xl bg-[#d08a35] px-5 py-3 font-bold text-black hover:bg-[#e9a34c]"
          >
            Export CSV
          </button>
        </div>
      </div>

      <section className="mt-8 grid gap-5 md:grid-cols-4">
        <Card
          title="Expected Sales"
          value={`KES ${totalExpected.toLocaleString()}`}
        />
        <Card
          title="Counted Payments"
          value={`KES ${totalCounted.toLocaleString()}`}
        />
        <Card
          title="Variance"
          value={`KES ${totalVariance.toLocaleString()}`}
        />
        <Card title="Reconciliations" value={filteredRecons.length.toString()} />
      </section>

      <section className="mt-8 grid gap-5 md:grid-cols-3">
        <PaymentCard title="Cash Expected" amount={expectedByPayment.cash} />
        <PaymentCard title="Mpesa Expected" amount={expectedByPayment.mpesa} />
        <PaymentCard title="Card Expected" amount={expectedByPayment.card} />
      </section>

      <section className="mt-8 rounded-[2rem] border border-[#d08a35]/20 bg-white/5 p-6">
        <h2 className="text-2xl font-bold text-[#d08a35]">
          Alerts & Business Insights
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
            Reconciliation History
          </h2>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-white/10 text-zinc-300">
            <tr>
              <th className="p-4">Date</th>
              <th className="p-4">Cash</th>
              <th className="p-4">Mpesa</th>
              <th className="p-4">Card</th>
              <th className="p-4">Variance</th>
              <th className="p-4">Notes</th>
            </tr>
          </thead>

          <tbody>
            {filteredRecons.map((item) => (
              <tr key={item.id} className="border-t border-white/10">
                <td className="p-4">{item.business_date}</td>

                <td className="p-4">
                  KES {item.cash_counted || 0} / {item.cash_expected || 0}
                </td>

                <td className="p-4">
                  KES {item.mpesa_confirmed || 0} /{" "}
                  {item.mpesa_expected || 0}
                </td>

                <td className="p-4">
                  KES {item.card_confirmed || 0} / {item.card_expected || 0}
                </td>

                <td
                  className={`p-4 font-bold ${
                    Number(item.variance || 0) < 0
                      ? "text-red-300"
                      : Number(item.variance || 0) > 0
                      ? "text-yellow-300"
                      : "text-green-300"
                  }`}
                >
                  KES {item.variance || 0}
                </td>

                <td className="p-4 text-zinc-400">{item.notes || "-"}</td>
              </tr>
            ))}

            {filteredRecons.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-zinc-500">
                  No reconciliation records found.
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
      <p className="text-sm text-zinc-400">{title}</p>
      <p className="mt-3 text-3xl font-bold text-white">
        KES {amount.toLocaleString()}
      </p>
    </div>
  );
}