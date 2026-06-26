export type DashboardPeriod = "today" | "7days" | "30days" | "all";

export const DASHBOARD_PERIOD_OPTIONS: Array<{
  label: string;
  value: DashboardPeriod;
}> = [
  { label: "Today", value: "today" },
  { label: "Last 7 Days", value: "7days" },
  { label: "Last 30 Days", value: "30days" },
  { label: "All Time", value: "all" },
];

export function getPeriodStartDate(period: DashboardPeriod) {
  const now = new Date();

  if (period === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  if (period === "7days") {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date;
  }

  if (period === "30days") {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date;
  }

  return new Date(0);
}

export function isDateWithinPeriod(
  value: string | Date,
  period: DashboardPeriod
) {
  return new Date(value) >= getPeriodStartDate(period);
}
