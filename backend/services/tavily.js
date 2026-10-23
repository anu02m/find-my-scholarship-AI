import { withRetry } from '../utils/retry.js';
import dotenv from 'dotenv';

dotenv.config();

function getApiKey() {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is not set in environment or .env');
  }
  return apiKey;
}

/**
 * Searches the web using the Tavily Search API with retries.
 *
 * @param {string} query - Search query
 * @param {Object} [options]
 * @param {number} [options.maxResults=10]
 * @param {string} [options.searchDepth='basic'] - 'basic' or 'advanced'
 * @returns {Promise<Array<{ title: string, url: string, content: string }>>}
 */
export async function tavilySearch(query, { maxResults = 10, searchDepth = 'basic' } = {}) {
  return withRetry(
    async () => {
      const apiKey = getApiKey();
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          search_depth: searchDepth,
          max_results: maxResults,
          include_answer: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tavily search failed (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return data.results || [];
    },
    { maxRetries: 2, delayMs: 1500, label: `Tavily Search: "${query.slice(0, 30)}"` }
  );
}

/**
 * Extracts raw page content for a list of URLs using the Tavily Extract API with retries.
 * If extraction fails after retries, returns empty/null content without throwing.
 *
 * @param {string[]} urls - Array of URLs to extract
 * @returns {Promise<Record<string, { success: boolean, content: string | null, error?: string }>>}
 */
export async function tavilyExtract(urls) {
  if (!urls || urls.length === 0) return {};

  const cleanUrls = urls.filter(u => typeof u === 'string' && u.startsWith('http'));
  if (cleanUrls.length === 0) return {};

  try {
    const resultsMap = await withRetry(
      async () => {
        const apiKey = getApiKey();
        const response = await fetch('https://api.tavily.com/extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            api_key: apiKey,
            urls: cleanUrls
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Tavily extract failed (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const mapped = {};

        // Process successful extractions
        if (Array.isArray(data.results)) {
          for (const item of data.results) {
            mapped[item.url] = {
              success: !!item.raw_content,
              content: item.raw_content ? item.raw_content.slice(0, 15000) : null // limit size for prompt efficiency
            };
          }
        }

        // Process failed extractions
        if (Array.isArray(data.failed_results)) {
          for (const item of data.failed_results) {
            mapped[item.url] = {
              success: false,
              content: null,
              error: item.error || 'Failed to extract content'
            };
          }
        }

        return mapped;
      },
      { maxRetries: 2, delayMs: 1500, label: `Tavily Extract (${cleanUrls.length} urls)` }
    );

    // Ensure all requested URLs exist in the return object
    for (const url of cleanUrls) {
      if (!resultsMap[url]) {
        resultsMap[url] = { success: false, content: null, error: 'No content returned' };
      }
    }

    return resultsMap;
  } catch (error) {
    console.warn(`[Tavily Extract] Failed after retries: ${error.message}. Returning fallback for URLs.`);
    const fallbackMap = {};
    for (const url of cleanUrls) {
      fallbackMap[url] = { success: false, content: null, error: error.message };
    }
    return fallbackMap;
  }
}
