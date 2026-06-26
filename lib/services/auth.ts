import { supabase } from "@/lib/supabase/client";

export const STAFF_SESSION_KEY = "karamela_staff_session";
const LEGACY_STAFF_KEY = "karamela_staff";

export type StaffRole = "admin" | "manager" | "staff";

export type StaffSession = {
  id: string;
  full_name: string;
  role: StaffRole;
};

type StaffRecord = Partial<StaffSession> & {
  pin_code?: string;
  role?: string;
};

export async function loginWithPin(pin: string) {
  const normalizedPin = pin.trim();

  const { data, error } = await supabase
    .from("staff")
    .select("id, full_name, role")
    .eq("pin_code", normalizedPin)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const session = normalizeStaffSession(data as StaffRecord);

  if (!session) {
    throw new Error("Staff record is missing required access fields.");
  }

  persistStaffSession(session);

  return session;
}

export function persistStaffSession(session: StaffSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(session));
  window.localStorage.setItem(LEGACY_STAFF_KEY, JSON.stringify(session));
}

export function getStoredStaffSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSession =
    window.localStorage.getItem(STAFF_SESSION_KEY) ||
    window.localStorage.getItem(LEGACY_STAFF_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawSession) as Partial<StaffRecord>;
    const session = normalizeStaffSession(parsed);

    if (!session) {
      clearStoredStaffSession();
      return null;
    }

    if (!window.localStorage.getItem(STAFF_SESSION_KEY)) {
      persistStaffSession(session);
    }

    return session;
  } catch {
    clearStoredStaffSession();
    return null;
  }
}

export function clearStoredStaffSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STAFF_SESSION_KEY);
  window.localStorage.removeItem(LEGACY_STAFF_KEY);
}

export function getDefaultDashboardPath(role: StaffRole) {
  return role === "staff" ? "/dashboard/staff" : "/dashboard/manager";
}

export function canAccessDashboardPath(
  role: StaffRole,
  pathname: string
) {
  if (role === "admin" || role === "manager") {
    return true;
  }

  const staffAllowedPaths = new Set([
    "/dashboard/staff",
    "/dashboard/pos",
    "/dashboard/waste",
    "/dashboard/closing-stock",
    "/dashboard/reconciliation",
    "/dashboard/inventory",
    "/dashboard/end-shift",
    "/dashboard/receipt",
  ]);

  return staffAllowedPaths.has(pathname);
}

function normalizeStaffSession(data: Partial<StaffRecord> | null | undefined) {
  const normalizedRole = normalizeStaffRole(data?.role);
  const fullName = typeof data?.full_name === "string" ? data.full_name.trim() : "";
  const normalizedId =
    typeof data?.id === "string" || typeof data?.id === "number"
      ? String(data.id).trim()
      : "";

  if (!normalizedId) {
    return null;
  }

  return {
    id: normalizedId,
    full_name: fullName || "Staff",
    role: normalizedRole || "staff",
  };
}

function isStaffRole(role: unknown): role is StaffRole {
  return role === "admin" || role === "manager" || role === "staff";
}

function normalizeStaffRole(role: unknown): StaffRole | null {
  if (typeof role !== "string") {
    return "staff";
  }

  const normalized = role.trim().toLowerCase();

  if (!normalized) {
    return "staff";
  }

  if (normalized === "owner") {
    return "manager";
  }

  if (normalized === "cashier" || normalized === "attendant") {
    return "staff";
  }

  return isStaffRole(normalized) ? normalized : "staff";
}
