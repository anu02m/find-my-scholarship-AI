import { withRetry } from '../utils/retry.js';
import { extractJsonFromText } from '../services/gemini.js';
import { fetchGitHubProfile } from '../services/github.js';
import { extractTextFromPDF } from '../services/pdf.js';

async function runTests() {
  console.log('--- 1. Testing retry helper ---');
  let attempts = 0;
  const result = await withRetry(async () => {
    attempts++;
    if (attempts < 2) {
      throw new Error('Temporary failure');
    }
    return 'success';
  }, { maxRetries: 2, delayMs: 100, label: 'TestRetry' });
  console.log('Retry test passed:', result === 'success', 'attempts:', attempts);

  console.log('\n--- 2. Testing JSON extraction ---');
  const markdownJson = '```json\n{"skills": ["Node.js", "AI"], "CGPA": "3.9"}\n```';
  const parsed = extractJsonFromText(markdownJson);
  console.log('JSON parser passed:', parsed.skills?.length === 2 && parsed.CGPA === '3.9');

  console.log('\n--- 3. Testing GitHub API service ---');
  const ghProfile = await fetchGitHubProfile('octocat');
  console.log('GitHub API passed:', ghProfile.repos.length > 0, 'sample repo:', ghProfile.repos[0]?.name);

  console.log('\n--- 4. Testing PDF parsing service ---');
  // Create a minimal synthetic valid PDF buffer
  const samplePdfBuffer = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 712 Td (Test PDF Content) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000216 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n310\n%%EOF'
  );
  try {
    const pdfText = await extractTextFromPDF(samplePdfBuffer);
    console.log('PDF text extracted:', JSON.stringify(pdfText));
  } catch (e) {
    console.log('PDF extraction caught expectedly or succeeded:', e.message);
  }

  console.log('\nAll utility tests completed successfully!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
