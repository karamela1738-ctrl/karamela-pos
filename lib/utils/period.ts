export type DashboardPeriod = "today" | "7days" | "30days" | "all";

const NAIROBI_TIME_ZONE = "Africa/Nairobi";
const NAIROBI_UTC_OFFSET = "+03:00";
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const DASHBOARD_PERIOD_OPTIONS: Array<{
  label: string;
  value: DashboardPeriod;
}> = [
  { label: "Today", value: "today" },
  { label: "Last 7 Days", value: "7days" },
  { label: "Last 30 Days", value: "30days" },
  { label: "All Time", value: "all" },
];

export type BusinessDateRange = {
  businessDate: string;
  start: string;
  end: string;
};

export type BusinessDatePeriodRange = {
  startBusinessDate: string;
  endBusinessDate: string;
};

function getNairobiDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: NAIROBI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Could not determine Africa/Nairobi business date.");
  }

  return { year, month, day };
}

function getRangeForBusinessDate(
  businessDate: string,
  dayOffset = 0,
  spanInDays = 1
) {
  const startAt = new Date(
    `${businessDate}T00:00:00.000${NAIROBI_UTC_OFFSET}`
  );
  const rangeStart = new Date(startAt.getTime() + dayOffset * DAY_IN_MS);
  const rangeEnd = new Date(rangeStart.getTime() + spanInDays * DAY_IN_MS);

  return {
    start: rangeStart.toISOString(),
    end: rangeEnd.toISOString(),
  };
}

export function getNairobiBusinessDate(date = new Date()) {
  const { year, month, day } = getNairobiDateParts(date);
  return `${year}-${month}-${day}`;
}

export function getBusinessDateRangeForDate(businessDate: string): BusinessDateRange {
  const normalizedBusinessDate = businessDate.trim();

  if (!normalizedBusinessDate) {
    throw new Error("Business date is required.");
  }

  return {
    businessDate: normalizedBusinessDate,
    ...getRangeForBusinessDate(normalizedBusinessDate),
  };
}

export function getNairobiBusinessDayRange(date = new Date()): BusinessDateRange {
  const businessDate = getNairobiBusinessDate(date);

  return {
    businessDate,
    ...getRangeForBusinessDate(businessDate),
  };
}

export function getNairobiPeriodDateRange(
  period: DashboardPeriod,
  date = new Date()
) {
  if (period === "all") {
    return null;
  }

  const businessDate = getNairobiBusinessDate(date);
  const daysBack = period === "today" ? 0 : period === "7days" ? 6 : 29;

  return {
    businessDate,
    ...getRangeForBusinessDate(businessDate, -daysBack),
  };
}

export function getPeriodBusinessDateRange(
  period: DashboardPeriod,
  date = new Date()
): BusinessDatePeriodRange | null {
  const range = getNairobiPeriodDateRange(period, date);

  if (!range) {
    return null;
  }

  return {
    startBusinessDate: getNairobiBusinessDate(new Date(range.start)),
    endBusinessDate: range.businessDate,
  };
}

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
  const range = getNairobiPeriodDateRange(period);

  if (!range) {
    return true;
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const normalizedValue = value.trim();

    return (
      normalizedValue >= getNairobiBusinessDate(new Date(range.start)) &&
      normalizedValue <= range.businessDate
    );
  }

  const timestamp = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return false;
  }

  return (
    timestamp >= new Date(range.start) && timestamp < new Date(range.end)
  );
}

export function getPeriodDateRange(period: DashboardPeriod) {
  const range = getNairobiPeriodDateRange(period);

  if (!range) {
    return null;
  }

  return {
    start: range.start,
    end: range.end,
  };
}
