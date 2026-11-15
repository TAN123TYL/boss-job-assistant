export function normalizeWhitespace(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function unique(values: Iterable<string>): string[] {
  return [
    ...new Set(Array.from(values, (value) => value.trim()).filter((value) => value.length > 0)),
  ];
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function splitList(value: string): string[] {
  return unique(value.split(/[\n,，、;；|/／]+/u));
}

export function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function truncate(value: string, maximumLength: number): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maximumLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maximumLength - 1)).trimEnd()}…`;
}
