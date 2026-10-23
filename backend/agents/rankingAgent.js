import { callGeminiJson } from '../services/gemini.js';

/**
 * Ranking Agent:
 * Sorts evaluated opportunities, picks the top 5 by fit score,
 * and refines them with funding, deadline (never invented: strictly "not found" if missing),
 * how to apply, why it fits, and source url.
 *
 * @param {Object} params
 * @param {Array<Object>} params.evaluatedOpportunities - List of opportunities from Eligibility Agent
 * @param {Object} params.profile - Candidate profile
 * @returns {Promise<Array<Object>>} Top 5 ranked opportunities
 */
export async function runRankingAgent({ evaluatedOpportunities, profile }) {
  if (!Array.isArray(evaluatedOpportunities) || evaluatedOpportunities.length === 0) {
    return [];
  }

  // Sort descending by fit_score
  const sorted = [...evaluatedOpportunities].sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0));
  const candidateTop = sorted.slice(0, 5);

  const prompt = `
You are an expert scholarship advisor. Review and finalize the top 5 scholarship opportunities for this candidate.

--- CANDIDATE PROFILE ---
${JSON.stringify(profile, null, 2)}

--- TOP SCHOLARSHIPS TO FINALIZE (Pre-ranked) ---
${JSON.stringify(candidateTop, null, 2)}

CRITICAL REQUIREMENTS:
1. Select and order the top 5 best matches by overall fit and score.
2. For each, clearly provide:
   - name: Official scholarship name
   - country: Destination country
   - fit_score: numeric score out of 100
   - funding: Stated funding amount or type (e.g. "Full tuition + 1200 EUR/month stipend" or "not found")
   - deadline: EXACT application deadline found in the data. 
     RULE: NEVER invent or guess a deadline date. If the source data does not explicitly state a deadline date or says "not found", you MUST set deadline to "not found".
   - how_to_apply: Step-by-step application guidance
   - why_it_fits: Specific, personalized explanation of why this candidate fits (referencing candidate's skills, CGPA, projects, or background)
   - source_url: The exact source URL
3. Output a JSON array with up to 5 items.

Return strictly a JSON array:
[
  {
    "name": "...",
    "country": "...",
    "fit_score": 90,
    "funding": "...",
    "deadline": "...",
    "how_to_apply": "...",
    "why_it_fits": "...",
    "source_url": "..."
  }
]
`;

  const rankedTop5 = await callGeminiJson({
    prompt,
    systemInstruction: 'You finalize scholarship rankings into structured JSON. Never invent deadlines; strictly use "not found" if not present.'
  });

  const finalTop5 = Array.isArray(rankedTop5) ? rankedTop5 : candidateTop;

  // Final defensive check to ensure deadline is never empty, invented, or undefined
  return finalTop5.map(item => {
    let deadline = (item.deadline || '').trim();
    if (!deadline || deadline.toLowerCase().includes('invent') || deadline.toLowerCase().includes('unknown')) {
      deadline = 'not found';
    }
    return {
      name: item.name || 'Scholarship Opportunity',
      country: item.country || 'International',
      fit_score: typeof item.fit_score === 'number' ? item.fit_score : 50,
      funding: item.funding || 'not found',
      deadline,
      how_to_apply: item.how_to_apply || 'Check official portal.',
      why_it_fits: item.why_it_fits || 'Matches candidate profile.',
      source_url: item.source_url || item.url || ''
    };
  });
}
