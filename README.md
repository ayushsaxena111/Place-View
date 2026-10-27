# PlaceView (FresherAI)

AI interview practice platform: resume scoring, adaptive AI interviews (verbal, written and coding questions), detailed reports, personalized learning roadmaps and interview-coin billing.

- **Frontend:** React 19 + Vite 8 + Tailwind CSS 4, Redux Toolkit, Monaco editor, Firebase (Google sign-in)
- **Backend:** Node.js (ES modules) + Express 5 microservices behind an API gateway
- **Data:** MongoDB (Mongoose 9), Redis (sessions and caches), GridFS (original resume PDFs)
- **AI:** Groq (`openai/gpt-oss-120b`) via LangChain / LangGraph

```
browser ──► gateway :8000 ──► auth      :6001  (Firebase login, sessions, coins)
             (session check,  resume    :6002  (PDF → analysis, resume history)
              header signing) interview :6003  (adaptive interviews, feedback, reports)
                              roadmap   :6004  (scheduled roadmaps, progress)
                              billing   :6005  (Razorpay orders, coin credit)
```

---

## 1. Prerequisites

- Node.js **20.19+** (22 LTS recommended) and npm
- MongoDB (local or Atlas) — the `MONGODB_URL` you already use
- Redis — `docker compose up -d` in `backend/` starts one on port 6379
- A Groq API key, the Firebase Admin key file (`serviceAccountKey.json`), Razorpay keys, and optionally a YouTube Data API key

## 2. Install dependencies (once)

Run from the project root:

```bash
cd backend && npm install && cd ..                 # shared Redis client (ioredis) + test/helper scripts
cd backend/gateway && npm install && cd ../..
cd backend/services/auth && npm install && cd ../../..
cd backend/services/resume && npm install && cd ../../..
cd backend/services/interview && npm install && cd ../../..
cd backend/services/roadmap && npm install && cd ../../..
cd backend/services/billing && npm install && cd ../../..
cd frontend && npm install && cd ..
```

(`npm ci` also works in every folder; the frontend lockfile was out of sync and has been fixed.)

## 3. Environment setup

Copy each `.env.example` to `.env` in the same folder and fill in your values. **If you already have `.env` files, keep them and only add the new variables:**

| Variable | Add to | Why |
|---|---|---|
| `INTERNAL_SERVICE_SECRET` | gateway, auth, resume, interview, roadmap, billing (**same value everywhere**) | Services only trust requests signed by the gateway; internal coin endpoints require it |
| `AUTH_SERVICE_URL` | resume, interview, roadmap, billing | Paid actions are now charged/credited by the server |
| `INTERVIEW_SERVICE_URL` | roadmap | Interview-based roadmaps read the interview server-side |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

The Firebase Admin key stays at `backend/services/auth/serviceAccountKey.json` (or set `FIREBASE_SERVICE_ACCOUNT_PATH`).

> **Gateway port:** browsers refuse port 6000, so use `PORT=8000` for the gateway and `VITE_BACKEND_URL=http://localhost:8000` in `frontend/.env`. The gateway's default port is now 8000.

Check everything before starting:

```bash
cd backend && npm run check-env
```

## 4. Run — the seven terminals

Start Redis first (`cd backend && docker compose up -d`), then:

| Terminal | Directory | Command | Port |
|---|---|---|---|
| 1 — Gateway | `backend/gateway` | `npm run dev` | 8000 |
| 2 — Auth | `backend/services/auth` | `npm run dev` | 6001 |
| 3 — Resume | `backend/services/resume` | `npm run dev` | 6002 |
| 4 — Interview | `backend/services/interview` | `npm run dev` | 6003 |
| 5 — Roadmap | `backend/services/roadmap` | `npm run dev` | 6004 |
| 6 — Billing | `backend/services/billing` | `npm run dev` | 6005 |
| 7 — Frontend | `frontend` | `npm run dev` | 5173 |

Open http://localhost:5173.

**Optional — one terminal:** `cd backend && npm run dev:all` runs the same seven `npm run dev` commands with prefixed output; Ctrl+C stops them all. The seven-terminal workflow is unchanged.

## 5. Tests and checks

