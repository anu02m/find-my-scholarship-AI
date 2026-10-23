// FindMyScholarshipAI - Frontend Application Logic
const BACKEND_URL = 'http://localhost:3001';

// DOM Elements
const form = document.getElementById('scholarshipForm');
const submitBtn = document.getElementById('submitBtn');
const btnSpinner = document.getElementById('btnSpinner');
const btnText = document.getElementById('btnText');
const livePill = document.getElementById('livePill');
const resultsSection = document.getElementById('resultsSection');
const opportunitiesContainer = document.getElementById('opportunitiesContainer');
const sopTextArea = document.getElementById('sopTextArea');
const sopSubtitle = document.getElementById('sopSubtitle');
const copySopBtn = document.getElementById('copySopBtn');
const copyBtnText = document.getElementById('copyBtnText');
const demoBtn = document.getElementById('demoBtn');
const demoBtnText = document.getElementById('demoBtnText');

// File inputs & labels
const resumeInput = document.getElementById('resume');
const marksheetInput = document.getElementById('marksheet');
const resumeLabel = document.getElementById('resumeLabel');
const marksheetLabel = document.getElementById('marksheetLabel');

// Map of agent key to DOM card element
const AGENT_CARDS = {
  profile: document.getElementById('card-profile'),
  discovery: document.getElementById('card-discovery'),
  eligibility: document.getElementById('card-eligibility'),
  ranking: document.getElementById('card-ranking'),
  sop: document.getElementById('card-sop')
};

// Update file input labels on selection
function setupFileInput(inputEl, labelEl, defaultText) {
  inputEl.addEventListener('change', () => {
    const file = inputEl.files?.[0];
    const nameSpan = labelEl.querySelector('.file-name');
    if (file) {
      nameSpan.textContent = `📄 ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
      labelEl.parentElement.style.borderColor = 'var(--primary)';
    } else {
      nameSpan.textContent = defaultText;
      labelEl.parentElement.style.borderColor = '';
    }
  });

  // Drag and drop events
  const zone = labelEl.parentElement;
  ['dragenter', 'dragover'].forEach(eventName => {
    zone.addEventListener(eventName, (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(eventName => {
    zone.addEventListener(eventName, (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
    });
  });
}

setupFileInput(resumeInput, resumeLabel, 'Select Resume PDF');
setupFileInput(marksheetInput, marksheetLabel, 'Select Marksheet PDF');

// Reset agent cards to idle state
function resetAgentsUI() {
  Object.keys(AGENT_CARDS).forEach(agentKey => {
    const card = AGENT_CARDS[agentKey];
    if (!card) return;
    card.className = 'agent-card idle';
    const badge = card.querySelector('.status-badge');
    const msg = card.querySelector('.agent-message');
    if (badge) badge.textContent = 'Idle';
    if (msg) msg.textContent = 'Waiting to start...';
  });

  livePill.textContent = 'Running';
  livePill.className = 'live-pill active';
  resultsSection.classList.add('hidden');
  opportunitiesContainer.innerHTML = '';
  sopTextArea.value = '';
}

// Update a specific agent's card state and message
function updateAgentCard(agentKey, status, message) {
  const card = AGENT_CARDS[agentKey];
  if (!card) return;

  // Clear previous state classes
  card.classList.remove('idle', 'working', 'done', 'error');

  // Add new state class
  const validStatus = ['working', 'done', 'error'].includes(status) ? status : 'working';
  card.classList.add(validStatus);

  const badge = card.querySelector('.status-badge');
  const msgEl = card.querySelector('.agent-message');

  if (badge) {
    if (validStatus === 'working') badge.textContent = 'Working';
    else if (validStatus === 'done') badge.textContent = 'Done';
    else if (validStatus === 'error') badge.textContent = 'Error';
  }

  if (msgEl && message) {
    msgEl.textContent = message;
  }
}

// Render the final Top 5 Opportunities
function renderOpportunities(top5 = []) {
  opportunitiesContainer.innerHTML = '';

  if (!Array.isArray(top5) || top5.length === 0) {
    opportunitiesContainer.innerHTML = `
      <div class="card" style="text-align: center; color: var(--text-muted); padding: 32px;">
        No opportunities could be finalized. Check agent status logs above.
      </div>
    `;
    return;
  }

  top5.forEach((opp, index) => {
    const card = document.createElement('div');
    card.className = 'opp-card';

    const isUnverified = opp.status === 'unverified' || opp.fit_score === 0;
    const isDeadlineNotFound = !opp.deadline || opp.deadline.toLowerCase().includes('not found');
    const sourceUrl = opp.source_url || opp.url || '#';
    const hasValidUrl = sourceUrl.startsWith('http');

    card.innerHTML = `
      <div class="opp-top-row">
        <div class="opp-title-area">
          <span class="opp-rank-tag">Top #${index + 1} Recommendation</span>
          <h3 class="opp-title">${escapeHtml(opp.name || 'Scholarship Opportunity')}</h3>
          <div class="opp-tags">
            <span class="tag tag-country">🌍 ${escapeHtml(opp.country || 'International')}</span>
            <span class="tag tag-score">★ Match Score: ${typeof opp.fit_score === 'number' ? opp.fit_score : 50}/100</span>
            ${isUnverified ? '<span class="tag tag-unverified">⚠️ Unverified Source</span>' : ''}
          </div>
        </div>
      </div>

      <div class="opp-meta-grid">
        <div class="meta-item">
          <span class="meta-label">💰 Funding Coverage</span>
          <span class="meta-val">${escapeHtml(opp.funding || 'not found')}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">📅 Application Deadline</span>
          <span class="meta-val ${isDeadlineNotFound ? 'deadline-not-found' : 'deadline-found'}">
            ${escapeHtml(opp.deadline || 'not found')}
          </span>
        </div>
      </div>

      <div class="opp-details">
        <div class="detail-block">
          <strong>Why It Fits:</strong>
          <p>${escapeHtml(opp.why_it_fits || 'Matches candidate academic interests and requirements.')}</p>
        </div>
        <div class="detail-block">
          <strong>How to Apply:</strong>
          <p>${escapeHtml(opp.how_to_apply || 'Refer to the official portal for submission criteria.')}</p>
        </div>
      </div>

      <div class="opp-footer">
        ${hasValidUrl ? `
          <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer" class="source-link">
            Visit Official Source
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
        ` : `
          <span style="font-size: 0.85rem; color: var(--text-muted);">No external URL available</span>
        `}
      </div>
    `;

    opportunitiesContainer.appendChild(card);
  });
}

// Render final Statement of Purpose
function renderSOP(sopText, topOpportunityName) {
  sopTextArea.value = sopText || 'No Statement of Purpose generated.';
  if (topOpportunityName) {
    sopSubtitle.textContent = `Customized for #1: ${topOpportunityName}`;
  } else {
    sopSubtitle.textContent = 'Customized for your top-ranked opportunity';
  }
}

// Handle incoming SSE events
function handleSseEvent(event) {
  if (!event || !event.agent) return;

  if (event.agent === 'final') {
    livePill.textContent = 'Completed';
    livePill.className = 'live-pill completed';
    resultsSection.classList.remove('hidden');

    const top5 = event.data?.top5 || [];
    const sop = event.data?.sop || '';

    renderOpportunities(top5);
    renderSOP(sop, top5[0]?.name);

    // Scroll smoothly to results
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  // Update agent progress cards
  updateAgentCard(event.agent, event.status, event.message);
}

// Form Submission Handler
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData();

  const resumeFile = resumeInput.files?.[0];
  const marksheetFile = marksheetInput.files?.[0];
  const githubUsername = document.getElementById('github_username').value.trim();
  const targetCountries = document.getElementById('target_countries').value.trim();

  if (resumeFile) formData.append('resume', resumeFile);
  if (marksheetFile) formData.append('marksheet', marksheetFile);
  formData.append('github_username', githubUsername);
  formData.append('target_countries', targetCountries || 'Canada, Germany, Singapore');

  // UI loading state
  submitBtn.disabled = true;
  btnSpinner.classList.remove('hidden');
  btnText.textContent = 'Running Agents...';
  resetAgentsUI();

  try {
    const response = await fetch(`${BACKEND_URL}/run`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Readable stream not supported or empty response body');
    }

    // Stream reader for Server-Sent Events
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split SSE chunks by double newline
      const chunks = buffer.split('\n\n');
      // Retain incomplete chunk in the buffer
      buffer = chunks.pop() || '';

      for (const chunk of chunks) {
        parseAndDispatchSseChunk(chunk);
      }
    }

    // Process any remaining buffered text
    if (buffer.trim()) {
      parseAndDispatchSseChunk(buffer);
    }

  } catch (error) {
    console.error('Pipeline execution error:', error);
    livePill.textContent = 'Error';
    livePill.className = 'live-pill';
    livePill.style.color = 'var(--danger)';

    alert(`Error running agents: ${error.message}\nMake sure the backend is running at ${BACKEND_URL}`);
  } finally {
    submitBtn.disabled = false;
    btnSpinner.classList.add('hidden');
    btnText.textContent = 'Run AI Agents';
  }
});

