import llm from "../config/llm.js";
import questionPrompt from "../prompts/questionPrompt.js";
import { parseLLMJson } from "../../../shared/utils/llmJson.js";
import { normalizeQuestion } from "../engine/normalize.js";

// Short description of recent answers so the next question stays relevant.
export const describePerformance = (questions = []) =>
    questions
        .filter((q) => q.answered || q.userAnswer)
        .slice(-4)
        .map((q) => {
            const missed = q.feedback?.keyConceptsMissed?.slice(0, 3).join(", ")
            return `- [${q.difficulty}${q.isFollowUp ? ", follow-up" : ""}] ${q.topic || "general"}: ${q.feedback?.score ?? 0}/100${missed ? ` (missed: ${missed})` : ""}`
        })
        .join("\n");

// Writes the next main question at the difficulty chosen by the adaptive engine.
export const questionAgent = async ({ role, type, resume, slot, difficulty, questions }, model = llm) => {
    const response = await model.invoke(questionPrompt({
        role,
        type,
        resume,
        slot,
        difficulty,
        askedQuestions: questions.map((q) => q.question),
        performance: describePerformance(questions),
    }));

    const raw = parseLLMJson(response.content, { expect: "object" });
    const question = normalizeQuestion(raw, {
        difficulty,
        questionType: slot.questionType,
        interviewType: type,
        topic: slot.topic || raw.topic,
    });

    if (!question.question) {
        throw new Error("The AI did not return the next question.");
    }
    return question;
};
