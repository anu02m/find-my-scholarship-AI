# FindMyScholarshipAI - Backend Service

A minimal Node.js + Express backend service running 5 sequential AI agents to analyze student profiles, discover global scholarship opportunities, evaluate eligibility, rank top opportunities, and generate a Statement of Purpose (SOP) draft.

Progress and results are streamed in real time via Server-Sent Events (SSE).

---

## Features & Agent Pipeline

1. **Profile Agent**:
   - Parses `resume` and `marksheet` PDFs using `pdf-parse`.
   - Fetches public repositories, descriptions, and languages from the GitHub REST API (`https://api.github.com/users/:username/repos`).
   - Uses Gemini to synthesize a structured candidate profile: `{ skills, CGPA, projects, achievements }`.

2. **Discovery Agent**:
   - Uses the Tavily Search API to query active scholarships in target countries.
   - Prompts Gemini to curate at least 10 real scholarship opportunities with verified URLs: `[{ name, country, url, summary }]`.

3. **Eligibility Agent**:
   - Fetches each opportunity page using the Tavily Extract API. If extraction fails, marks the opportunity as `"unverified"`.
   - Runs in small batches of **3 opportunities at a time** to respect Gemini rate limits.
   - Evaluates requirements against the candidate profile and returns `matched`, `missing`, and a `fit_score` (out of 100).

4. **Ranking Agent**:
   - Selects the top 5 opportunities sorted by fit score.
   - Provides funding, application steps, why it fits, and source URL.
   - **Deadline Integrity**: Never invents deadlines. Strictly uses only dates explicitly present on the fetched page; otherwise outputs `"not found"`.

5. **SOP Agent**:
   - Writes a personalized Statement of Purpose draft tailored to the #1 ranked opportunity and candidate achievements.

6. **Final Result Event**:
   - Sends `{ agent: "final", data: { top5, sop } }` and closes the stream.

---

## Resilience & Rate Limiting

- **Retry Helper**: Every Gemini and Tavily call is automatically retried up to 2 times with exponential backoff and increased delay for HTTP 429 rate limits.
- **Fault-Tolerant Streaming**: If an agent encounters an error, it emits `{ agent, status: "error", message }` via SSE and continues with available data rather than crashing the connection.
- **Unverified Page Handling**: If Tavily Extract fails after retries, the opportunity is preserved as `"unverified"` without disrupting the workflow.

---

## Installation & Setup

### 1. Prerequisites
- Node.js v18+ (tested on Node.js v24)
- npm

### 2. Configure Environment Variables
In the `backend` folder, create `.env` based on `.env.example`:

```bash
cp .env.example .env
```

Set your API keys:
```env
PORT=3001
GEMINI_API_KEY=your_gemini_api_key_here
TAVILY_API_KEY=your_tavily_api_key_here
```

### 3. Run the Backend
```bash
# In the backend directory:
npm install

# Start server:
npm start

# Or with live reload:
npm run dev
```

The server starts on `http://localhost:3001`.

---

## API Reference

### Health Check
`GET /health`
```json
{
  "status": "ok",
  "service": "FindMyScholarshipAI Backend",
  "port": 3001
}
```

### Run Agents Pipeline
`POST /run`
- **Content-Type**: `multipart/form-data`
- **Fields**:
  - `resume`: PDF file (optional or candidate resume)
  - `marksheet`: PDF file (optional or academic transcript)
  - `github_username`: String (e.g. `torvalds` or `octocat`)
  - `target_countries`: String (e.g. `Germany, Canada, United Kingdom`)

#### SSE Event Flow
Responses are streamed with `Content-Type: text/event-stream`:

```
data: {"agent":"profile","status":"working","message":"Extracting candidate profile from documents and GitHub..."}

data: {"agent":"profile","status":"done","message":"Extracted candidate profile successfully."}

data: {"agent":"discovery","status":"working","message":"Searching scholarship opportunities for: Germany, Canada..."}

data: {"agent":"discovery","status":"done","message":"Discovered 10 potential scholarship opportunities."}

data: {"agent":"eligibility","status":"working","message":"Extracting page requirements and assessing eligibility in batches..."}

data: {"agent":"eligibility","status":"done","message":"Evaluated eligibility across 10 opportunities."}

data: {"agent":"ranking","status":"working","message":"Selecting and ranking top 5 matching opportunities..."}

data: {"agent":"ranking","status":"done","message":"Finalized top 5 ranked scholarship opportunities."}

data: {"agent":"sop","status":"working","message":"Drafting tailored Statement of Purpose for the top scholarship..."}

data: {"agent":"sop","status":"done","message":"Statement of Purpose draft completed."}

data: {"agent":"final","data":{"top5":[...],"sop":"# Statement of Purpose\n..."}}
```
