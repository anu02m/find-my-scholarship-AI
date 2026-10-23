async function testLiveRun() {
  console.log('Sending request to http://localhost:3001/run...');
  const formData = new FormData();
  formData.append('github_username', 'octocat');
  formData.append('target_countries', 'Germany, Singapore');

  // Minimal valid PDF structure
  const minimalPdf = '%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>endobj\n4 0 obj<< /Length 20 >>stream\nBT /F1 12 Tf (Hello World) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000204 00000 n \ntrailer<< /Size 5 /Root 1 0 R >>\nstartxref\n274\n%%EOF';

  formData.append('resume', new Blob([minimalPdf], { type: 'application/pdf' }), 'resume.pdf');
  formData.append('marksheet', new Blob([minimalPdf], { type: 'application/pdf' }), 'marksheet.pdf');

  const start = Date.now();
  const response = await fetch('http://localhost:3001/run', {
    method: 'POST',
    body: formData
  });

  console.log('Status:', response.status);
  console.log('Content-Type:', response.headers.get('content-type'));

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const json = JSON.parse(line.replace('data: ', ''));
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        if (json.agent === 'final') {
          console.log(`[+${elapsed}s] FINAL RESULT:`);
          console.log(`  Top 5 Count: ${json.data?.top5?.length}`);
          if (json.data?.top5?.length > 0) {
            console.log(`  Top 1: ${json.data.top5[0].name} (${json.data.top5[0].country})`);
            console.log(`  Deadline: ${json.data.top5[0].deadline}`);
            console.log(`  Funding: ${json.data.top5[0].funding}`);
            console.log(`  Fit Score: ${json.data.top5[0].fit_score}`);
          }
          console.log(`  SOP Length: ${json.data?.sop?.length} chars`);
        } else {
          console.log(`[+${elapsed}s] [${json.agent.toUpperCase()}] ${json.status} -> ${json.message}`);
        }
      }
    }
  }

  console.log(`Completed in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

testLiveRun().catch(console.error);
