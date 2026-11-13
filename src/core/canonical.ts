function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    const sorted: Record<string, unknown> = {};
    for (const [key, nested] of entries) sorted[key] = sortValue(nested);
    return sorted;
  }
  return value;
}

/** Stable JSON with sorted object keys, used for loop signatures. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}
