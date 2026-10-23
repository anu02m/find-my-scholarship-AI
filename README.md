# FindMyScholarshipAI

An autonomous academic intelligence platform that analyzes student profiles (resume, transcript, GitHub), discovers real international scholarship opportunities via search and live page extraction, strictly verifies eligibility without hallucinated deadlines, ranks top matches, and drafts tailored Statements of Purpose (SOP).

Progress and results are streamed in real time via Server-Sent Events (SSE) to a clean, framework-free frontend.

---

## Architecture & Agent Data Flow

```mermaid
flowchart TD
    subgraph Client ["Client Interface (Frontend)"]
        UI["Web Form Inputs:<br/>Resume PDF, Marksheet PDF,<br/>GitHub Username, Target Countries"]
        SSEListener["SSE Stream Listener<br/>(Live Agent Cards + Results)"]
    end

    subgraph Backend ["5-Agent Sequential Pipeline (Node.js + Express)"]
        %% Agent 1
        A1["1. Profile Agent"]
        PDF["pdf-parse (Resume & Transcript)"]
        GH["GitHub REST API (Repos & Languages)"]
        G1["Gemini 3.5 Flash"]

        UI -->|POST /run multipart/form-data| A1
        A1 --> PDF & GH
        PDF & GH --> G1
        G1 -->|Profile JSON: skills, CGPA, projects| A2["2. Discovery Agent"]

        %% Agent 2
        TavSearch["Tavily Search API<br/>(Target Countries)"]
        G2["Gemini Opportunity Extraction"]
        A2 --> TavSearch --> G2
        G2 -->|10+ Real Opportunities| A3["3. Eligibility Agent"]

        %% Agent 3
        subgraph EligibilityFlow ["Eligibility Verification (Batches of 3)"]
            TavExt["Tavily Extract API<br/>(Raw Official Webpages)"]
            ExtCheck{"Page readable?"}
            Unverified["Mark as 'unverified'<br/>fit_score = 0"]
            G3["Gemini Evaluation<br/>(429/503 Retries & Fallback)"]
            
            A3 --> TavExt --> ExtCheck
            ExtCheck -->|No / Failed| Unverified
            ExtCheck -->|Yes| G3
        end

        Unverified --> A4["4. Ranking Agent"]
        G3 -->|Matched, Missing, Fit Scores| A4

        %% Agent 4
        A4 --> DCheck{"Deadline on page?"}
        DCheck -->|No| DNotFound["Set deadline = 'not found'<br/>(Zero Hallucination)"]
        DCheck -->|Yes| DVerified["Keep exact verified date"]
        DNotFound & DVerified --> Top5["Select Top 5 Opportunities"]

        %% Agent 5
        Top5 -->|Top #1 Opportunity + Profile| A5["5. SOP Agent"]
        A5 --> G5["Gemini SOP Generation"]
        G5 --> FinalEvent["Final SSE Dispatch<br/>{ agent: 'final', data: { top5, sop } }"]
        
        %% Stream to frontend
        A1 -.->|SSE Progress| SSEListener
        A2 -.->|SSE Progress| SSEListener
        A3 -.->|SSE Progress| SSEListener
        A4 -.->|SSE Progress| SSEListener
        A5 -.->|SSE Progress| SSEListener
        FinalEvent -->|Render Cards & SOP| SSEListener
    end

    classDef agent fill:#1e293b,stroke:#3b82f6,stroke-width:2px,color:#f8fafc;
    classDef fallback fill:#451a03,stroke:#f59e0b,stroke-width:1.5px,color:#fef3c7;
    class A1,A2,A3,A4,A5 agent;
    class Unverified,DNotFound fallback;
```

---

## Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher; tested on v24)
- npm

### 2. Configure API Keys
You will need API keys from:
- **Google Gemini API**: [Google AI Studio](https://aistudio.google.com/)
- **Tavily Search API**: [Tavily](https://tavily.com/)

In `backend/`, copy `.env.example` to `.env`:
```bash
cd backend
cp .env.example .env
```
Open `backend/.env` and paste your keys:
```env
PORT=3001
GEMINI_API_KEY=your_gemini_api_key_here
TAVILY_API_KEY=your_tavily_api_key_here
```

### 3. Install & Start Backend
```bash
# In backend/ directory:
npm install
npm start
```
The backend server starts listening on `http://localhost:3001`.

### 4. Open Frontend
You can launch the frontend using any static file server:
```bash
# From project root:
npx serve frontend -l 3000
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

*(Alternatively, you can open `frontend/index.html` directly in your browser without any server).*

---

## Instant Demo Fallback
If you are presenting or testing without active API credits:
- Click the **"Load demo result"** button in the web interface.
- It calls `GET http://localhost:3001/demo`, which replays a cached successful run sequence with ~1 second delay between agent stages, guaranteeing a seamless presentation under any network condition.

---

## Anti-Hallucination & Resilience Features
- **Strict Deadline Integrity**: Deadlines are never invented. If a deadline date is not explicitly present in the extracted HTML of the scholarship page, it strictly outputs `"not found"`.
- **Free-Tier Rate Limit Protection**: Eligibility evaluations run in batches of 3 to respect Gemini API RPM/TPM limits.
- **Backoff & Fallback**: Retries with exponential backoff on HTTP 429 and 503 errors, and cascades dynamically between `gemini-3.5-flash`, `gemini-flash-latest`, and `gemini-3.8-flash`.
- **Fault-Tolerant Streaming**: If any individual agent fails, an error SSE event is emitted and the stream proceeds with partial data rather than aborting the connection.
