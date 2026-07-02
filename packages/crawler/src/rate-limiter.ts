/**
 * Token-bucket rate limiter.
 * Ensures we never exceed maxRpm requests per minute to Reddit.
 * Adds jitter to avoid thundering-herd patterns.
 */

const MIN_DELAY_MS = 2_000;
const JITTER_MS = 600;

export class RateLimiter {
  private readonly intervalMs: number;
  private lastRequestAt = 0;
  private consecutiveErrors = 0;

  constructor(private readonly maxRpm: number = 25) {
    this.intervalMs = Math.ceil(60_000 / maxRpm);
  }

  /** Wait until the next request is allowed, then proceed. */
  async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    const requiredDelay = Math.max(this.intervalMs, MIN_DELAY_MS);
    const jitter = Math.random() * JITTER_MS;
    const wait = Math.max(0, requiredDelay - elapsed + jitter);

    if (wait > 0) {
      await sleep(wait);
    }
    this.lastRequestAt = Date.now();
  }

  /** Call on a successful response to reset the error counter. */
  onSuccess(): void {
    this.consecutiveErrors = 0;
  }

  /**
   * Call on a rate-limit (429) response.
   * Returns how many ms we waited.
   */
  async onRateLimit(retryAfterHeader?: string): Promise<number> {
    this.consecutiveErrors++;
    const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
    const baseWaitMs = isNaN(retryAfterSec)
      ? Math.min(60_000 * Math.pow(2, this.consecutiveErrors - 1), 600_000)
      : retryAfterSec * 1_000;

    console.warn(`[crawler] rate limited — waiting ${Math.round(baseWaitMs / 1000)}s`);
    await sleep(baseWaitMs);
    return baseWaitMs;
  }

  /** Call on a server error (5xx). */
  async onServerError(): Promise<void> {
    this.consecutiveErrors++;
    const wait = Math.min(10_000 * this.consecutiveErrors, 120_000);
    console.warn(`[crawler] server error — waiting ${Math.round(wait / 1000)}s`);
    await sleep(wait);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
