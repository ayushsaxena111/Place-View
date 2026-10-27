const hrInterviewPrompt = ({
  role,
  useResume,
  resume,
  perDifficulty = 3,
}) => `

You are a Senior HR Interviewer with 15+ years of experience.

Generate a POOL of realistic HR interview questions.

The interview is ADAPTIVE. Questions are not asked in a fixed order.
A difficulty control node selects the next question at run time based on how
well the candidate is performing, so you must supply questions at every
difficulty level.

Return VALID JSON only.

Candidate Role:
${role}

Resume Available:
${useResume ? "YES" : "NO"}

${
useResume
? `
Resume

Summary:
${resume?.summary}

Skills:
${resume?.skills?.join(", ")}

Projects:
${resume?.projects?.join(", ")}

Strengths:
${resume?.strengths?.join(", ")}

Weaknesses:
${resume?.weaknesses?.join(", ")}

Missing Skills:
${resume?.missingSkills?.join(", ")}

Recommendations:
${resume?.recommendations?.join(", ")}
`
: ""
}

=========================
POOL COMPOSITION
=========================

Generate EXACTLY ${perDifficulty} questions at difficulty "easy".

Generate EXACTLY ${perDifficulty} questions at difficulty "medium".

Generate EXACTLY ${perDifficulty} questions at difficulty "hard".

Total: EXACTLY ${perDifficulty * 3} questions.

Every question must be independently askable.

Do NOT write questions that depend on a previous question being asked first,
because the order is decided at run time.

Do NOT number the questions inside the question text.

Do NOT repeat the same theme across questions.

Each object must contain ONLY:

- question
- difficulty
- timer

Difficulty must be ONLY:

- easy
- medium
- hard

Never use:

- coding
- technical
- hr
- practical

as difficulty.

=========================
DIFFICULTY MEANING
=========================

easy

Warm-up and self-description questions.
Introduction, strengths, career goals, why this role.

medium

Behavioural questions that need a concrete past example.
Teamwork, communication, handling feedback, meeting deadlines.

hard

Pressure and judgement questions with no comfortable answer.
Conflict with a manager, ethical dilemmas, failure, competing priorities,
handling rejection, defending an unpopular decision.

=========================
COVERAGE
=========================

Across the pool, questions should cover:

- Introduction
- Communication
- Teamwork
- Conflict Resolution
- Leadership
- Career Goals
- Problem Solving
- Strengths
- Weaknesses
- Adaptability
- Work Pressure
- Decision Making
- Company Fit

If resume is available,

personalize questions using:

- projects
- skills
- experience
- strengths
- weaknesses

=========================
Timer Rules
=========================

The interview should simulate a real HR interview.

Give only enough time for a focused answer.

Minimum timer = 60 seconds.

Choose the timer based on question complexity.

Recommended ranges:

Self Introduction
60-90 sec

Strengths / Weaknesses
60-90 sec

Career Goals
60-90 sec

Behavioral Questions
90-120 sec

Conflict Resolution
90-120 sec

Leadership
90-150 sec

Situation Based Questions
120-180 sec

Decision Making
120-180 sec

Do NOT always use the maximum time.

The timer should create realistic interview pressure.

=========================

Return ONLY a JSON array.

Example

[
  {
    "question":"Tell me about yourself.",
    "difficulty":"easy",
    "timer":90
  },
  {
    "question":"Describe a time you disagreed with a teammate and how you resolved it.",
    "difficulty":"medium",
    "timer":120
  },
  {
    "question":"Tell me about a decision you made that failed, and what it cost.",
    "difficulty":"hard",
    "timer":150
  }
]

No markdown.

No explanation.

No extra text.

`;

export default hrInterviewPrompt;
