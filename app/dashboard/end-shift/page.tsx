"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getStoredStaffSession,
  logoutStaffSession,
} from "@/lib/services/auth";
import { getBusinessDayStatus, type BusinessDayStatus } from "@/lib/services/operations";
import { endShiftWorkflow } from "@/lib/services/workflows";
import { formatDate } from "@/lib/utils/format";

export default function EndShiftPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<BusinessDayStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  async function loadStatus() {
    setStatusLoading(true);

    try {
      setStatus(await getBusinessDayStatus());
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unable to load shift status right now."
      );
    } finally {
      setStatusLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function endShift() {
    const staff = getStoredStaffSession();

    if (!staff?.id) {
      alert("Staff not found");
      return;
    }

    if (!status?.can_end_shift) {
      alert("Complete closing stock and reconciliation before ending shift.");
      return;
    }

    setLoading(true);

    try {
      await endShiftWorkflow();

      await logoutStaffSession();
      alert("Shift ended successfully");
      router.push("/login");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unable to end shift right now."
      );
    } finally {
      setLoading(false);
    }
  }

  const checklist = [
    {
      label: "Closing stock count is complete",
      done: Boolean(status?.closing_stock_complete),
      detail: status
        ? `${status.counted_products} of ${status.total_products} products counted`
        : "Checking product counts",
    },
    {
      label: "Payment reconciliation is done",
      done: Boolean(status?.reconciliation_complete),
      detail: status?.reconciliation_complete
        ? "Reconciliation saved for this business day"
        : "No reconciliation saved yet",
    },
  ];

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080604] p-8 text-white">
      <div className="w-full max-w-xl rounded-[2rem] border border-[#d08a35]/20 bg-white/5 p-10 backdrop-blur-xl">
        <h1 className="text-4xl font-bold text-[#d08a35]">End Shift</h1>

        <p className="mt-4 text-zinc-400">
          This will close the current shift, save activity records and log you
          out of the POS.
        </p>

        <div className="mt-6 rounded-2xl border border-[#d08a35]/20 bg-black/30 p-5">
          <p className="text-sm uppercase tracking-[0.25em] text-[#d08a35]">
            Business Date
          </p>
          <p className="mt-2 text-2xl font-bold">
            {status?.business_date ? formatDate(status.business_date) : "--"}
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            All end-of-day checks must be completed for this date before shift
            closure is allowed.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-red-500/20 bg-red-500/10 p-5">
          <p className="font-semibold text-red-300">
            Shift closure requirements:
          </p>

          <ul className="mt-3 space-y-2 text-sm text-zinc-300">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-start justify-between gap-4">
                <span>{item.label}</span>
                <span
                  className={
                    item.done ? "text-green-300" : "text-amber-200"
                  }
                >
                  {statusLoading ? "Checking..." : item.done ? "Done" : item.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          onClick={endShift}
          disabled={loading || statusLoading || !status?.can_end_shift}
          className="mt-8 w-full rounded-2xl bg-red-500 py-4 font-bold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Ending Shift..." : "End Shift & Logout"}
        </button>
      </div>
    </main>
  );
}
