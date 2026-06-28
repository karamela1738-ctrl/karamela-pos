import { supabase } from "@/lib/supabase/client";

export const STAFF_SESSION_KEY = "karamela_staff_session";
const LEGACY_STAFF_KEY = "karamela_staff";
const STAFF_DEVICE_KEY = "karamela_staff_device";

export type StaffRole =
  | "admin"
  | "owner"
  | "manager"
  | "staff"
  | "cashier";

export type StaffSession = {
  id: string;
  full_name: string;
  role: StaffRole;
  session_token: string;
  expires_at: string;
};

type StaffRecord = Partial<StaffSession> & {
  pin_code?: string;
  role?: string;
};

export async function loginWithPin(pin: string) {
  const normalizedPin = pin.trim();
  const { data, error } = await supabase.rpc("login_staff", {
    p_pin_code: normalizedPin,
    p_device_key: getOrCreateStaffDeviceKey(),
    p_user_agent: getBrowserUserAgent(),
  });

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

    if (!session || isSessionExpired(session.expires_at)) {
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

export async function validateStoredStaffSession() {
  const session = getStoredStaffSession();

  if (!session?.session_token) {
    clearStoredStaffSession();
    return null;
  }

  const { data, error } = await supabase.rpc("validate_staff_session", {
    p_session_token: session.session_token,
  });

  if (error) {
    clearStoredStaffSession();
    throw new Error(error.message);
  }

  const normalizedSession = normalizeStaffSession(data as Partial<StaffRecord>);

  if (!normalizedSession) {
    clearStoredStaffSession();
    return null;
  }

  persistStaffSession(normalizedSession);
  return normalizedSession;
}

export async function logoutStaffSession() {
  const session = getStoredStaffSession();

  try {
    if (session?.session_token) {
      const { error } = await supabase.rpc("logout_staff_session", {
        p_session_token: session.session_token,
      });

      if (error) {
        throw new Error(error.message);
      }
    }
  } finally {
    clearStoredStaffSession();
  }
}

export function getDefaultDashboardPath(role: StaffRole) {
  if (role === "admin") {
    return "/dashboard/admin";
  }

  return role === "staff" || role === "cashier"
    ? "/dashboard/staff"
    : "/dashboard/manager";
}

export function canAccessDashboardPath(
  role: StaffRole,
  pathname: string
) {
  if (role === "admin") {
    return pathname === "/dashboard/admin";
  }

  if (role === "owner" || role === "manager") {
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

  const sessionToken =
    typeof data?.session_token === "string" ? data.session_token.trim() : "";
  const expiresAt =
    typeof data?.expires_at === "string" ? data.expires_at.trim() : "";

  if (!sessionToken || !expiresAt) {
    return null;
  }

  return {
    id: normalizedId,
    full_name: fullName || "Staff",
    role: normalizedRole || "staff",
    session_token: sessionToken,
    expires_at: expiresAt,
  };
}

function isStaffRole(role: unknown): role is StaffRole {
  return (
    role === "admin" ||
    role === "owner" ||
    role === "manager" ||
    role === "staff" ||
    role === "cashier"
  );
}

function normalizeStaffRole(role: unknown): StaffRole | null {
  if (typeof role !== "string") {
    return "staff";
  }

  const normalized = role.trim().toLowerCase();

  if (!normalized) {
    return "staff";
  }

  if (normalized === "attendant") {
    return "cashier";
  }

  return isStaffRole(normalized) ? normalized : "staff";
}

function getOrCreateStaffDeviceKey() {
  if (typeof window === "undefined") {
    return "server-device";
  }

  const storedDeviceKey = window.localStorage.getItem(STAFF_DEVICE_KEY);

  if (storedDeviceKey) {
    return storedDeviceKey;
  }

  const deviceKey =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  window.localStorage.setItem(STAFF_DEVICE_KEY, deviceKey);
  return deviceKey;
}

function getBrowserUserAgent() {
  if (typeof navigator === "undefined") {
    return null;
  }

  return navigator.userAgent || null;
}

function isSessionExpired(expiresAt: string) {
  const sessionExpiry = new Date(expiresAt).getTime();

  if (Number.isNaN(sessionExpiry)) {
    return true;
  }

  return sessionExpiry <= Date.now();
}
