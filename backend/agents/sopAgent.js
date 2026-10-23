import { callGemini } from '../services/gemini.js';

/**
 * SOP Agent:
 * Writes a compelling Statement of Purpose draft tailored to the #1 ranked opportunity
 * and the candidate's profile.
 *
 * @param {Object} params
 * @param {Object} params.opportunity - The #1 ranked scholarship/program opportunity
 * @param {Object} params.profile - Candidate profile (skills, CGPA, projects, achievements)
 * @returns {Promise<string>} The generated Statement of Purpose draft
 */
export async function runSopAgent({ opportunity, profile }) {
  if (!opportunity) {
    return 'No opportunity provided to generate a Statement of Purpose.';
  }

  const prompt = `
You are a distinguished academic admissions consultant and scholarship essay mentor.
Write a personalized, highly persuasive Statement of Purpose (SOP) draft for the candidate applying for the #1 ranked scholarship opportunity.

--- TARGET SCHOLARSHIP OPPORTUNITY ---
Name: ${opportunity.name}
Country: ${opportunity.country}
Funding: ${opportunity.funding}
Key Fit / Why It Fits: ${opportunity.why_it_fits}
Source: ${opportunity.source_url}

--- CANDIDATE PROFILE ---
Academic Standing / CGPA: ${profile?.CGPA || 'Strong academic foundation'}
Degree / Education: ${profile?.degree_or_education || 'Undergraduate degree'}
Technical Skills: ${Array.isArray(profile?.skills) ? profile.skills.join(', ') : 'Not specified'}
Projects: ${JSON.stringify(profile?.projects || [], null, 2)}
Achievements: ${JSON.stringify(profile?.achievements || [], null, 2)}
Profile Summary: ${profile?.summary || ''}

GUIDELINES:
1. Write a formal, compelling, 4 to 5 paragraph Statement of Purpose.
2. Weave in the candidate's real projects, technical expertise, and academic milestones seamlessly.
3. Explicitly explain why this particular scholarship (${opportunity.name}) and country (${opportunity.country}) are the ideal environment for their academic growth.
4. Conclude with a strong statement of commitment and future contributions.
5. Provide a polished, ready-to-refine draft in markdown.
`;

  const sopDraft = await callGemini({
    prompt,
    systemInstruction: 'You are an elite academic scholarship essay writer who drafts authentic, compelling Statements of Purpose tailored to candidate achievements.'
  });

  return sopDraft.trim();
}
