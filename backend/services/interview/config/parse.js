/**
 * Helpers for turning raw LLM output into usable JSON.
 *
 * Models occasionally wrap JSON in markdown fences, prepend a sentence, or
 * emit a trailing comma. Rather than letting a single malformed response blow
 * up a whole request, these helpers clean what they can and report failure
 * clearly instead of throwing from inside a catch block.
 */

/**
 * Strip markdown fences and any text sitting outside the outermost JSON value.
 */
export const cleanJsonText = (raw = "") => {
    let text = String(raw)
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

    // Trim anything before the first { or [ and after the matching last } or ].
    const firstObject = text.indexOf("{");
    const firstArray = text.indexOf("[");

    const candidates = [firstObject, firstArray].filter((i) => i !== -1);

    if (candidates.length) {
        const start = Math.min(...candidates);

        const lastObject = text.lastIndexOf("}");
        const lastArray = text.lastIndexOf("]");
        const end = Math.max(lastObject, lastArray);

        if (end > start) {
            text = text.slice(start, end + 1);
        }
    }

    // Remove trailing commas before a closing brace or bracket.
    text = text.replace(/,(\s*[}\]])/g, "$1");

    return text.trim();
};

/**
 * Parse LLM output into JSON.
 * Returns { ok: true, data } or { ok: false, error, raw } — never throws.
 */
export const safeJsonParse = (raw) => {
    try {
        return { ok: true, data: JSON.parse(cleanJsonText(raw)) };
    } catch (error) {
        return {
            ok: false,
            error: error.message,
            raw: String(raw || "").slice(0, 500),
        };
    }
};

/**
 * Call an async function, retrying a limited number of times.
 * Used so one malformed model response doesn't cost the user their answer.
 */
export const withRetry = async (fn, { attempts = 2, label = "LLM call" } = {}) => {
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await fn(attempt);
        } catch (error) {
            lastError = error;

            console.log(
                `${label} failed on attempt ${attempt} of ${attempts}: ${error.message}`
            );
        }
    }

    throw lastError;
};
