// Shared prompt fragments.

export const formatResume = (resume) => {
    if (!resume) return "Resume: not provided."
    const lines = [
        resume.suggestedRole && `Suggested role: ${resume.suggestedRole}`,
        resume.summary && `Summary: ${resume.summary}`,
        resume.skills?.length && `Skills: ${resume.skills.join(", ")}`,
        resume.projects?.length && `Projects:\n- ${resume.projects.join("\n- ")}`,
        resume.experience?.length && `Experience:\n- ${resume.experience.join("\n- ")}`,
        resume.strengths?.length && `Strengths: ${resume.strengths.join(", ")}`,
        resume.weaknesses?.length && `Weaknesses: ${resume.weaknesses.join(", ")}`,
        resume.missingSkills?.length && `Missing skills: ${resume.missingSkills.join(", ")}`,
    ].filter(Boolean)
    return lines.length ? `Resume:\n${lines.join("\n")}` : "Resume: not provided."
}

export const SOFTWARE_ROLE_HINT = `
Software development roles (Software Engineer, Backend/Frontend/Full Stack, MERN,
Java/Python/Node.js/React developer, Mobile developer, AI/ML Engineer, etc.) get
CODING questions that are solvable in a live interview.
Non-coding roles (HR, Sales, Marketing, Accountant, Business Analyst, UI/UX,
Product Manager, QA, Network/Support/Cloud Engineer, Data Analyst, Cyber Security,
Mechanical/Civil Engineer, etc.) get no coding questions; use WRITTEN practical
scenarios instead (e.g. "How would you test this checkout flow?").
`.trim()

export const QUESTION_TYPE_GUIDE = `
Question types:
- "verbal": answered by speaking — concepts, explanations, comparisons, behavioural questions.
- "written": answered in writing — practical scenarios, queries (e.g. SQL), designs or step-by-step plans that are easier to write than say.
- "coding": write working code in an editor — algorithms, data structures, small implementations.
`.trim()

export const TIMER_GUIDE = `
Timer (seconds) — realistic but achievable:
- verbal: definition 60–75, concept 75–120, comparison 90–120, design discussion 120–180, behavioural 90–150
- written: 180–600 depending on complexity
- coding: easy 300–420, medium 420–600, hard 600–900
`.trim()
