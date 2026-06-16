export function formatRate(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "--";
  }

  return `${(value * 100).toFixed(1)}%`;
}