```bash
cd backend && npm test        # 111 tests: shared, gateway, auth, billing, resume, interview, roadmap (needs Redis on 6379)
cd frontend && npm test       # 17 tests: voice-activity detection, echo guard, JS sandbox, roadmap duration
cd frontend && npm run lint   # 0 problems
cd frontend && npm run build  # production build
```

Backend tests run the real routes, controllers, LangGraph flows, prompts and parsers. The LLM is a local fake Groq endpoint and MongoDB storage is replaced in-memory, so no API keys or database are needed. Redis is real (database 15 is flushed during tests).

---

## 6. What's new

### Adaptive interviews
- The AI plans the topics and question types, then writes **one question at a time**. Difficulty follows your answers: one answer ≥ 90 or two in a row ≥ 75 → harder; one answer < 40 or two in a row < 55 → easier; otherwise unchanged. The reason is shown on screen.
- **Follow-up questions** (up to 2 per interview, never chained) probe partially correct answers (45–85).
- Choose 4, 6, 8 or 10 questions. HR interviews are verbal only; at most a third of a technical interview is coding.

### Interview interface
- Each question is labelled **Verbal**, **Written** or **Coding**, with instructions.
- **Continuous microphone:** permission is asked once; the mic stays on for spoken answers, pauses automatically while the interviewer speaks (and for 0.7 s afterwards), and resumes by itself. Phrases matching what the AI just said are discarded (echo guard), the audio stream uses browser echo cancellation, and recognition restarts automatically after silence or network hiccups. A status panel shows Listening / Hearing you / Paused / Muted / errors, with a level meter. Mute, Skip (interrupt the AI) and Repeat question buttons are available.
- Permission denied, no microphone, unplugged microphone, unsupported browser and tab switching are handled; typing always works.
- **Coding questions** get an inline Monaco editor with JavaScript, Python, Java and C++. **JavaScript** runs in a sandboxed Web Worker (5 s limit), **Python** runs with Pyodide (WebAssembly) in a worker (loaded from jsDelivr on first run). Java/C++ can be written and are evaluated by the AI, but cannot run in the browser.
- The timer starts after the question has been read; failed submissions keep your answer and offer **Retry**.

### Question-specific feedback
Per answer: overall and 8 dimension scores, a verdict, feedback that must reference the actual answer, **what was correct**, **what was missing**, **how to improve**, a **model answer** (complete solution + complexity for coding), concepts used / missed and skills shown. Recent feedback is passed back to the model to avoid repetition.

### Interview summary (report)
Weighted overall score (harder questions count more, follow-ups less), difficulty path, summary, strengths, weaknesses, prioritized improvement areas, technical skills and keywords (**only kept if they appear in your answers**), recommendations, question-by-question breakdown, and **verbal communication analysis**: words per minute, filler words (um, uh, ah, oh, er, hmm, "you know") with counts, long pauses (> 2.5 s, measured by voice-activity detection), and an AI clarity rating. If the AI summary fails, scores and per-question feedback are still saved and a **Generate summary** button retries.

### Roadmaps
- Choose **3 months, 6 months, 1 year or a custom duration** (2 weeks – 24 months) and study hours per week.
- Modules are scheduled with dates in proportion to their estimated hours, grouped into **milestones**, and checked for feasibility ("needs ~X h/week").
- **Progress tracking:** mark modules in progress / completed; the roadmap shows % done, expected % by today, and ahead / on track / behind. **Reschedule** re-plans unfinished modules from today.
- **Personalized** from your resume (missing skills, weaknesses) and/or an interview (weaknesses, low-scoring topics, missed concepts). The report has a **Generate / Update personalized roadmap** button; updating keeps progress on modules that remain.
- AI-suggested article links are kept only if they resolve; modules without a link show no button.

### History
A new **History** page (sidebar) lists interviews (view report / continue / delete), every uploaded resume (view analysis, open the original PDF, make it current, delete) and roadmaps with progress. All of it is scoped to the signed-in user.

## 7. API additions

