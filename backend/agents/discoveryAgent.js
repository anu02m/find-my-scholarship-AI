import { tavilySearch } from '../services/tavily.js';
import { callGeminiJson } from '../services/gemini.js';

/**
 * Discovery Agent:
 * Uses Tavily to search scholarships/programs for target countries,
 * and uses Gemini to extract at least 10 real opportunities as JSON.
 *
 * @param {Object} params
 * @param {string|string[]} params.targetCountries - Target countries (e.g., "Germany, Canada" or ["Germany", "Canada"])
 * @param {Object} [params.profile] - Candidate profile for context
 * @returns {Promise<Array<{ name: string, country: string, url: string, summary: string }>>}
 */
export async function runDiscoveryAgent({ targetCountries, profile }) {
  // Normalize target countries
  let countries = [];
  if (Array.isArray(targetCountries)) {
    countries = targetCountries.map(c => c.trim()).filter(Boolean);
  } else if (typeof targetCountries === 'string') {
    countries = targetCountries.split(/[,;\n]/).map(c => c.trim()).filter(Boolean);
  }
  if (countries.length === 0) {
    countries = ['Germany', 'Canada', 'United Kingdom'];
  }

  // Derive academic field focus from profile if available
  const fieldKeywords = Array.isArray(profile?.skills) && profile.skills.length > 0
    ? profile.skills.slice(0, 3).join(' ')
    : (profile?.degree_or_education || 'higher education degree');

  // Perform Tavily searches for each country (or combine if many)
  const searchPromises = countries.map(country => {
    const query = `scholarships for international students in ${country} ${fieldKeywords} masters bachelor funding application 2025 2026 official`;
    return tavilySearch(query, { maxResults: 8, searchDepth: 'basic' }).catch(err => {
      console.warn(`[Discovery Agent] Search failed for ${country}:`, err.message);
      return [];
    });
  });

  const searchResultsArrays = await Promise.all(searchPromises);
  const combinedResults = searchResultsArrays.flat();

  // Deduplicate results by URL
  const uniqueResultsMap = new Map();
  for (const item of combinedResults) {
    if (item.url && !uniqueResultsMap.has(item.url)) {
      uniqueResultsMap.set(item.url, item);
    }
  }
  const uniqueResults = Array.from(uniqueResultsMap.values());

  const prompt = `
You are a global academic scholarship researcher.
Below are raw web search results for scholarships and degree funding opportunities in: ${countries.join(', ')}.

--- SEARCH RESULTS ---
${uniqueResults.map((r, i) => `[${i + 1}] Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.content}\n`).join('\n')}
----------------------

Task:
Extract and curate at least 10 REAL, active scholarship or funding opportunities from the search results provided.
Requirements:
1. Every opportunity MUST use a real, specific URL from the search results above (never invent or make up URLs).
2. Ensure opportunities cover the requested countries: ${countries.join(', ')}.
3. Return a JSON array with at least 10 items.

JSON Output Schema:
[
  {
    "name": "Exact Name of Scholarship or Fellowship",
    "country": "Country offering the scholarship",
    "url": "http://... (MUST be from the search results)",
    "summary": "Clear 2-3 sentence overview of the scholarship, target students, and benefits."
  }
]
`;

  const opportunities = await callGeminiJson({
    prompt,
    systemInstruction: 'You extract real scholarship opportunities from search results into structured JSON arrays. Do not invent URLs.'
  });

  if (!Array.isArray(opportunities)) {
    if (opportunities && Array.isArray(opportunities.opportunities)) {
      return opportunities.opportunities;
    }
    throw new Error('Discovery Agent did not return a JSON array of opportunities.');
  }

  return opportunities;
}
