import llm from "../config/llm.js";
import followUpPrompt from "../prompts/followUpPrompt.js";
import { safeJsonParse, withRetry } from "../config/parse.js";
import { normalizeDifficulty } from "../config/adaptive.js";

/**
 * Generates a single deeper follow-up question.
 *
 * Used only by the "follow-up" branch of the Difficulty Control Node, when the
 * candidate scored above the high threshold while already at the top of the
 * difficulty ladder.
 *
 * Returns a question object, or null so the caller can fall back to the pool.
 */
export const followupAgent = async (data) => {
    try {
        const result = await withRetry(
            async () => {
                const response = await llm.invoke(followUpPrompt(data));

                const parsed = safeJsonParse(response?.content);

                if (!parsed.ok) {
                    console.log("Follow-up Agent parse failure:", parsed.error);
                    console.log("Raw model output:", parsed.raw);

                    throw new Error("Follow-up response was not valid JSON");
                }

                return parsed.data;
            },
            { attempts: 2, label: "Follow-up Agent" }
        );

        // The model sometimes returns an array even when asked for one object.
        const item = Array.isArray(result) ? result[0] : result;

        if (!item || typeof item.question !== "string" || !item.question.trim()) {
            return null;
        }

        const timer = Number(item.timer);

        return {
            question: item.question.trim(),
            difficulty: normalizeDifficulty(item.difficulty || data?.difficulty),
            timer: Number.isFinite(timer) && timer >= 60 ? Math.round(timer) : 120,
        };
    } catch (error) {
        console.log("Follow-up Agent Error:", error.message);

        // Caller falls back to the pre-generated pool.
        return null;
    }
};
