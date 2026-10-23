import { extractTextFromPDF } from '../services/pdf.js';
import { fetchGitHubProfile } from '../services/github.js';
import { callGeminiJson } from '../services/gemini.js';

/**
 * Profile Agent:
 * Extracts text from resume & marksheet PDFs, fetches GitHub repos & languages,
 * and calls Gemini to return a structured JSON candidate profile.
 *
 * @param {Object} params
 * @param {Buffer} [params.resumeBuffer] - Resume PDF buffer
 * @param {Buffer} [params.marksheetBuffer] - Marksheet/Transcript PDF buffer
 * @param {string} [params.githubUsername] - GitHub username
 * @returns {Promise<Object>} Structured candidate profile
 */
export async function runProfileAgent({ resumeBuffer, marksheetBuffer, githubUsername }) {
  // 1. Extract PDF texts
  let resumeText = '';
  let marksheetText = '';

  if (resumeBuffer) {
    try {
      resumeText = await extractTextFromPDF(resumeBuffer);
    } catch (err) {
      console.warn('[Profile Agent] Resume PDF extraction warning:', err.message);
    }
  }

  if (marksheetBuffer) {
    try {
      marksheetText = await extractTextFromPDF(marksheetBuffer);
    } catch (err) {
      console.warn('[Profile Agent] Marksheet PDF extraction warning:', err.message);
    }
  }

  // 2. Fetch GitHub data
  let githubData = { repos: [], languages: [], summary: 'No GitHub profile' };
  if (githubUsername) {
    try {
      githubData = await fetchGitHubProfile(githubUsername);
    } catch (err) {
      console.warn('[Profile Agent] GitHub fetch warning:', err.message);
    }
  }

  // 3. Formulate prompt for Gemini
  const prompt = `
You are an expert academic evaluator and admissions officer.
Analyze the provided candidate data (Resume, Marksheet/Transcript, and GitHub profile) and synthesize a comprehensive candidate profile.

Candidate Data:
--- RESUME TEXT ---
${resumeText || 'Not provided'}

--- MARKSHEET / TRANSCRIPT TEXT ---
${marksheetText || 'Not provided'}

--- GITHUB ACTIVITY ---
Summary: ${githubData.summary}
Languages: ${githubData.languages.join(', ') || 'None'}
Repositories:
${JSON.stringify(githubData.repos, null, 2)}
-------------------

Return a strictly valid JSON object matching this schema:
{
  "skills": ["string"],
  "CGPA": "string (e.g. 8.7/10, 3.8/4.0, or 'Not specified')",
  "projects": [
    {
      "name": "string",
      "description": "string",
      "technologies": ["string"]
    }
  ],
  "achievements": ["string"],
  "degree_or_education": "string",
  "summary": "string"
}
`;

  const profile = await callGeminiJson({
    prompt,
    systemInstruction: 'You extract and organize academic and technical candidate profiles accurately into structured JSON.'
  });

  return profile;
}
