const numberFormat = new Intl.NumberFormat('en');

export function formatCount(count: number): string {
  return numberFormat.format(count);
}

/** `1.5 MB`, `320 KB`: binary units, one decimal above 10 KB only when it helps. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded = value >= 10 || Number.isInteger(value) ? Math.round(value) : value.toFixed(1);
  return `${rounded} ${units[unit]}`;
}
