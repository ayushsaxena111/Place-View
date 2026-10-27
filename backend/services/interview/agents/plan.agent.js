import llm from "../config/llm.js";
import planPrompt from "../prompts/planPrompt.js";
import { parseLLMJson } from "../../../shared/utils/llmJson.js";
import { normalizePlan } from "../engine/adaptive.js";
import { normalizeQuestion } from "../engine/normalize.js";

const MIN_PLAN_LENGTH = 3;

// Plans the interview and writes the first (easy) question.
export const planAgent = async ({ role, type, resume, questionCount }, model = llm) => {
    const response = await model.invoke(planPrompt({ role, type, resume, questionCount }));
    const raw = parseLLMJson(response.content, { expect: "object" });

    const plan = normalizePlan(raw.plan, { questionCount, interviewType: type });
    if (plan.length < Math.min(MIN_PLAN_LENGTH, questionCount)) {
        throw new Error("The AI returned an incomplete interview plan.");
    }

    const first = normalizeQuestion(raw.firstQuestion || {}, {
        difficulty: "easy",
        questionType: plan[0].questionType,
        interviewType: type,
        topic: plan[0].topic,
    });
    if (!first.question) {
        throw new Error("The AI did not return a first question.");
    }

    return {
        plan,
        firstQuestion: { ...first, difficultyReason: "Warm-up question to start the interview." },
    };
};