// Load Demo Result Handler (Instant Fallback Replay)
demoBtn.addEventListener('click', async () => {
  submitBtn.disabled = true;
  demoBtn.disabled = true;
  demoBtnText.textContent = 'Replaying Demo...';
  resetAgentsUI();

  try {
    const response = await fetch(`${BACKEND_URL}/demo`);
    if (!response.ok) {
      throw new Error(`Demo failed (${response.status}): ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';

      for (const chunk of chunks) {
        parseAndDispatchSseChunk(chunk);
      }
    }

    if (buffer.trim()) {
      parseAndDispatchSseChunk(buffer);
    }
  } catch (error) {
    console.error('Demo execution error:', error);
    alert(`Could not load demo: ${error.message}\nMake sure the backend is running at ${BACKEND_URL}`);
  } finally {
    submitBtn.disabled = false;
    demoBtn.disabled = false;
    demoBtnText.textContent = 'Load demo result';
  }
});

// Parse an individual SSE chunk and extract "data:" JSON
function parseAndDispatchSseChunk(chunk) {
  const lines = chunk.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data:')) {
      const jsonStr = trimmed.slice(5).trim();
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr);
          handleSseEvent(parsed);
        } catch (err) {
          console.warn('Failed to parse SSE JSON data:', jsonStr, err);
        }
      }
    }
  }
}

// Copy SOP Button
copySopBtn.addEventListener('click', async () => {
  const text = sopTextArea.value;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    copySopBtn.classList.add('copied');
    copyBtnText.textContent = 'Copied!';
    setTimeout(() => {
      copySopBtn.classList.remove('copied');
      copyBtnText.textContent = 'Copy SOP';
    }, 2000);
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    // Fallback: select textarea
    sopTextArea.select();
    document.execCommand('copy');
    copyBtnText.textContent = 'Copied!';
    setTimeout(() => {
      copyBtnText.textContent = 'Copy SOP';
    }, 2000);
  }
});

// Helper: Escape HTML to prevent injection
function escapeHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
