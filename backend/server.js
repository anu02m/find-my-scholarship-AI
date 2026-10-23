import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runProfileAgent } from './agents/profileAgent.js';
import { runDiscoveryAgent } from './agents/discoveryAgent.js';
import { runEligibilityAgent } from './agents/eligibilityAgent.js';
import { runRankingAgent } from './agents/rankingAgent.js';
import { runSopAgent } from './agents/sopAgent.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for PDF in-memory uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024 // 15MB limit per file
  }
});

const uploadFields = upload.fields([
  { name: 'resume', maxCount: 1 },
  { name: 'marksheet', maxCount: 1 }
]);

// Basic health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'FindMyScholarshipAI Backend', port: PORT });
});

/**
 * GET /demo
 * Replays a pre-recorded successful run sequence via SSE with a ~1s delay between events.
 */
app.get('/demo', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let clientConnected = true;
  res.on('close', () => {
    clientConnected = false;
  });

  const sendSSE = (payload) => {
    if (!clientConnected || res.writableEnded) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    if (typeof res.flush === 'function') {
      res.flush();
    }
  };

  try {
    const cachedFilePath = path.join(__dirname, 'cached_result.json');
    if (!fs.existsSync(cachedFilePath)) {
      sendSSE({ agent: 'error', status: 'error', message: 'No cached demo result found.' });
      return res.end();
    }

    const rawData = fs.readFileSync(cachedFilePath, 'utf8');
    const cachedData = JSON.parse(rawData);
    const events = cachedData.events || [];

    for (let i = 0; i < events.length; i++) {
      if (!clientConnected || res.writableEnded) break;
      const event = events[i];
      sendSSE(event);

      // Delay ~1 second between events except after the final event
      if (i < events.length - 1) {
        await sleep(1000);
      }
    }
  } catch (err) {
    console.error('[Server] Demo replay error:', err);
    sendSSE({ agent: 'error', status: 'error', message: err.message });
  } finally {
    res.end();
  }
});

/**
 * POST /run
 * Multipart form:
 * - resume: PDF file
 * - marksheet: PDF file
 * - github_username: string
 * - target_countries: string (comma-separated or text)
 *
 * Streams progress events via SSE:
 * { agent, status: "working" | "done" | "error", message }
 * Final event:
 * { agent: "final", data: { top5, sop } }
 */
