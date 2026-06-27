const PENDING_SALE_REFERENCE_KEY = "karamela_pending_sale_reference";

export function getOrCreatePendingSaleReference() {
  if (typeof window === "undefined") {
    return createSaleReference();
  }

  const existingReference = window.localStorage.getItem(
    PENDING_SALE_REFERENCE_KEY
  );

  if (existingReference) {
    return existingReference;
  }

  const newReference = createSaleReference();
  window.localStorage.setItem(PENDING_SALE_REFERENCE_KEY, newReference);
  return newReference;
}

export function clearPendingSaleReference() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(PENDING_SALE_REFERENCE_KEY);
}

function createSaleReference() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
