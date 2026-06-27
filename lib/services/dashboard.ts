import { getStoredStaffSession } from "@/lib/services/auth";
import { supabase } from "@/lib/supabase/client";

type NumericValue = number | string | null;

export type StaffDashboardSnapshot = {
  businessDate: string;
  todaySales: number;
  transactionCount: number;
  wasteLogged: number;
  totalWasteQuantity: number;
};

function toNumber(value: NumericValue) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }

  return 0;
}

function getRequiredSessionToken() {
  const session = getStoredStaffSession();

  if (!session?.session_token) {
    throw new Error("Staff session has expired. Please sign in again.");
  }

  return session.session_token;
}

function requireResultObject(value: unknown, rpcName: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${rpcName} returned an invalid response.`);
  }

  return value as Record<string, unknown>;
}

export function logDashboardQuery(
  context: string,
  payload: Record<string, unknown>
) {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[dashboard:${context}]`, payload);
  }
}

export async function getStaffDashboardSnapshot(stallId: string) {
  const normalizedStallId = stallId.trim();

  if (!normalizedStallId) {
    throw new Error("Could not find stall");
  }
  const sessionToken = getRequiredSessionToken();
  const { data, error } = await supabase.rpc("get_staff_dashboard_snapshot", {
    p_stall_id: normalizedStallId,
    p_session_token: sessionToken,
  });

  if (error) {
    throw new Error(error.message);
  }

  const result = requireResultObject(data, "get_staff_dashboard_snapshot");
  const businessDate =
    typeof result.business_date === "string" ? result.business_date : "";
  const todaySales = toNumber(
    (result.today_sales as NumericValue | undefined) ?? 0
  );
  const transactionCount = toNumber(
    (result.transaction_count as NumericValue | undefined) ?? 0
  );
  const wasteLogged = toNumber(
    (result.waste_logged as NumericValue | undefined) ?? 0
  );
  const totalWasteQuantity = toNumber(
    (result.total_waste_quantity as NumericValue | undefined) ?? 0
  );

  if (process.env.NODE_ENV !== "production") {
    console.log("[dashboard:staff-summary-rpc]", {
      stallId: normalizedStallId,
      businessDate,
      transactionCount,
      wasteLogged,
      totalWasteQuantity,
    });
  }

  logDashboardQuery("staff-summary", {
    stall_id: normalizedStallId,
    business_date: businessDate,
    transaction_count: transactionCount,
    waste_logged: wasteLogged,
    total_waste_quantity: totalWasteQuantity,
  });

  return {
    businessDate,
    todaySales,
    transactionCount,
    wasteLogged,
    totalWasteQuantity,
  } satisfies StaffDashboardSnapshot;
}