app.post('/run', uploadFields, async (req, res) => {
  // Set SSE response headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let clientConnected = true;
  res.on('close', () => {
    clientConnected = false;
  });

  const recordedEvents = [];
  const sendSSE = (payload) => {
    recordedEvents.push(payload);
    if (!clientConnected || res.writableEnded) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    if (typeof res.flush === 'function') {
      res.flush();
    }
  };

  try {
    const resumeFile = req.files?.resume?.[0];
    const marksheetFile = req.files?.marksheet?.[0];
    const githubUsername = (req.body?.github_username || '').trim();
    const targetCountries = (req.body?.target_countries || '').trim();

    // 1. Profile Agent
    sendSSE({
      agent: 'profile',
      status: 'working',
      message: 'Extracting candidate profile from documents and GitHub...'
    });

    let profile = { skills: [], CGPA: 'not found', projects: [], achievements: [] };
    try {
      profile = await runProfileAgent({
        resumeBuffer: resumeFile?.buffer,
        marksheetBuffer: marksheetFile?.buffer,
        githubUsername
      });
      sendSSE({
        agent: 'profile',
        status: 'done',
        message: 'Extracted candidate profile successfully.'
      });
    } catch (err) {
      console.error('[Server] Profile Agent error:', err);
      sendSSE({
        agent: 'profile',
        status: 'error',
        message: err.message || 'Profile extraction encountered an error.'
      });
    }

    // 2. Discovery Agent
    sendSSE({
      agent: 'discovery',
      status: 'working',
      message: `Searching scholarship opportunities for: ${targetCountries || 'target countries'}...`
    });

    let opportunities = [];
    try {
      opportunities = await runDiscoveryAgent({
        targetCountries,
        profile
      });
      sendSSE({
        agent: 'discovery',
        status: 'done',
        message: `Discovered ${opportunities.length} potential scholarship opportunities.`
      });
    } catch (err) {
      console.error('[Server] Discovery Agent error:', err);
      sendSSE({
        agent: 'discovery',
        status: 'error',
        message: err.message || 'Scholarship discovery encountered an error.'
      });
    }

    // 3. Eligibility Agent
    sendSSE({
      agent: 'eligibility',
      status: 'working',
      message: 'Extracting page requirements and assessing eligibility in batches...'
    });

    let evaluatedOpportunities = [];
    try {
      evaluatedOpportunities = await runEligibilityAgent({
        opportunities,
        profile
      });
      sendSSE({
        agent: 'eligibility',
        status: 'done',
        message: `Evaluated eligibility across ${evaluatedOpportunities.length} opportunities.`
      });
    } catch (err) {
      console.error('[Server] Eligibility Agent error:', err);
      sendSSE({
        agent: 'eligibility',
        status: 'error',
        message: err.message || 'Eligibility verification encountered an error.'
      });
      // Fallback
      evaluatedOpportunities = opportunities.map(o => ({
        ...o,
        status: 'unverified',
        fit_score: 0,
        funding: 'not found',
        deadline: 'not found'
      }));
    }

    // 4. Ranking Agent
    sendSSE({
      agent: 'ranking',
      status: 'working',
      message: 'Selecting and ranking top 5 matching opportunities...'
    });

    let top5 = [];
    try {
      top5 = await runRankingAgent({
        evaluatedOpportunities,
        profile
      });
      sendSSE({
        agent: 'ranking',
        status: 'done',
        message: `Finalized top ${top5.length} ranked scholarship opportunities.`
      });
    } catch (err) {
      console.error('[Server] Ranking Agent error:', err);
      sendSSE({
        agent: 'ranking',
        status: 'error',
        message: err.message || 'Ranking opportunities encountered an error.'
      });
      top5 = evaluatedOpportunities.slice(0, 5);
    }

    // 5. SOP Agent
    sendSSE({
      agent: 'sop',
      status: 'working',
      message: 'Drafting tailored Statement of Purpose for the top scholarship...'
    });

    let sop = '';
    try {
      sop = await runSopAgent({
        opportunity: top5[0],
        profile
      });
      sendSSE({
        agent: 'sop',
        status: 'done',
        message: 'Statement of Purpose draft completed.'
      });
    } catch (err) {
      console.error('[Server] SOP Agent error:', err);
      sendSSE({
        agent: 'sop',
        status: 'error',
        message: err.message || 'Statement of Purpose generation encountered an error.'
      });
      sop = 'Could not generate Statement of Purpose draft due to an error.';
    }

    // Final result event
    sendSSE({
      agent: 'final',
      data: {
        top5,
        sop
      }
    });

    // Save successful run to cache for offline demo fallback
    if (top5 && top5.length > 0 && sop && !sop.toLowerCase().includes('could not generate')) {
      try {
        fs.writeFileSync(
          path.join(__dirname, 'cached_result.json'),
          JSON.stringify({ events: recordedEvents }, null, 2),
          'utf8'
        );
        console.log('[Server] Successfully updated cached_result.json with live run.');
      } catch (cacheErr) {
        console.warn('[Server] Could not persist to cached_result.json:', cacheErr.message);
      }
    }
  } catch (criticalErr) {
    console.error('[Server] Unexpected failure in /run:', criticalErr);
    sendSSE({
      agent: 'final',
      data: {
        top5: [],
        sop: 'An unexpected server error occurred.',
        error: criticalErr.message
      }
    });
  } finally {
    res.end();
  }
});

// Start listening if run directly
const isDirectRun = process.argv[1] && process.argv[1].endsWith('server.js');
let serverInstance = null;
if (isDirectRun) {
  serverInstance = app.listen(PORT, () => {
    console.log(`FindMyScholarshipAI backend server running on http://localhost:${PORT}`);
  });
}

export { app, serverInstance as server };

