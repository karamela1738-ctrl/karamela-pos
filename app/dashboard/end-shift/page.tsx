"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearStoredStaffSession,
  getStoredStaffSession,
} from "@/lib/services/auth";
import { endShiftWorkflow } from "@/lib/services/workflows";

const END_SHIFT_CHECKLIST = [
  "Sales are completed",
  "Waste has been recorded",
  "Closing stock count is complete",
  "Cash reconciliation is done",
];

export default function EndShiftPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function endShift() {
    const staff = getStoredStaffSession();

    if (!staff?.id) {
      alert("Staff not found");
      return;
    }

    setLoading(true);

    try {
      await endShiftWorkflow(staff.id);

      clearStoredStaffSession();
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080604] p-8 text-white">
      <div className="w-full max-w-xl rounded-[2rem] border border-[#d08a35]/20 bg-white/5 p-10 backdrop-blur-xl">
        <h1 className="text-4xl font-bold text-[#d08a35]">End Shift</h1>

        <p className="mt-4 text-zinc-400">
          This will close the current shift, save activity records and log you
          out of the POS.
        </p>

        <div className="mt-8 rounded-2xl border border-red-500/20 bg-red-500/10 p-5">
          <p className="font-semibold text-red-300">
            Before ending shift ensure:
          </p>

          <ul className="mt-3 space-y-2 text-sm text-zinc-300">
            {END_SHIFT_CHECKLIST.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          onClick={endShift}
          disabled={loading}
          className="mt-8 w-full rounded-2xl bg-red-500 py-4 font-bold text-white hover:bg-red-600"
        >
          {loading ? "Ending Shift..." : "End Shift & Logout"}
        </button>
      </div>
    </main>
  );
}
