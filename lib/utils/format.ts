export function formatCurrency(amount: number | null | undefined) {
  return `KES ${Number(amount || 0).toLocaleString()}`;
}

export function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString();
}

export function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString();
}

export function formatBusinessDate(value: string) {
  const normalizedValue = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return new Intl.DateTimeFormat("en-KE", {
      timeZone: "Africa/Nairobi",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(`${normalizedValue}T12:00:00+03:00`));
  }

  return formatDate(normalizedValue);
}

export function formatBusinessDateRange(
  startBusinessDate: string | null,
  endBusinessDate: string
) {
  if (!startBusinessDate) {
    return `All time up to ${formatBusinessDate(endBusinessDate)}`;
  }

  if (startBusinessDate === endBusinessDate) {
    return formatBusinessDate(endBusinessDate);
  }

  return `${formatBusinessDate(startBusinessDate)} to ${formatBusinessDate(endBusinessDate)}`;
}
