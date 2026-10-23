import { app } from '../server.js';

async function testEndpoint() {
  const TEST_PORT = 3999;
  const server = app.listen(TEST_PORT, async () => {
    console.log(`Test server running on port ${TEST_PORT}`);
    try {
      const formData = new FormData();
      formData.append('github_username', 'octocat');
      formData.append('target_countries', 'Germany, Canada');

      // Create dummy PDF blobs
      const dummyPdf = new Blob(['%PDF-1.4 sample content'], { type: 'application/pdf' });
      formData.append('resume', dummyPdf, 'resume.pdf');
      formData.append('marksheet', dummyPdf, 'marksheet.pdf');

      console.log('Sending POST /run request...');
      const response = await fetch(`http://localhost:${TEST_PORT}/run`, {
        method: 'POST',
        body: formData
      });

      console.log('Response Status:', response.status);
      console.log('Response Headers:', response.headers.get('content-type'));

      if (!response.body) {
        throw new Error('No response body returned');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const events = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            try {
              const parsed = JSON.parse(dataStr);
              events.push(parsed);
              console.log('Received SSE Event:', parsed.agent, parsed.status || '(data)');
            } catch (e) {
              console.warn('Could not parse SSE line:', line);
            }
          }
        }
      }

      console.log('\n--- Total SSE Events Received:', events.length, '---');
      console.log('Agents encountered:', [...new Set(events.map(e => e.agent))].join(', '));
      const finalEvent = events.find(e => e.agent === 'final');
      if (finalEvent) {
        console.log('Final event received successfully! Data keys:', Object.keys(finalEvent.data));
      } else {
        console.error('Final event was missing!');
      }

    } catch (err) {
      console.error('Endpoint test failed:', err);
    } finally {
      server.close(() => {
        console.log('Test server closed.');
        process.exit(0);
      });
    }
  });
}

testEndpoint();
