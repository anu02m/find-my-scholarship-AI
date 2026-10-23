import { GoogleGenAI } from '@google/genai';
import { withRetry } from '../utils/retry.js';
import dotenv from 'dotenv';

dotenv.config();

let aiClient = null;

function getClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set in environment or .env');
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

/**
 * Clean and parse JSON from model output that might include markdown code fences.
 * @param {string} text
 * @returns {any}
 */
export function extractJsonFromText(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Empty response from model');
  }

  // Remove markdown code fences if present (```json ... ``` or ``` ...)
  let cleaned = text.trim();
  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = cleaned.match(jsonBlockRegex);
  if (match) {
    cleaned = match[1].trim();
  } else {
    // If there are stray backticks or prefix
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  }

  // Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Attempt to locate first { or [ to last } or ]
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');
    let startIdx = -1;

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIdx = firstBrace;
      const lastBrace = cleaned.lastIndexOf('}');
      if (lastBrace !== -1 && lastBrace > startIdx) {
        return JSON.parse(cleaned.slice(startIdx, lastBrace + 1));
      }
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
      const lastBracket = cleaned.lastIndexOf(']');
      if (lastBracket !== -1 && lastBracket > startIdx) {
        return JSON.parse(cleaned.slice(startIdx, lastBracket + 1));
      }
    }
    throw new Error(`Failed to parse JSON from response: ${err.message}. Raw: ${text.slice(0, 300)}...`);
  }
}

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

/**
 * Generates text with Gemini, retrying on failure or rate limits.
 *
 * @param {Object} params
 * @param {string} params.prompt
 * @param {string} [params.systemInstruction]
 * @param {string} [params.model]
 * @returns {Promise<string>}
 */
export async function callGemini({ prompt, systemInstruction, model = DEFAULT_MODEL }) {
  const modelsToTry = [model, 'gemini-flash-latest', 'gemini-3.8-flash'].filter((m, i, arr) => arr.indexOf(m) === i);
  let lastError;

  for (const m of modelsToTry) {
    try {
      return await withRetry(
        async () => {
          const client = getClient();
          const config = {};
          if (systemInstruction) {
            config.systemInstruction = systemInstruction;
          }

          const response = await client.models.generateContent({
            model: m,
            contents: prompt,
            config
          });

          const text = response?.text;
          if (!text) {
            throw new Error('Gemini returned an empty response');
          }
          return text;
        },
        { maxRetries: 1, delayMs: 1500, label: `Gemini (${m})` }
      );
    } catch (err) {
      lastError = err;
      console.warn(`[Gemini] Model ${m} failed (${err.message}). Trying fallback model if available...`);
    }
  }

  throw lastError;
}

/**
 * Generates structured JSON with Gemini, retrying on failure or rate limits.
 *
 * @param {Object} params
 * @param {string} params.prompt
 * @param {string} [params.systemInstruction]
 * @param {string} [params.model]
 * @returns {Promise<any>}
 */
export async function callGeminiJson({ prompt, systemInstruction, model = DEFAULT_MODEL }) {
  const modelsToTry = [model, 'gemini-flash-latest', 'gemini-3.8-flash'].filter((m, i, arr) => arr.indexOf(m) === i);
  let lastError;

  for (const m of modelsToTry) {
    try {
      return await withRetry(
        async () => {
          const client = getClient();
          const config = {
            responseMimeType: 'application/json'
          };
          if (systemInstruction) {
            config.systemInstruction = systemInstruction;
          }

          const response = await client.models.generateContent({
            model: m,
            contents: prompt,
            config
          });

          const text = response?.text;
          if (!text) {
            throw new Error('Gemini returned an empty response');
          }
          return extractJsonFromText(text);
        },
        { maxRetries: 1, delayMs: 1500, label: `Gemini JSON (${m})` }
      );
    } catch (err) {
      lastError = err;
      console.warn(`[Gemini JSON] Model ${m} failed (${err.message}). Trying fallback model if available...`);
    }
  }

  throw lastError;
}
