import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import llm from "../config/llm.js";
import { parseLLMJson } from "../../../shared/utils/llmJson.js";
import { normalizeResumeAnalysis } from "../utils/normalizeResume.js";

// Keep prompts within model limits; real resumes are far shorter than this.
const MAX_RESUME_CHARS = 30000;

export const RESUME_SYSTEM_PROMPT = `
You are an Expert ATS Resume Analyzer.

Analyze the given resume.

Extract the following information:

- Full Name
- Email
- Phone Number
- Professional Summary
- Technical Skills
- Projects
- Education
- Experience
- Strengths
- Weaknesses
- Missing Skills
- Suggested Job Role
- ATS Score (0-100)
- Recommendations

IMPORTANT RULES:

1. Return ONLY valid JSON.
2. Do not use markdown.
3. Do not explain anything.
4. Do not add extra text.
5. Every field must exist.
6. The ATS Score must be a number between 0 and 100.
7. If information is not available, return an empty string or empty array.
8. Do not wrap the JSON inside a code block.
9. Only extract information that is actually present in the resume. Never invent details.

Response Format:

{
    "name": "",
    "email": "",
    "phone": "",
    "summary": "",
    "skills": [],
    "projects": [{ "title": "", "duration": "", "description": "", "technologies": [] }],
    "education": [{ "institution": "", "degree": "", "field": "", "years": "", "details": "" }],
    "experience": [{ "company": "", "role": "", "duration": "", "description": "", "technologies": [] }],
    "strengths": [],
    "weaknesses": [],
    "missingSkills": [],
    "suggestedRole": "",
    "score": 0,
    "recommendations": []
}
`;

export const resumeAgent = async (resumeText, model = llm) => {
    const response = await model.invoke([
        new SystemMessage(RESUME_SYSTEM_PROMPT),
        new HumanMessage(String(resumeText).slice(0, MAX_RESUME_CHARS))
    ]);

    return normalizeResumeAnalysis(parseLLMJson(response.content, { expect: "object" }));
};
