/**
 * Retry helper that executes an async function up to maxRetries times on failure.
 * Handles 429 / rate limits with extra backoff.
 *
 * @param {Function} fn - Async function to execute
 * @param {Object} options
 * @param {number} [options.maxRetries=2] - Maximum number of retries (default 2)
 * @param {number} [options.delayMs=1500] - Base delay in milliseconds
 * @param {string} [options.label='operation'] - Descriptive label for logging
 * @returns {Promise<any>}
 */
export async function withRetry(fn, { maxRetries = 2, delayMs = 1500, label = 'operation' } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      const isRateOrDemandLimit = error?.status === 429 ||
        error?.statusCode === 429 ||
        error?.status === 503 ||
        error?.statusCode === 503 ||
        error?.message?.includes('429') ||
        error?.message?.includes('503') ||
        error?.message?.toLowerCase().includes('resource_exhausted') ||
        error?.message?.toLowerCase().includes('high demand') ||
        error?.message?.toLowerCase().includes('rate limit');

      if (attempt > maxRetries) {
        console.error(`[${label}] All ${maxRetries + 1} attempts failed. Last error:`, error?.message || error);
        throw error;
      }

      // If rate limited (429) or high demand (503), use a longer backoff (at least 3 seconds)
      const currentDelay = isRateOrDemandLimit ? Math.max(delayMs * Math.pow(2, attempt - 1), 3000) : delayMs * Math.pow(2, attempt - 1);
      console.warn(`[${label}] Attempt ${attempt} failed (${error?.message || 'Error'}). Retrying in ${currentDelay}ms... (attempt ${attempt}/${maxRetries})`);
      
      await new Promise(resolve => setTimeout(resolve, currentDelay));
    }
  }
}
