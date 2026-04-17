const DUE_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function sanitizeDueDate(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return DUE_DATE_REGEX.test(trimmed) ? trimmed : undefined;
}

export function sanitizePriority(raw: number | undefined | null): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Number.isInteger(raw) || raw < 0 || raw > 4) return undefined;
  return raw;
}
