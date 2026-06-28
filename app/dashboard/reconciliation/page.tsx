"use client";

import { useEffect, useEffectEvent, useState } from "react";
import {
  DashboardMetricCard,
  DashboardPageHeader,
} from "@/components/dashboard/ui";
import {
  type StaffRole,
  validateStoredStaffSession,
} from "@/lib/services/auth";
import {
  getBusinessDayStatus,
  type BusinessDayStatus,
} from "@/lib/services/operations";
import { logDashboardQuery } from "@/lib/services/dashboard";
import { supabase } from "@/lib/supabase/client";
import { getMainStall } from "@/lib/services/stalls";
import { savePaymentReconciliationWorkflow } from "@/lib/services/workflows";
import {
  subscribeDashboardRefresh,
  triggerDashboardRefresh,
} from "@/lib/utils/dashboard-refresh";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { getBusinessDateRangeForDate } from "@/lib/utils/period";

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

const ALLOWED_RECONCILIATION_ROLES = new Set<StaffRole>([
  "admin",
  "owner",
  "manager",
  "staff",
  "cashier",
]);

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
  const [status, setStatus] = useState<BusinessDayStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function requireActiveReconciliationSession() {
    const session = await validateStoredStaffSession();

    if (!session) {
      throw new Error("Staff session has expired. Please sign in again.");
    }

    if (!ALLOWED_RECONCILIATION_ROLES.has(session.role)) {
      throw new Error("Your account cannot access payment reconciliation.");
    }

    return session;
  }

  async function loadTodaySales() {
    try {
      await requireActiveReconciliationSession();
      const currentStatus = await getBusinessDayStatus();
      setStatus(currentStatus);
      const stall = await getMainStall();

      if (!stall) {
        return;
      }

      const today = currentStatus.business_date;
      const dateRange = getBusinessDateRangeForDate(today);

      const { data, error } = await supabase
        .from("sales")
        .select("payment_method, total_amount, created_at")
        .eq("stall_id", stall.id)
        .gte("created_at", dateRange.start)
        .lt("created_at", dateRange.end);

      if (error) {
        throw new Error(error.message);
      }

      const summary = { cash: 0, mpesa: 0, card: 0 };

      data?.forEach((sale) => {
        const method = sale.payment_method as keyof SalesSummary;

        if (method === "cash" || method === "mpesa" || method === "card") {
          summary[method] += Number(sale.total_amount || 0);
        }
      });

      setSales(summary);
      setLoadError(null);

      logDashboardQuery("reconciliation-sales", {
        stall_id: stall.id,
        date_range: dateRange,
        row_count: (data || []).length,
      });
    } catch (error) {
      console.error(error);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to load reconciliation totals."
      );
    }
  }

  const runLoadTodaySales = useEffectEvent(() => {
    void loadTodaySales();
  });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      runLoadTodaySales();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    return subscribeDashboardRefresh(() => {
      runLoadTodaySales();
    });
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
    if (status?.reconciliation_complete) {
      alert("Reconciliation has already been saved for this business date.");
      return;
    }

    setLoading(true);

    try {
      await requireActiveReconciliationSession();
      const stall = await getMainStall();

      if (!stall) {
        alert("Could not find stall");
        return;
      }

      await savePaymentReconciliationWorkflow({
        stallId: stall.id,
        businessDate: status?.business_date || "",
        cashCounted: Number(amounts.cash || 0),
        mpesaConfirmed: Number(amounts.mpesa || 0),
        cardConfirmed: Number(amounts.card || 0),
        notes,
      });

      await loadTodaySales();
      triggerDashboardRefresh("reconciliation");
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
    <main className="dashboard-page-shell">
      <DashboardPageHeader
        title="Payment Reconciliation"
        description={`Compare expected sales against cash, Mpesa and card payments received.${status?.business_date ? ` Business date: ${formatDate(status.business_date)}.` : ""}`}
      />

      {loadError && (
        <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
          {loadError}
        </div>
      )}

      {status?.reconciliation_complete && (
        <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
          Reconciliation is already locked for this business date. Save-once is
          enforced to preserve audit integrity.
        </div>
      )}

      <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
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

      <section className="mt-8 grid gap-6 rounded-[2rem] border border-[#c47a2c]/20 bg-white/5 p-5 sm:p-6 md:grid-cols-3">
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
          disabled={loading || status?.reconciliation_complete}
          className="rounded-2xl bg-[#d08a35] px-5 py-4 font-bold text-black hover:bg-[#e9a34c] disabled:opacity-50 md:col-span-3"
        >
          {loading ? "Saving..." : "Save Reconciliation"}
        </button>
      </section>
    </main>
  );
}
