# PlaceView — Adaptive Interview Update

All changes in this drop, what they touch, and what you need to check after running it.

---

## 1. Adaptive question difficulty

Implements the Difficulty Control Node from the flow diagram.

After every answer, the composite score `S(q)` is compared against two thresholds:

| Condition | Action |
|---|---|
| `S(q) >= τ_h` | Raise difficulty — or issue a deeper **follow-up** if already at `hard` |
| `τ_l < S(q) < τ_h` | Retain difficulty |
| `S(q) <= τ_l` | Lower difficulty (floors at `easy`) |

Defaults: `τ_l = 40`, `τ_h = 75`.

### How questions are sourced

The interview agent generates a **pool** of 9 questions up front (3 easy, 3 medium,
3 hard) in a single LLM call — the same cost and latency as the old fixed batch.
The control node then draws from that pool instantly.

A live LLM call happens **only** for the follow-up branch, where the question has
to reference what the candidate actually said. This keeps the wait between
questions the same as before instead of doubling it.

`ensureLadderCoverage()` guarantees at least one question exists at every
difficulty, so the node can never get stuck unable to raise or lower.

### Files

| File | Change |
|---|---|
| `config/adaptive.js` | **New.** Thresholds, ladder, `decideNextDifficulty()`, `pickFromPool()` |
| `prompts/followUpPrompt.js` | **New.** Contextual deeper follow-up |
| `agents/followup.agent.js` | **New.** Returns `null` on failure so the pool is used instead |
| `graph/nodes.js` | **New** `difficultyNode` |
| `graph/graph.js` | `feedbackAgent → difficultyAgent → (summaryAgent \| END)` |
| `graph/state.js` | Added `questionPool`, `decision`, `nextQuestion`, `nextPoolIndex` |
| `agents/interview.agent.js` | Generates + normalizes the pool |
| `prompts/technicalInterviewPrompt.js` | Pool composition instead of fixed Q1–Q6 order |
| `prompts/hrInterviewPrompt.js` | Same, with difficulty bands defined for HR |

---

## 2. Two bugs fixed

### Blank per-question feedback

`agents/feedback.agent.js` and `agents/summary.agent.js` both had:

```js
} catch (error) {
    console.log(response.content);   // `response` is const-scoped inside try
```

Any unparseable model output made the **catch itself** throw a `ReferenceError`,
masking the real error, 500-ing `submitAnswer`, and leaving that question with an
empty `feedback` object — which the report rendered as *"No feedback available."*

Fixed, plus:
- retry (2 attempts)
- JSON recovery for markdown fences, preambles, trailing text, trailing commas
- explicit handling for skipped/empty answers (no LLM call — nothing to evaluate)
- a fallback feedback object so a failed evaluation never costs an answer
- a fallback report (averaged per-question scores) so a failed summary never
  costs the whole interview

### Answer validation

`submitAnswer` used `if (!interviewId && !answer)` — `&&` where `||` was meant, so
a blank answer passed validation and went to the model, which is exactly when
parsing tends to fail. Fixed.

### Also fixed

`summaryNode` received the questions array as captured *before* the final answer's
feedback existed, so the summary agent never saw how the last question went. It
now merges the final answer and feedback in.

---

## 3. Richer per-question feedback

`feedbackPrompt` now returns three new fields alongside the existing eight criteria:

- `strongPoints` — what the candidate actually got right
- `missingPoints` — what a strong answer would have covered but this one didn't
- `revisionAdvice` — named topics to revise, not generic "study more"

The prompt also now requires feedback to reference what was actually said, rather
than text that could apply to any question.

Rendered in `Step3report.jsx` with difficulty and follow-up badges, and an
indicator showing where the difficulty moved and why.

**Note:** the eight scoring criteria are unchanged, per the diagram. "Adaptability"
was implemented as the adaptive difficulty system, not as a ninth criterion.

---

## 4. Mic behaviour

Manual on/off removed. The mic now:

