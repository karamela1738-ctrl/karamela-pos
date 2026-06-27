type NumericValue = number | string | null | undefined;

function toNumber(value: NumericValue) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }

  return 0;
}

function toNullableNumber(value: NumericValue) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = toNumber(value);
  return Number.isNaN(normalized) ? null : normalized;
}

export function getEffectiveWasteValue({
  valueAmount,
  quantity,
  sellingPrice,
  costPrice,
}: {
  valueAmount: NumericValue;
  quantity: NumericValue;
  sellingPrice: NumericValue;
  costPrice?: NumericValue;
}) {
  const explicitValue = toNullableNumber(valueAmount);

  if (explicitValue !== null && explicitValue > 0) {
    return explicitValue;
  }

  const sellingPriceFallback = toNumber(quantity) * toNumber(sellingPrice);

  if (sellingPriceFallback > 0) {
    return sellingPriceFallback;
  }

  const costPriceFallback = toNumber(quantity) * toNumber(costPrice);

  if (costPriceFallback > 0) {
    return costPriceFallback;
  }

  return explicitValue ?? 0;
}
