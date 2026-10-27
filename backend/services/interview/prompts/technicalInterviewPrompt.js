const technicalInterviewPrompt = ({
  role,
  useResume,
  resume,
  perDifficulty = 3,
}) => `

You are a Senior Technical Interviewer.

Generate a POOL of realistic technical interview questions.

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

Do NOT repeat the same topic across questions.

Each object must contain ONLY:

- question
- difficulty
- timer

Difficulty must be ONLY:

- easy
- medium
- hard

Never use

- coding
- practical
- technical
- hr

as difficulty.

=========================
DIFFICULTY MEANING
=========================

easy

Core definitions and fundamentals a candidate should answer without thinking hard.

medium

Applied understanding, comparisons, trade-offs, and "how would you use this" questions.

hard

Deep reasoning, system design, debugging under constraints, or a coding problem.

=========================
Question Rules
=========================

Generate conceptual and technical interview questions according to the candidate role.

Examples

Backend

- Node.js
- Express
- MongoDB
- SQL
- API
- Authentication
- Redis
- System Design

Frontend

- React
- JavaScript
- HTML
- CSS
- Performance
- State Management

DevOps

- Docker
- Kubernetes
- AWS
- CI/CD

Data Science

- ML
- Python
- Statistics

etc.

Resume should influence the questions if available.

=========================
HARD QUESTIONS
=========================

If the candidate belongs to a SOFTWARE DEVELOPMENT role such as:

- Software Engineer
- Backend Developer
- Frontend Developer
- Full Stack Developer
- MERN Developer
- Java Developer
- Python Developer
- Node.js Developer
- React Developer
- Mobile Developer
- AI Engineer

At least ${Math.max(1, perDifficulty - 1)} of the "hard" questions must be CODING questions.

Coding is ONLY a question type.

Difficulty remains "hard".

The question should be solvable during a live interview.

Examples

- Implement LRU Cache
- Reverse Linked List
- Debounce Function
- Design Rate Limiter
- Build REST API
- Binary Tree Traversal

Timer should be decided according to the coding complexity.

Usually between

600-1800 seconds.

Do NOT always use the same timer.

----------------------------

If the candidate belongs to ANY NON-CODING role such as

- HR
- Sales
- Marketing
- Accountant
- Business Analyst
- UI/UX
- Product Manager
- QA
- Network Engineer
- Support Engineer
- Data Analyst
- Cyber Security
- Cloud Engineer
- Mechanical Engineer
- Civil Engineer

Generate PRACTICAL ROLE-SPECIFIC interview questions.

These should simulate real interview scenarios.

Examples

Sales

"Sell me this laptop."

Marketing

"How would you launch a new product?"

UI/UX

"Improve this login page experience."

Cloud

"Your production server suddenly crashes. What will you do?"

Cyber Security

"User credentials are leaked. Explain your response."

QA

"How would you test this e-commerce checkout flow?"

The timer should be based on the complexity.

Generally between

180-600 seconds.

=========================
Timer Rules
=========================

The interview should feel like a real live technical interview.

Give slightly less time to create realistic interview pressure.

Minimum timer = 60 seconds.

Do NOT assign fixed timers.

Choose the timer according to the expected complexity.

Recommended ranges:

Basic definition
60-75 sec

Concept explanation
75-120 sec

Comparison questions
90-120 sec

Architecture / Design discussion
120-180 sec

Debugging scenarios
120-240 sec

Practical role-based scenarios
180-300 sec

Coding Questions

Easy coding
300-420 sec

Medium coding
420-600 sec

Hard coding
600-900 sec

Do NOT always use the maximum time.

The timer should feel challenging but achievable in a live interview.

=========================

Return ONLY a JSON array.

Example

[
  {
    "question":"Explain the event loop.",
    "difficulty":"easy",
    "timer":90
  },
  {
    "question":"Compare optimistic and pessimistic locking.",
    "difficulty":"medium",
    "timer":120
  },
  {
    "question":"Implement an LRU Cache.",
    "difficulty":"hard",
    "timer":1200
  }
]

No markdown.

No explanation.

No extra text.

`;

export default technicalInterviewPrompt;