- listens continuously by default
- switches off automatically while the AI is speaking
- switches off automatically while the code editor is open (typed answer)
- switches back on by itself afterwards
- **auto-restarts on `onend`** — browsers silently stop the recogniser after a
  stretch of silence, which is the usual reason a mic "dies" mid-interview
- guards against `InvalidStateError` from double `start()` calls
- degrades gracefully where speech recognition is unavailable

The button is now a status indicator: *Listening… / Mic off — AI is speaking /
Mic off — writing your answer / Mic unavailable — type your answer*.

---

## 5. Roadmap

### Duration is now user-chosen

Presets **1 / 3 / 6 / 12 months** plus a custom value (1–36).

The prompt previously said *"Decide the overall roadmap duration yourself."* It now
treats the chosen window as a hard constraint: module durations must sum to it, and
module count scales with it (4–6 modules for 1 month, up to 14–18 beyond 12 months).
The agent overwrites the model's `duration` with the requested value so the saved
roadmap always matches what was asked for.

### Built from resume *and* interviews

New **Interviews** toggle. When on, the page fetches condensed weak-area data for
that role and passes it to the generator — following the same pattern your code
already uses for resume data (fetched on the frontend, passed in), rather than
coupling the roadmap service to the interview service.

The prompt treats interview data as the strongest signal available, above the
resume: *a resume says what the user claims to know; interview performance shows
what they couldn't explain under pressure.*

---

## 6. Interview history

New page at `/interview/history`, linked in the sidebar.

- search by role, filter by Technical / HR
- expandable rows showing the overall summary, strengths, weaknesses, and **every
  question with its answer and feedback**
- links through to the full report, or resumes an unfinished interview

Uses the existing `/api/interview/all` endpoint — no new caching paths.

---

## New environment variables

All optional, all have defaults.

```
ADAPTIVE_THRESHOLD_LOW=40           # τ_l
ADAPTIVE_THRESHOLD_HIGH=75          # τ_h
INTERVIEW_TOTAL_QUESTIONS=6         # questions per interview
INTERVIEW_POOL_PER_DIFFICULTY=3     # pool size per difficulty level
```

## New API endpoint

```
GET /api/interview/insights?role=<role>
```

Returns condensed weak-area data from completed interviews. Registered **above**
`/:id` in the router — moving it below would make Express match "insights" as an
interview id.

---

## Migration note

Existing interviews predate `totalQuestions` and `questionPool`.

- **Completed interviews** — unaffected, display normally.
- **In-progress interviews** — will load, but can't resume adaptively. Their
  `questions` array already holds all 6 while `totalQuestions` defaults to 6, so
  they complete on the next submitted answer.

New roadmap fields (`durationMonths`, `builtFromResume`, `builtFromInterviews`) are
optional, so existing roadmaps load fine.

---

## What was verified

- `npm run build` — passes
- `npm run lint` — identical count to the original repo; no new warnings introduced
- `node --check` — every backend file
- 18/18 unit tests on the difficulty control logic, including threshold boundaries
  (exactly 40, exactly 75), the easy floor, the hard ceiling, pool exhaustion, and
  malformed input
- 14/14 tests on JSON recovery, covering every malformed-output shape that caused
  the original blank-feedback bug

Simulated 6-question trail for a candidate who starts strong then tires:
`easy → medium → hard → hard(follow-up) → medium → easy`

## What was NOT verified

The app was never run end-to-end — that needs MongoDB, Redis, Firebase and Razorpay
credentials. Pure logic is tested; anything depending on a live LLM or database is
written defensively but needs your smoke test.

### Suggested smoke test

1. Start a technical interview. Answer the first question **well** — the next
   question should be harder, with a "Difficulty raised" badge.
2. Answer the next one **badly** (or let the timer expire) — difficulty should ease.
3. Check the mic indicator: *Listening…* while you speak, *Mic off — AI is speaking*
   during questions, no manual toggle anywhere.
4. Finish the interview and confirm every question has feedback with strong points,
   missing points and revision advice.
5. Open **Interview History** from the sidebar and expand the interview.
6. Generate a roadmap with duration **1 month** and the Interviews toggle on —
   confirm the plan actually fits one month and targets your weak areas.
