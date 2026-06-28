"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DashboardMetricCard,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/dashboard/ui";
import {
  validateStoredStaffSession,
  type StaffRole,
  type StaffSession,
} from "@/lib/services/auth";
import { getProducts } from "@/lib/services/inventory";
import { getOwnerDashboardSnapshot } from "@/lib/services/operations";
import { getMainStall } from "@/lib/services/stalls";
import { supabase } from "@/lib/supabase/client";
import { subscribeDashboardRefresh } from "@/lib/utils/dashboard-refresh";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
} from "@/lib/utils/format";

type AdminBusinessSetup = {
  stall_id: string;
  business_name: string;
  stall_name: string;
  owner_name: string;
  contact_phone: string;
  receipt_footer: string;
};

type AdminStaffRow = {
  id: string;
  full_name: string;
  role: StaffRole;
  active: boolean;
  stall_id: string | null;
};

type LicenseInfo = {
  id: string;
  business_name: string;
  license_type: string;
  status: string;
  start_date: string;
  expiry_date: string | null;
  max_devices: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type SystemOverview = {
  totalProducts: number;
  totalStaff: number;
  salesToday: number;
  wasteToday: number;
  lastSaleTime: string | null;
  appVersion: string;
};

type BusinessSetupForm = {
  business_name: string;
  stall_name: string;
  owner_name: string;
  contact_phone: string;
  receipt_footer: string;
};

type StaffFormState = {
  full_name: string;
  role: AdminEditableRole;
  active: boolean;
  pin_code: string;
};

type ConnectionStatus = "connected" | "error" | "checking";
type AdminEditableRole = "admin" | "owner" | "staff";

const ROLE_OPTIONS: AdminEditableRole[] = ["admin", "owner", "staff"];
const EMPTY_BUSINESS_FORM: BusinessSetupForm = {
  business_name: "",
  stall_name: "",
  owner_name: "",
  contact_phone: "",
  receipt_footer: "",
};
const EMPTY_STAFF_FORM: StaffFormState = {
  full_name: "",
  role: "staff",
  active: true,
  pin_code: "",
};
const APP_VERSION = "0.1.0";
const BACKUP_EXPORTS = [
  { label: "Products CSV", table: "products", fileName: "karamela-products.csv" },
  { label: "Sales CSV", table: "sales", fileName: "karamela-sales.csv" },
  { label: "Sale Items CSV", table: "sale_items", fileName: "karamela-sale-items.csv" },
  { label: "Waste Logs CSV", table: "waste_logs", fileName: "karamela-waste-logs.csv" },
  {
    label: "Closing Stock CSV",
    table: "closing_stock_counts",
    fileName: "karamela-closing-stock-counts.csv",
  },
  {
    label: "Reconciliation CSV",
    table: "payment_reconciliations",
    fileName: "karamela-payment-reconciliations.csv",
  },
  { label: "Staff CSV", table: "staff", fileName: "karamela-staff.csv" },
] as const;

export default function AdminControlCenterPage() {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [accessChecked, setAccessChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("checking");
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [stallId, setStallId] = useState<string>("");
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [businessSetup, setBusinessSetup] = useState<AdminBusinessSetup | null>(
    null
  );
  const [businessForm, setBusinessForm] =
    useState<BusinessSetupForm>(EMPTY_BUSINESS_FORM);
  const [staffRows, setStaffRows] = useState<AdminStaffRow[]>([]);
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState<StaffFormState>(EMPTY_STAFF_FORM);
  const [staffPinReset, setStaffPinReset] = useState("");
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);
  const [exportingTable, setExportingTable] = useState<string | null>(null);

  const isAdmin = session?.role === "admin";
  const selectedStaff = useMemo(
    () => staffRows.find((staff) => staff.id === selectedStaffId) || null,
    [staffRows, selectedStaffId]
  );
  const activeStaffCount = useMemo(
    () => staffRows.filter((staff) => staff.active).length,
    [staffRows]
  );
  const inactiveStaffCount = staffRows.length - activeStaffCount;

  const loadAdminData = useCallback(async () => {
    setLoading(true);

    try {
      const stall = await getMainStall();
      const [products, snapshot, setup, staff, licenseInfo, latestSaleTime] =
        await Promise.all([
          getProducts(),
          getOwnerDashboardSnapshot(),
          fetchBusinessSetup(stall.id),
          fetchStaffRows(stall.id),
          fetchLicenseInfo(),
          fetchLastSaleTime(stall.id),
        ]);

      setStallId(stall.id);
      setBusinessSetup(setup);
      setBusinessForm(toBusinessForm(setup));
      setStaffRows(staff);
      setLicense(licenseInfo);
      setOverview({
        totalProducts: products.length,
        totalStaff: staff.length,
        salesToday: snapshot.today_sales,
        wasteToday: snapshot.today_waste,
        lastSaleTime: latestSaleTime,
        appVersion: APP_VERSION,
      });
      setConnectionStatus("connected");
      setLastRefreshAt(new Date().toISOString());
      setError(null);
    } catch (loadError) {
      console.error(loadError);
      setConnectionStatus("error");
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load admin control center."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      const nextSession = await validateStoredStaffSession();
      setSession(nextSession);

      if (nextSession?.role === "admin") {
        await loadAdminData();
      }
    } catch (loadError) {
      console.error(loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load admin control center."
      );
      setConnectionStatus("error");
    } finally {
      setAccessChecked(true);
    }
  }, [loadAdminData]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void bootstrap();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [bootstrap]);

  useEffect(() => {
    return subscribeDashboardRefresh(() => {
      if (isAdmin) {
        void loadAdminData();
      }
    });
  }, [isAdmin, loadAdminData]);

  function startCreateStaff() {
    setSelectedStaffId(null);
    setStaffForm(EMPTY_STAFF_FORM);
    setStaffPinReset("");
  }

  function startEditStaff(staff: AdminStaffRow) {
    setSelectedStaffId(staff.id);
    setStaffForm({
      full_name: staff.full_name,
      role: normalizeAdminEditableRole(staff.role),
      active: staff.active,
      pin_code: "",
    });
    setStaffPinReset("");
  }

  async function saveBusinessSetup(event: React.FormEvent) {
    event.preventDefault();

    if (!businessSetup) {
      return;
    }

    setSavingBusiness(true);

    try {
      const payload = normalizeBusinessForm(businessForm);
      const nowIso = new Date().toISOString();

      const { error: updateError } = await supabase
        .from("stalls")
        .update({
          name: payload.stall_name,
          business_name: payload.business_name,
          owner_name: payload.owner_name,
          contact_phone: payload.contact_phone,
          receipt_footer: payload.receipt_footer,
          updated_at: nowIso,
        })
        .eq("id", businessSetup.stall_id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      const updatedSetup: AdminBusinessSetup = {
        stall_id: businessSetup.stall_id,
        ...payload,
      };

      setBusinessSetup(updatedSetup);
      setBusinessForm(toBusinessForm(updatedSetup));
      await refreshLicenseBusinessName(payload.business_name);
      alert("Business setup saved successfully");
      await loadAdminData();
    } catch (saveError) {
      alert(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save business setup right now."
      );
    } finally {
      setSavingBusiness(false);
    }
  }

  async function saveStaff(event: React.FormEvent) {
    event.preventDefault();

    if (!stallId) {
      alert("Could not find stall");
      return;
    }

    setSavingStaff(true);

    try {
      const payload = normalizeStaffForm(staffForm);

      if (selectedStaffId) {
        const { error: updateError } = await supabase
          .from("staff")
          .update({
            full_name: payload.full_name,
            role: payload.role,
            active: payload.active,
            stall_id: stallId,
          })
          .eq("id", selectedStaffId);

        if (updateError) {
          throw new Error(updateError.message);
        }

        alert("Staff updated successfully");
      } else {
        const pinCode = requirePinCode(staffForm.pin_code);
        const { error: insertError } = await supabase.from("staff").insert({
          full_name: payload.full_name,
          role: payload.role,
          active: payload.active,
          stall_id: stallId,
          pin_code: pinCode,
        });

        if (insertError) {
          throw new Error(insertError.message);
        }

        alert("Staff added successfully");
      }

      startCreateStaff();
      await loadAdminData();
    } catch (saveError) {
      alert(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save staff right now."
      );
    } finally {
      setSavingStaff(false);
    }
  }

  async function resetStaffPin() {
    if (!selectedStaffId) {
      alert("Select a staff member first");
      return;
    }

    setSavingStaff(true);

    try {
      const nextPinCode = requirePinCode(staffPinReset);
      const { error: updateError } = await supabase
        .from("staff")
        .update({ pin_code: nextPinCode })
        .eq("id", selectedStaffId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setStaffPinReset("");
      alert("PIN reset successfully");
    } catch (resetError) {
      alert(
        resetError instanceof Error
          ? resetError.message
          : "Unable to reset the PIN right now."
      );
    } finally {
      setSavingStaff(false);
    }
  }

  async function exportTable(tableName: (typeof BACKUP_EXPORTS)[number]["table"]) {
    setExportingTable(tableName);

    try {
      const rows = await fetchBackupRows(tableName);

      if (rows.length === 0) {
        alert(`No rows found in ${tableName}.`);
        return;
      }

      const config = BACKUP_EXPORTS.find((item) => item.table === tableName);

      if (!config) {
        throw new Error("Backup configuration not found.");
      }

      downloadCsv(config.fileName, rows);
    } catch (exportError) {
      alert(
        exportError instanceof Error
          ? exportError.message
          : `Unable to export ${tableName} right now.`
      );
    } finally {
      setExportingTable(null);
    }
  }

  if (!accessChecked) {
    return (
      <main className="dashboard-page-shell-centered text-zinc-300">
        Checking admin access...
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="dashboard-page-shell">
        <div className="dashboard-width py-8">
          <div className="rounded-[2rem] border border-amber-500/30 bg-amber-500/10 p-6 text-amber-100">
            You do not have permission to access Admin Control Center.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-page-shell overflow-hidden bg-[#070503]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#8f5416_0%,transparent_34%),radial-gradient(circle_at_bottom_right,#2f1506_0%,transparent_42%)] opacity-70" />

      <section className="dashboard-width relative py-2 sm:py-4">
        {error && (
          <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
            {error}
          </div>
        )}

        <DashboardPageHeader
          eyebrow="Developer Console"
          title="Admin Control Center"
          description="Developer-only controls for business setup, user management, licensing, backups and system health."
          actions={
            <button
              type="button"
              onClick={() => void loadAdminData()}
              disabled={loading}
              className="w-full rounded-2xl bg-[#d08a35] px-5 py-3 font-bold text-black hover:bg-[#e9a34c] disabled:opacity-60 sm:w-auto"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          }
        />

        <section className="mt-8">
          <h2 className="text-2xl font-bold text-[#d08a35]">System Overview</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            <DashboardMetricCard
              title="Total Products"
              value={loading ? "..." : String(overview?.totalProducts || 0)}
            />
            <DashboardMetricCard
              title="Total Staff"
              value={loading ? "..." : String(overview?.totalStaff || 0)}
            />
            <DashboardMetricCard
              title="Sales Today"
              value={loading ? "..." : formatCurrency(overview?.salesToday)}
            />
            <DashboardMetricCard
              title="Waste Today"
              value={loading ? "..." : formatCurrency(overview?.wasteToday)}
            />
            <DashboardMetricCard
              title="Last Sale Time"
              value={
                loading
                  ? "..."
                  : overview?.lastSaleTime
                    ? formatDateTime(overview.lastSaleTime)
                    : "No sales"
              }
              valueClassName="mt-2 text-lg font-bold sm:mt-3 sm:text-xl"
            />
            <DashboardMetricCard
              title="App Version"
              value={loading ? "..." : `v${overview?.appVersion || APP_VERSION}`}
            />
          </div>
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <DashboardPanel title="Business Setup" contentClassName="mt-6">
            <form onSubmit={saveBusinessSetup} className="grid gap-4">
              <FieldLabel label="Business name">
                <input
                  value={businessForm.business_name}
                  onChange={(event) =>
                    setBusinessForm((current) => ({
                      ...current,
                      business_name: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none"
                  disabled={savingBusiness}
                />
              </FieldLabel>

              <FieldLabel label="Stall name">
                <input
                  value={businessForm.stall_name}
                  onChange={(event) =>
                    setBusinessForm((current) => ({
                      ...current,
                      stall_name: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none"
                  disabled={savingBusiness}
                />
              </FieldLabel>

              <div className="grid gap-4 md:grid-cols-2">
                <FieldLabel label="Owner name">
                  <input
                    value={businessForm.owner_name}
                    onChange={(event) =>
                      setBusinessForm((current) => ({
                        ...current,
                        owner_name: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none"
                    disabled={savingBusiness}
                  />
                </FieldLabel>

                <FieldLabel label="Contact phone">
                  <input
                    value={businessForm.contact_phone}
                    onChange={(event) =>
                      setBusinessForm((current) => ({
                        ...current,
                        contact_phone: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none"
                    disabled={savingBusiness}
                  />
                </FieldLabel>
              </div>

              <FieldLabel label="Receipt footer">
                <textarea
                  value={businessForm.receipt_footer}
                  onChange={(event) =>
                    setBusinessForm((current) => ({
                      ...current,
                      receipt_footer: event.target.value,
                    }))
                  }
                  className="mt-2 min-h-28 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none"
                  disabled={savingBusiness}
                />
              </FieldLabel>

              <button
                type="submit"
                disabled={savingBusiness}
                className="rounded-2xl bg-[#d08a35] px-5 py-4 font-bold text-black hover:bg-[#e9a34c] disabled:opacity-60"
              >
                {savingBusiness ? "Saving Setup..." : "Save Business Setup"}
              </button>
            </form>
          </DashboardPanel>

          <div className="grid gap-6">
            <DashboardPanel title="License Info" contentClassName="mt-5 space-y-3">
              {license ? (
                <>
                  <AdminInfoRow label="Business" value={license.business_name || "-"} />
                  <AdminInfoRow label="Type" value={license.license_type} />
                  <AdminInfoRow label="Status" value={license.status} />
                  <AdminInfoRow label="Start date" value={formatDate(license.start_date)} />
                  <AdminInfoRow
                    label="Expiry date"
                    value={license.expiry_date ? formatDate(license.expiry_date) : "No expiry"}
                  />
                  <AdminInfoRow
                    label="Max devices"
                    value={String(license.max_devices)}
                  />
                  <AdminInfoRow label="Notes" value={license.notes || "-"} />
                </>
              ) : (
                <p className="text-zinc-500">No license information found.</p>
              )}
            </DashboardPanel>

            <DashboardPanel title="System Status" contentClassName="mt-5 space-y-3">
              <AdminInfoRow
                label="Supabase"
                value={
                  connectionStatus === "connected"
                    ? "Connected"
                    : connectionStatus === "error"
                      ? "Error"
                      : "Checking..."
                }
              />
              <AdminInfoRow
                label="Last refresh"
                value={lastRefreshAt ? formatDateTime(lastRefreshAt) : "Not refreshed yet"}
              />
              <AdminInfoRow label="Active staff" value={String(activeStaffCount)} />
              <AdminInfoRow label="Inactive staff" value={String(inactiveStaffCount)} />
            </DashboardPanel>
          </div>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <DashboardPanel title="User Management" contentClassName="mt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-300">
                Only admin users can add staff, change roles, deactivate users, or reset PINs.
              </div>

              <button
                type="button"
                onClick={startCreateStaff}
                className="rounded-2xl bg-[#d08a35] px-5 py-3 font-semibold text-black hover:bg-[#e9a34c]"
              >
                Add Staff
              </button>
            </div>

            <div className="dashboard-table-shell mt-6 rounded-3xl border border-white/10">
              <table className="dashboard-data-table w-full text-left text-sm">
                <thead className="bg-white/10 text-zinc-300">
                  <tr>
                    <th className="p-4">Name</th>
                    <th className="p-4">Role</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {staffRows.map((staff) => (
                    <tr
                      key={staff.id}
                      className={`border-t border-white/10 ${
                        selectedStaffId === staff.id ? "bg-[#d08a35]/10" : ""
                      }`}
                    >
                      <td className="p-4">
                        <div className="font-medium">{staff.full_name}</div>
                        <div className="mt-1 text-xs text-zinc-500">{staff.id}</div>
                      </td>
                      <td className="p-4 uppercase text-[#d08a35]">{staff.role}</td>
                      <td className="p-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            staff.active
                              ? "bg-green-500/20 text-green-300"
                              : "bg-red-500/20 text-red-300"
                          }`}
                        >
                          {staff.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="p-4">
                        <button
                          type="button"
                          onClick={() => startEditStaff(staff)}
                          className="text-[#d08a35] hover:text-[#e9a34c]"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}

                  {!loading && staffRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-zinc-500">
                        No staff users found.
                      </td>
                    </tr>
                  )}

                  {loading && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-zinc-500">
                        Loading staff users...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </DashboardPanel>

          <DashboardPanel
            title={selectedStaff ? "Edit Staff" : "Add Staff"}
            contentClassName="mt-6"
          >
            <form onSubmit={saveStaff} className="grid gap-4">
              <FieldLabel label="Full name">
                <input
                  value={staffForm.full_name}
                  onChange={(event) =>
                    setStaffForm((current) => ({
                      ...current,
                      full_name: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none"
                  disabled={savingStaff}
                />
              </FieldLabel>

              <FieldLabel label="Role">
                <select
                  value={staffForm.role}
                  onChange={(event) =>
                    setStaffForm((current) => ({
                      ...current,
                      role: event.target.value as AdminEditableRole,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none"
                  disabled={savingStaff}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </FieldLabel>

              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={staffForm.active}
                  onChange={(event) =>
                    setStaffForm((current) => ({
                      ...current,
                      active: event.target.checked,
                    }))
                  }
                  disabled={savingStaff}
                />
                Staff account is active
              </label>

              {!selectedStaff && (
                <FieldLabel label="PIN (6 digits)">
                  <input
                    value={staffForm.pin_code}
                    onChange={(event) =>
                      setStaffForm((current) => ({
                        ...current,
                        pin_code: event.target.value,
                      }))
                    }
                    inputMode="numeric"
                    maxLength={6}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none"
                    disabled={savingStaff}
                  />
                </FieldLabel>
              )}

              <button
                type="submit"
                disabled={savingStaff}
                className="rounded-2xl bg-[#d08a35] px-5 py-4 font-bold text-black hover:bg-[#e9a34c] disabled:opacity-60"
              >
                {savingStaff
                  ? selectedStaff
                    ? "Saving Staff..."
                    : "Creating Staff..."
                  : selectedStaff
                    ? "Save Staff Changes"
                    : "Create Staff"}
              </button>
            </form>

            {selectedStaff && (
              <div className="mt-6 border-t border-white/10 pt-6">
                <h3 className="text-lg font-semibold text-[#d08a35]">Reset PIN</h3>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <input
                    value={staffPinReset}
                    onChange={(event) => setStaffPinReset(event.target.value)}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Enter new 6-digit PIN"
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none"
                    disabled={savingStaff}
                  />
                  <button
                    type="button"
                    onClick={() => void resetStaffPin()}
                    disabled={savingStaff}
                    className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                  >
                    Reset PIN
                  </button>
                </div>
              </div>
            )}
          </DashboardPanel>
        </div>

        <section className="mt-8">
          <h2 className="text-2xl font-bold text-[#d08a35]">Backup Export</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {BACKUP_EXPORTS.map((backup) => (
              <button
                key={backup.table}
                type="button"
                onClick={() => void exportTable(backup.table)}
                disabled={exportingTable !== null}
                className="rounded-[1.5rem] border border-[#d08a35]/20 bg-black/30 p-5 text-left transition hover:border-[#d08a35]/60 hover:bg-[#d08a35]/10 disabled:opacity-60"
              >
                <div className="text-lg font-bold text-[#d08a35]">
                  {backup.label}
                </div>
                <div className="mt-2 text-sm text-zinc-400">
                  {exportingTable === backup.table
                    ? "Preparing export..."
                    : `Export ${backup.table} as CSV`}
                </div>
              </button>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function AdminInfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-white/10 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-zinc-400">{label}</span>
      <span className="font-medium text-zinc-200">{value}</span>
    </div>
  );
}

async function fetchBusinessSetup(stallId: string): Promise<AdminBusinessSetup> {
  const { data, error } = await supabase
    .from("stalls")
    .select("id, name, business_name, owner_name, contact_phone, receipt_footer")
    .eq("id", stallId)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  const stall = data?.[0];

  if (!stall) {
    throw new Error("Business setup could not be found.");
  }

  return {
    stall_id: stall.id,
    business_name: normalizeNullableString(stall.business_name) || stall.name || "",
    stall_name: normalizeNullableString(stall.name) || "Main Stall",
    owner_name: normalizeNullableString(stall.owner_name) || "",
    contact_phone: normalizeNullableString(stall.contact_phone) || "",
    receipt_footer:
      normalizeNullableString(stall.receipt_footer) ||
      "Thank you for shopping with us.",
  };
}

async function fetchStaffRows(stallId: string): Promise<AdminStaffRow[]> {
  const { data, error } = await supabase
    .from("staff")
    .select("id, full_name, role, active, stall_id")
    .eq("stall_id", stallId)
    .order("full_name");

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((staff) => ({
    id: String(staff.id),
    full_name: normalizeNullableString(staff.full_name) || "Staff",
    role: normalizeStaffRole(staff.role),
    active: staff.active !== false,
    stall_id:
      typeof staff.stall_id === "string" && staff.stall_id.trim()
        ? staff.stall_id
        : null,
  }));
}

async function fetchLicenseInfo(): Promise<LicenseInfo | null> {
  const { data, error } = await supabase
    .from("licenses")
    .select(
      "id, business_name, license_type, status, start_date, expiry_date, max_devices, notes, created_at, updated_at"
    )
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  const license = data?.[0];

  if (!license) {
    return null;
  }

  return {
    id: String(license.id),
    business_name: normalizeNullableString(license.business_name) || "",
    license_type: normalizeNullableString(license.license_type) || "lifetime",
    status: normalizeNullableString(license.status) || "active",
    start_date: String(license.start_date),
    expiry_date:
      typeof license.expiry_date === "string" && license.expiry_date.trim()
        ? license.expiry_date
        : null,
    max_devices: Number(license.max_devices || 0),
    notes: normalizeNullableString(license.notes),
    created_at: String(license.created_at),
    updated_at: String(license.updated_at),
  };
}

async function fetchLastSaleTime(stallId: string) {
  const { data, error } = await supabase
    .from("sales")
    .select("created_at")
    .eq("stall_id", stallId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  const latestSale = data?.[0];

  return typeof latestSale?.created_at === "string"
    ? latestSale.created_at
    : null;
}

async function refreshLicenseBusinessName(businessName: string) {
  const { data, error } = await supabase
    .from("licenses")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  const firstLicense = data?.[0];

  if (!firstLicense?.id) {
    return;
  }

  const { error: updateError } = await supabase
    .from("licenses")
    .update({
      business_name: businessName.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", firstLicense.id);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

async function fetchBackupRows(
  tableName: (typeof BACKUP_EXPORTS)[number]["table"]
) {
  if (tableName === "staff") {
    const { data, error } = await supabase
      .from("staff")
      .select("id, full_name, role, active, stall_id");

    if (error) {
      throw new Error(error.message);
    }

    return (data || []) as Array<Record<string, unknown>>;
  }

  const { data, error } = await supabase.from(tableName).select("*");

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as Array<Record<string, unknown>>;
}

function toBusinessForm(setup: AdminBusinessSetup): BusinessSetupForm {
  return {
    business_name: setup.business_name,
    stall_name: setup.stall_name,
    owner_name: setup.owner_name,
    contact_phone: setup.contact_phone,
    receipt_footer: setup.receipt_footer,
  };
}

function normalizeBusinessForm(form: BusinessSetupForm) {
  const businessName = form.business_name.trim();
  const stallName = form.stall_name.trim();

  if (!businessName) {
    throw new Error("Business name is required.");
  }

  if (!stallName) {
    throw new Error("Stall name is required.");
  }

  return {
    business_name: businessName,
    stall_name: stallName,
    owner_name: normalizeNullableString(form.owner_name) || "",
    contact_phone: normalizeNullableString(form.contact_phone) || "",
    receipt_footer:
      normalizeNullableString(form.receipt_footer) ||
      "Thank you for shopping with us.",
  };
}

function normalizeStaffForm(form: StaffFormState) {
  const fullName = form.full_name.trim();

  if (!fullName) {
    throw new Error("Staff name is required.");
  }

  return {
    full_name: fullName,
    role: form.role,
    active: form.active,
  };
}

function requirePinCode(value: string) {
  const pinCode = value.trim();

  if (!/^\d{6}$/.test(pinCode)) {
    throw new Error("PIN must be exactly 6 digits.");
  }

  return pinCode;
}

function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeStaffRole(value: unknown): StaffRole {
  if (value === "admin" || value === "owner" || value === "staff") {
    return value;
  }

  if (value === "manager" || value === "cashier") {
    return value;
  }

  return "staff";
}

function normalizeAdminEditableRole(value: StaffRole): AdminEditableRole {
  if (value === "admin" || value === "owner" || value === "staff") {
    return value;
  }

  return "staff";
}

function downloadCsv(fileName: string, rows: Array<Record<string, unknown>>) {
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>())
  );

  const csvRows = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => escapeCsvValue(row[header]))
        .join(",")
    ),
  ];

  const blob = new Blob([csvRows.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
}

function escapeCsvValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value).replace(/"/g, '""');
  return `"${stringValue}"`;
}
