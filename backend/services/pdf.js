import pdfParse from 'pdf-parse';

/**
 * Extracts plain text from a PDF Buffer.
 * @param {Buffer} buffer - PDF file buffer
 * @returns {Promise<string>} - Extracted text
 */
export async function extractTextFromPDF(buffer) {
  if (!buffer || buffer.length === 0) {
    return '';
  }
  try {
    const parseFn = typeof pdfParse === 'function' ? pdfParse : pdfParse.default;
    const data = await parseFn(buffer);
    return data.text ? data.text.trim() : '';
  } catch (error) {
    console.error('Failed to parse PDF buffer:', error.message);
    throw new Error(`PDF parsing failed: ${error.message}`);
  }
}
