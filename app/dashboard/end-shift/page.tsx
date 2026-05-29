"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function EndShiftPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);

  async function endShift() {
    const staff = JSON.parse(
      localStorage.getItem("karamela_staff") || "{}"
    );

    if (!staff?.id) {
      alert("Staff not found");
      return;
    }

    setLoading(true);

    const { error } = await supabase
      .from("shift_logs")
      .insert({
        staff_id: staff.id,
        action: "shift_closed",
        created_at: new Date().toISOString(),
      });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    localStorage.removeItem("karamela_staff");

    alert("Shift ended successfully");

    router.push("/login");
  }

  return (
    <main className="min-h-screen bg-[#080604] flex items-center justify-center p-8 text-white">
      <div className="w-full max-w-xl rounded-[2rem] border border-[#d08a35]/20 bg-white/5 p-10 backdrop-blur-xl">
        <h1 className="text-4xl font-bold text-[#d08a35]">
          End Shift
        </h1>

        <p className="mt-4 text-zinc-400">
          This will close the current shift, save activity records
          and log you out of the POS.
        </p>

        <div className="mt-8 rounded-2xl border border-red-500/20 bg-red-500/10 p-5">
          <p className="font-semibold text-red-300">
            Before ending shift ensure:
          </p>

          <ul className="mt-3 space-y-2 text-sm text-zinc-300">
            <li>✓ Sales are completed</li>
            <li>✓ Waste has been recorded</li>
            <li>✓ Closing stock count is complete</li>
            <li>✓ Cash reconciliation is done</li>
          </ul>
        </div>

        <button
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