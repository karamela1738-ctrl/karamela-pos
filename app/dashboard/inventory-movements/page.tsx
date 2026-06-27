"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DashboardMetricCard,
  DashboardPageHeader,
  DashboardPeriodSelect,
} from "@/components/dashboard/ui";
import {
  getInventoryMovementsAudit,
  type InventoryMovementAuditItem,
} from "@/lib/services/operations";
import { formatDateTime } from "@/lib/utils/format";
import {
  isDateWithinPeriod,
  type DashboardPeriod,
} from "@/lib/utils/period";

export default function InventoryMovementsPage() {
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [movements, setMovements] = useState<InventoryMovementAuditItem[]>([]);

  async function loadMovements() {
    try {
      setMovements(await getInventoryMovementsAudit(200));
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    void loadMovements();
  }, []);

  const filteredMovements = useMemo(
    () =>
      movements.filter((movement) =>
        isDateWithinPeriod(movement.created_at, period)
      ),
    [movements, period]
  );

  const salesCount = filteredMovements.filter(
    (movement) => movement.movement_type === "sale"
  ).length;
  const wasteCount = filteredMovements.filter(
    (movement) => movement.movement_type === "waste"
  ).length;
  const restockCount = filteredMovements.filter(
    (movement) => movement.movement_type === "restock"
  ).length;
  const varianceCount = filteredMovements.filter(
    (movement) => movement.movement_type === "closing_variance"
  ).length;

  return (
    <main className="min-h-screen bg-[#080604] p-8 text-white">
      <DashboardPageHeader
        eyebrow="Audit Trail"
        title="Inventory Movements"
        description="Review every stock-affecting action with the product, quantity, actor and workflow notes."
        actions={<DashboardPeriodSelect value={period} onChange={setPeriod} />}
      />

      <section className="mt-8 grid gap-5 md:grid-cols-4">
        <DashboardMetricCard title="Sales Moves" value={String(salesCount)} />
        <DashboardMetricCard title="Restocks" value={String(restockCount)} />
        <DashboardMetricCard title="Waste Entries" value={String(wasteCount)} />
        <DashboardMetricCard title="Variances" value={String(varianceCount)} />
      </section>

      <section className="mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-2xl font-bold text-[#d08a35]">
            Movement Timeline
          </h2>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-white/10 text-zinc-300">
            <tr>
              <th className="p-4">Time</th>
              <th className="p-4">Type</th>
              <th className="p-4">Product</th>
              <th className="p-4">Quantity</th>
              <th className="p-4">Staff</th>
              <th className="p-4">Notes</th>
            </tr>
          </thead>

          <tbody>
            {filteredMovements.map((movement) => (
              <tr key={movement.movement_id} className="border-t border-white/10">
                <td className="p-4 text-zinc-400">
                  {formatDateTime(movement.created_at)}
                </td>
                <td className="p-4 font-semibold text-[#d08a35]">
                  {movement.movement_type}
                </td>
                <td className="p-4">{movement.product_name}</td>
                <td
                  className={`p-4 font-bold ${
                    movement.quantity < 0 ? "text-red-300" : "text-green-300"
                  }`}
                >
                  {movement.quantity}
                </td>
                <td className="p-4">{movement.staff_name}</td>
                <td className="p-4 text-zinc-300">{movement.notes || "-"}</td>
              </tr>
            ))}

            {filteredMovements.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-zinc-500">
                  No inventory movements found for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
