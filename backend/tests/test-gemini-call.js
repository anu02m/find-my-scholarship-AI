import { callGeminiJson } from '../services/gemini.js';

console.time('callGeminiJson');
try {
  const result = await callGeminiJson({
    prompt: 'Return a JSON object with key message and value hello',
    systemInstruction: 'Return JSON only'
  });
  console.timeEnd('callGeminiJson');
  console.log('Result:', result);
} catch (e) {
  console.timeEnd('callGeminiJson');
  console.error('Error:', e);
}
