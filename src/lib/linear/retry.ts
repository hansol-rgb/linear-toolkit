const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_INITIAL_DELAY_MS = 500;

const RETRIABLE_PATTERNS = [
  'rate limit',
  '429',
  'too many requests',
  'timeout',
  'timed out',
  'network',
  'econnreset',
  'etimedout',
  'enotfound',
  'socket hang up',
  'fetch failed',
  '500',
  '502',
  '503',
  '504',
];

export function isRetriable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return RETRIABLE_PATTERNS.some((p) => msg.includes(p));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; initialDelayMs?: number; label?: string } = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const initialDelayMs = opts.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts || !isRetriable(err)) throw err;
      const delay = initialDelayMs * Math.pow(2, attempt - 1);
      if (opts.label) {
        console.warn(`[retry] ${opts.label} attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms:`, err);
      }
      await sleep(delay);
    }
  }
  throw lastError;
}
