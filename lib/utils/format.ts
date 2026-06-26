export function formatCurrency(amount: number | null | undefined) {
  return `KES ${Number(amount || 0).toLocaleString()}`;
}

export function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString();
}

export function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString();
}
