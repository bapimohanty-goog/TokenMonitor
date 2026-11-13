export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return Math.round(value).toLocaleString();
}

export function formatExactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString();
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return '$0.00';
  if (value > 0 && value < 0.01) {
    return `$${value.toFixed(4)}`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatTimestamp(
  iso: string,
  granularity: 'minute' | 'hour' | 'day' = 'day'
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  if (granularity === 'minute') {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (granularity === 'hour') {
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
