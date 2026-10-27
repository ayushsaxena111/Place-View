import llm from "../config/llm.js";
import hrInterviewPrompt from "../prompts/hrInterviewPrompt.js";
import technicalInterviewPrompt from "../prompts/technicalInterviewPrompt.js";
import { safeJsonParse, withRetry } from "../config/parse.js";
import {
    DIFFICULTY_LADDER,
    normalizeDifficulty,
    POOL_PER_DIFFICULTY,
} from "../config/adaptive.js";

/**
 * Turn raw model output into a clean question pool.
 * Anything malformed is dropped rather than allowed to reach the database.
 */
const normalizePool = (raw) => {
    const list = Array.isArray(raw) ? raw : raw?.questions;

    if (!Array.isArray(list)) return [];

    return list
        .filter((item) => item && typeof item.question === "string" && item.question.trim())
        .map((item) => {
            const timer = Number(item.timer);

            return {
                question: item.question.trim(),
                difficulty: normalizeDifficulty(item.difficulty),
                timer: Number.isFinite(timer) && timer >= 60 ? Math.round(timer) : 90,
                used: false,
            };
        });
};

/**
 * Guarantee at least one question exists at every difficulty level.
 *
 * If the model under-delivers on a level, the nearest available question is
 * duplicated down or up so the Difficulty Control Node always has somewhere to
 * move. Without this, an interview could get stuck unable to raise or lower.
 */
const ensureLadderCoverage = (pool) => {
    if (pool.length === 0) return pool;

    const result = [...pool];

    for (const difficulty of DIFFICULTY_LADDER) {
        const hasLevel = result.some(
            (item) => normalizeDifficulty(item.difficulty) === difficulty
        );

        if (!hasLevel) {
            const donor = result.find((item) => !item.borrowed) || result[0];

            result.push({
                ...donor,
                difficulty,
                borrowed: true,
                used: false,
            });
        }
    }

    return result;
};

/**
 * Generates the full question pool for an interview.
 *
 * The pool spans all three difficulty levels up front in a single call, so the
 * Difficulty Control Node can serve the next question instantly rather than
 * waiting on a second model round-trip between every question.
 */
export const interviewAgent = async (data) => {
    try {
        const promptInput = {
            ...data,
            perDifficulty: POOL_PER_DIFFICULTY,
        };

        const prompt =
            data.type?.toLowerCase() === "hr"
                ? hrInterviewPrompt(promptInput)
                : technicalInterviewPrompt(promptInput);

        const result = await withRetry(
            async () => {
                const response = await llm.invoke(prompt);

                const parsed = safeJsonParse(response?.content);

                if (!parsed.ok) {
                    console.log("Interview Agent parse failure:", parsed.error);
                    console.log("Raw model output:", parsed.raw);

                    throw new Error("Question pool response was not valid JSON");
                }

                const pool = normalizePool(parsed.data);

                if (pool.length === 0) {
                    throw new Error("Question pool came back empty");
                }

                return pool;
            },
            { attempts: 2, label: "Interview Agent" }
        );

        return ensureLadderCoverage(result);
    } catch (error) {
        console.log("Interview Agent Error:", error.message);

        throw new Error(
            error.message || "Failed to generate interview questions."
        );
    }
};
