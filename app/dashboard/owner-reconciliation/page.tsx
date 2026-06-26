"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DashboardInsightsSection,
  DashboardMetricCard,
  DashboardPageHeader,
  DashboardPeriodSelect,
} from "@/components/dashboard/ui";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/format";
import {
  isDateWithinPeriod,
  type DashboardPeriod,
} from "@/lib/utils/period";

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
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [period, setPeriod] = useState<DashboardPeriod>("today");

  async function loadData() {
    const [salesResponse, reconciliationResponse] = await Promise.all([
      supabase
        .from("sales")
        .select("id,total_amount,payment_method,created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("payment_reconciliations")
        .select("*")
        .order("business_date", { ascending: false }),
    ]);

    setSales(salesResponse.data || []);
    setReconciliations((reconciliationResponse.data || []) as Reconciliation[]);
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredSales = useMemo(
    () => sales.filter((sale) => isDateWithinPeriod(sale.created_at, period)),
    [sales, period]
  );

  const filteredReconciliations = useMemo(
    () =>
      reconciliations.filter((reconciliation) =>
        isDateWithinPeriod(reconciliation.business_date, period)
      ),
    [reconciliations, period]
  );

  const expectedByPayment = useMemo(
    () =>
      filteredSales.reduce(
        (totals, sale) => {
          const method = sale.payment_method || "cash";

          if (method === "cash") totals.cash += Number(sale.total_amount || 0);
          if (method === "mpesa") totals.mpesa += Number(sale.total_amount || 0);
          if (method === "card") totals.card += Number(sale.total_amount || 0);

          return totals;
        },
        { cash: 0, mpesa: 0, card: 0 }
      ),
    [filteredSales]
  );

  const totalExpected =
    expectedByPayment.cash + expectedByPayment.mpesa + expectedByPayment.card;

  const totalCounted = filteredReconciliations.reduce((sum, item) => {
    return (
      sum +
      Number(item.cash_counted || 0) +
      Number(item.mpesa_confirmed || 0) +
      Number(item.card_confirmed || 0)
    );
  }, 0);

  const totalVariance = totalCounted - totalExpected;
  const unreconciled =
    filteredSales.length > 0 && filteredReconciliations.length === 0;

  const cashShortage = filteredReconciliations.reduce((sum, item) => {
    const cashVariance =
      Number(item.cash_counted || 0) - Number(item.cash_expected || 0);

    return cashVariance < 0 ? sum + Math.abs(cashVariance) : sum;
  }, 0);

  const mpesaShortage = filteredReconciliations.reduce((sum, item) => {
    const mpesaVariance =
      Number(item.mpesa_confirmed || 0) - Number(item.mpesa_expected || 0);

    return mpesaVariance < 0 ? sum + Math.abs(mpesaVariance) : sum;
  }, 0);

  const insights = [
    unreconciled
      ? "Sales exist but payment reconciliation has not been completed."
      : "Reconciliation records exist for this period.",
    totalVariance < 0
      ? `Total shortage detected: ${formatCurrency(Math.abs(totalVariance))}.`
      : totalVariance > 0
        ? `Excess payment recorded: ${formatCurrency(totalVariance)}.`
        : "Payments match expected sales.",
    cashShortage > 0
      ? `Cash shortage detected: ${formatCurrency(cashShortage)}.`
      : "No cash shortage detected.",
    mpesaShortage > 0
      ? `Mpesa shortage detected: ${formatCurrency(mpesaShortage)}.`
      : "Mpesa payments look balanced.",
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
      ...filteredReconciliations.map((item) => [
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
      <DashboardPageHeader
        eyebrow="Owner Reconciliation"
        title="Payment Control Dashboard"
        description="Review cash, Mpesa, card payments, shortages, excesses and daily reconciliation status."
        actions={
          <div className="flex gap-3">
            <DashboardPeriodSelect value={period} onChange={setPeriod} />

            <button
              type="button"
              onClick={exportCSV}
              className="rounded-2xl bg-[#d08a35] px-5 py-3 font-bold text-black hover:bg-[#e9a34c]"
            >
              Export CSV
            </button>
          </div>
        }
      />

      <section className="mt-8 grid gap-5 md:grid-cols-4">
        <DashboardMetricCard
          title="Expected Sales"
          value={formatCurrency(totalExpected)}
        />
        <DashboardMetricCard
          title="Counted Payments"
          value={formatCurrency(totalCounted)}
        />
        <DashboardMetricCard
          title="Variance"
          value={formatCurrency(totalVariance)}
        />
        <DashboardMetricCard
          title="Reconciliations"
          value={filteredReconciliations.length.toString()}
        />
      </section>

      <section className="mt-8 grid gap-5 md:grid-cols-3">
        <DashboardMetricCard
          title="Cash Expected"
          value={formatCurrency(expectedByPayment.cash)}
          className="border-white/10 bg-black/30"
          accentClassName="text-white"
        />
        <DashboardMetricCard
          title="Mpesa Expected"
          value={formatCurrency(expectedByPayment.mpesa)}
          className="border-white/10 bg-black/30"
          accentClassName="text-white"
        />
        <DashboardMetricCard
          title="Card Expected"
          value={formatCurrency(expectedByPayment.card)}
          className="border-white/10 bg-black/30"
          accentClassName="text-white"
        />
      </section>

      <div className="mt-8">
        <DashboardInsightsSection
          title="Alerts & Business Insights"
          insights={insights}
        />
      </div>

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
            {filteredReconciliations.map((item) => (
              <tr key={item.id} className="border-t border-white/10">
                <td className="p-4">{item.business_date}</td>
                <td className="p-4">
                  {formatCurrency(item.cash_counted)} /{" "}
                  {formatCurrency(item.cash_expected)}
                </td>
                <td className="p-4">
                  {formatCurrency(item.mpesa_confirmed)} /{" "}
                  {formatCurrency(item.mpesa_expected)}
                </td>
                <td className="p-4">
                  {formatCurrency(item.card_confirmed)} /{" "}
                  {formatCurrency(item.card_expected)}
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
                  {formatCurrency(item.variance)}
                </td>
                <td className="p-4 text-zinc-400">{item.notes || "-"}</td>
              </tr>
            ))}

            {filteredReconciliations.length === 0 && (
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
