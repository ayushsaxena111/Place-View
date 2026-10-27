import { formatResume, QUESTION_TYPE_GUIDE, SOFTWARE_ROLE_HINT, TIMER_GUIDE } from "./context.js"

// Start of an adaptive interview: plan the topics and question types, and
// write only the first (easy, warm-up) question. Later questions are written
// one at a time at a difficulty chosen from the candidate's answers.
const planPrompt = ({ role, type, resume, questionCount }) => {
    const isHr = String(type).toLowerCase() === "hr"

    return `
You are a ${isHr ? "Senior HR Interviewer" : "Senior Technical Interviewer"} with 15+ years of experience.
You are planning an ADAPTIVE ${isHr ? "HR" : "technical"} interview.

Candidate role: ${role}
${formatResume(resume)}

Plan exactly ${questionCount} main questions. For each, choose a topic and a question type.
Difficulty is decided later from the candidate's answers, so do NOT assign difficulty to the plan.

${QUESTION_TYPE_GUIDE}

Rules:
${isHr
        ? `- HR interviews use ONLY "verbal" questions.
- Cover a varied mix of: introduction, communication, teamwork, conflict resolution, leadership,
  career goals, problem solving, strengths/weaknesses, adaptability, pressure, decision making, company fit.`
        : `- Cover the most important skills for the role; no two slots on the same topic.
- ${SOFTWARE_ROLE_HINT.replace(/\n/g, "\n  ")}
- For software roles, include 1–2 "coding" slots, placed in the second half.
- Use "written" for practical scenarios or queries that are better written than spoken.
- Most remaining slots are "verbal".`}
- If a resume is provided, personalise topics using the candidate's skills, projects and experience,
  and include at least one topic that probes a listed weakness or missing skill.
- Topics are short labels, e.g. "REST API design", "Conflict resolution", "SQL joins".

Then write the FIRST question for plan slot 1 at EASY difficulty (a warm-up).
${TIMER_GUIDE}

Return ONLY valid JSON (no markdown, no explanation):

{
  "plan": [
    { "topic": "", "questionType": "verbal" }
  ],
  "firstQuestion": {
    "question": "",
    "timer": 90
  }
}
`
}

export default planPrompt
