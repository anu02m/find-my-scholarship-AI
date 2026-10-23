import { tavilyExtract } from '../services/tavily.js';
import { callGeminiJson } from '../services/gemini.js';

/**
 * Helper to split an array into chunks of specified size.
 */
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Eligibility Agent:
 * 1. Fetches opportunity page contents via Tavily Extract.
 * 2. Marks any page that cannot be extracted as "unverified".
 * 3. Compares candidate profile against requirements in batches of 3 using Gemini.
 * 4. Returns matched, missing, fit score (out of 100), and extracted details.
 *
 * @param {Object} params
 * @param {Array<Object>} params.opportunities - Opportunities from Discovery Agent
 * @param {Object} params.profile - Candidate profile from Profile Agent
 * @returns {Promise<Array<Object>>} Evaluated opportunities
 */
export async function runEligibilityAgent({ opportunities, profile }) {
  if (!Array.isArray(opportunities) || opportunities.length === 0) {
    return [];
  }

  // 1. Fetch page content via Tavily Extract
  const urls = opportunities.map(o => o.url).filter(Boolean);
  const extractedPages = await tavilyExtract(urls);

  const verifiedList = [];
  const unverifiedList = [];

  for (const opp of opportunities) {
    const pageData = extractedPages[opp.url];
    if (pageData && pageData.success && pageData.content && pageData.content.length > 100) {
      verifiedList.push({
        ...opp,
        pageContent: pageData.content
      });
    } else {
      unverifiedList.push({
        ...opp,
        status: 'unverified',
        fit_score: 0,
        matched: [],
        missing: ['Page could not be verified or reached via Tavily extract'],
        funding: 'not found',
        deadline: 'not found',
        how_to_apply: 'Visit source URL directly to verify eligibility.',
        why_it_fits: 'Eligibility unverified due to unreachable official page.'
      });
    }
  }

  // 2. Evaluate verified opportunities in batches of 3 to respect Gemini free-tier rate limits
  const BATCH_SIZE = 3;
  const batches = chunkArray(verifiedList, BATCH_SIZE);
  const evaluatedResults = [];

  for (let bIndex = 0; bIndex < batches.length; bIndex++) {
    const currentBatch = batches[bIndex];

    const prompt = `
You are an expert scholarship eligibility evaluator.
Compare the Candidate Profile against the actual requirements of the following ${currentBatch.length} scholarship opportunities based strictly on their extracted page content.

--- CANDIDATE PROFILE ---
${JSON.stringify(profile, null, 2)}

--- SCHOLARSHIPS TO EVALUATE ---
${currentBatch.map((item, idx) => `
[Scholarship ${idx + 1}]
Name: ${item.name}
Country: ${item.country}
URL: ${item.url}
Page Text:
${item.pageContent.slice(0, 4000)}
`).join('\n------------------------\n')}

TASK:
For each scholarship, analyze the criteria:
1. Pull all stated eligibility requirements (degree level, nationality, GPA/marks, background).
2. Compare them against the candidate's profile.
3. List 'matched' criteria and 'missing' (or unmet/uncertain) criteria.
4. Calculate an objective 'fit_score' from 0 to 100.
5. Extract exact funding details stated on the page. If none stated, write 'not found'.
6. Extract the exact application deadline stated on the page.
   CRITICAL RULE: Never invent deadlines. Use ONLY what explicitly appears on the fetched page text. If no specific deadline date is stated in the text, you MUST return 'not found'.
7. Extract concise 'how_to_apply' instructions found in the text.
8. State 'why_it_fits' explaining why the candidate matches or where the gaps are.

Return a JSON array containing exactly ${currentBatch.length} objects corresponding in order to the scholarships:
[
  {
    "url": "exact URL from input",
    "status": "verified",
    "fit_score": 85,
    "matched": ["string"],
    "missing": ["string"],
    "funding": "string or 'not found'",
    "deadline": "string (strictly from page text or 'not found')",
    "how_to_apply": "string",
    "why_it_fits": "string"
  }
]
`;

    try {
      const batchEvaluations = await callGeminiJson({
        prompt,
        systemInstruction: 'You evaluate scholarship eligibility strictly against source text without hallucinating deadlines or requirements. Output JSON array.'
      });

      if (Array.isArray(batchEvaluations)) {
        for (let i = 0; i < currentBatch.length; i++) {
          const original = currentBatch[i];
          const evaluated = batchEvaluations.find(e => e.url === original.url) || batchEvaluations[i] || {};

          // Enforce deadline rule defensively: ensure no empty or hallucinated fallback
          const rawDeadline = (evaluated.deadline || '').trim();
          const cleanDeadline = (rawDeadline && !rawDeadline.toLowerCase().includes('invent') && !rawDeadline.toLowerCase().includes('unknown')) 
            ? rawDeadline 
            : 'not found';

          evaluatedResults.push({
            name: original.name,
            country: original.country,
            url: original.url,
            summary: original.summary,
            status: 'verified',
            fit_score: typeof evaluated.fit_score === 'number' ? evaluated.fit_score : 50,
            matched: Array.isArray(evaluated.matched) ? evaluated.matched : [],
            missing: Array.isArray(evaluated.missing) ? evaluated.missing : [],
            funding: evaluated.funding || 'not found',
            deadline: cleanDeadline,
            how_to_apply: evaluated.how_to_apply || 'Refer to official scholarship website.',
            why_it_fits: evaluated.why_it_fits || 'Good academic match based on candidate profile.'
          });
        }
      } else {
        throw new Error('Batch evaluation response was not an array');
      }
    } catch (err) {
      console.warn(`[Eligibility Agent] Batch ${bIndex + 1} evaluation error:`, err.message);
      // Fallback batch items to unverified instead of failing the whole pipeline
      for (const item of currentBatch) {
        evaluatedResults.push({
          name: item.name,
          country: item.country,
          url: item.url,
          summary: item.summary,
          status: 'unverified',
          fit_score: 0,
          matched: [],
          missing: ['Evaluation could not be completed'],
          funding: 'not found',
          deadline: 'not found',
          how_to_apply: 'Visit source URL directly.',
          why_it_fits: 'Evaluation failed or timed out.'
        });
      }
    }
  }

  // Combine evaluated results and unverified items
  return [...evaluatedResults, ...unverifiedList];
}