| Method | Path (via gateway) | Purpose |
|---|---|---|
| GET | `/api/interview/history?page=&limit=` | Paginated interview list |
| POST | `/api/interview/:id/summary` | Retry a failed summary |
| DELETE | `/api/interview/:id` | Delete an interview |
| GET | `/api/resume/history` | Resume uploads |
| GET | `/api/resume/history/:id` | One upload's analysis |
| GET | `/api/resume/history/:id/file` | Original PDF |
| POST | `/api/resume/history/:id/activate` | Make an upload the current resume |
| DELETE | `/api/resume/history/:id` | Delete an upload and its file |
| GET | `/api/roadmap/by-interview/:interviewId` | Roadmap built from an interview |
| PATCH | `/api/roadmap/:id/modules/:index` | Set module status |
| POST | `/api/roadmap/:id/reschedule` | Re-plan unfinished modules |
| DELETE | `/api/roadmap/:id` | Delete a roadmap |

`POST /api/interview/start` accepts `questionCount`; `POST /api/interview/answer` accepts `questionIndex`, `answerMode`, `codeLanguage`, `timeTakenSec`, `timedOut`, `speechMetrics`; `POST /api/roadmap/generate` accepts `duration`, `hoursPerWeek`, `startDate`, `interviewId`, `updateRoadmapId`. Existing request fields and response fields are unchanged; new fields are added alongside them. Interviews and roadmaps created before this update still load and work.

## 8. Behaviour changes and bug fixes

**Security**
- Any signed-in user could add unlimited coins with `POST /api/auth/add-coins`, and a negative amount to `use-coins` also added coins. Coin crediting is now internal-only; amounts must be positive whole numbers; deductions are atomic.
- Paid features were only charged by the browser, so the APIs could be called for free (and an interview was created before its coins were taken). Interviews (50), roadmaps (20) and resume analysis (10) are now charged by the server and **refunded automatically if generation fails**. PDF download is still charged from the browser.
- Billing now verifies that an order belongs to the user, compares signatures in constant time, and credits coins server-side exactly once (a failed credit can be retried). A crash caused by an undefined `Payment` reference is fixed.
- Services trusted any `x-user-id` header. The gateway now strips client-supplied identity headers and signs requests with `INTERNAL_SERVICE_SECRET`; services reject unsigned requests and malformed ids.
- A cached roadmap could be read by any user who knew its id. Cache keys now include the user.
- Resume uploads used the original filename on disk (two uploads named `resume.pdf` could overwrite each other) — files now get random names and are checked to really be PDFs.

**Reliability**
- `REDIS_URL` was ignored: `.env` loaded after the Redis client was created. Every service now loads `.env` first.
- Resume PDFs over 1 MB were rejected by the gateway (proxy default limit); the limit now matches the 20 MB upload limit.
- `frontend/vite.config.js` was missing from the repository, so production builds contained no Tailwind classes. Added (React + Tailwind plugins).
- A failed AI summary used to lose the last answer and leave the interview stuck; double-clicking Submit could grade a question twice; LLM output wrapped in prose broke JSON parsing; agent error handlers referenced an undefined variable; start/answer validation used `&&` instead of `||`; resume projects were sent to the AI as `[object Object]`; interview/report pages crashed when loading failed; "Re-upload" on the scorer cleared your resume everywhere; scanned PDFs without text were sent to the AI. All fixed.
- Lint went from 50 problems to 0 (including a Rules-of-Hooks violation from a function named `useCoins`, now `spendCoins`).

## 9. Known limitations

- **Speech input needs Chrome or Edge** (Web Speech API, which uses the browser vendor's online service). Other browsers fall back to typing. Headphones give the best echo protection.
- **Filler-word counts are a lower bound:** browser speech recognition often drops "um"/"uh" from transcripts, and the report says so. Pause measurements come from the audio itself; when audio analysis is unavailable, pauses are reported as "not measured".
- **Python runs** download Pyodide (~10 MB) from cdn.jsdelivr.net on first use; **Monaco** also loads from jsDelivr (as before). Offline, the editor or Python runner shows an error but answers can still be typed/submitted. Java and C++ cannot run in the browser.
- **Verification scope:** everything was tested against the real code with a fake LLM, in-memory MongoDB, real Redis and headless Chromium (fake microphone). It was **not** run against real MongoDB, Groq, Firebase, Razorpay or YouTube, or with a real person speaking — please do one end-to-end pass with your keys.
- Coins for PDF download are still deducted by the browser before printing.
- Existing resumes uploaded before this update appear in history without their original PDF (it was never stored).
