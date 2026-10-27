/**
 * Adaptive interview configuration.
 *
 * This file holds every tunable number used by the Difficulty Control Node,
 * so thresholds can be changed in one place instead of across the codebase.
 */

// Composite score thresholds used by the difficulty control node.
//   score >= HIGH  -> raise difficulty (or issue a follow-up if already hard)
//   score <= LOW   -> lower difficulty
//   otherwise      -> retain difficulty
export const SCORE_THRESHOLDS = {
    low: Number(process.env.ADAPTIVE_THRESHOLD_LOW) || 40,
    high: Number(process.env.ADAPTIVE_THRESHOLD_HIGH) || 75,
};

// Ordered easiest -> hardest.
export const DIFFICULTY_LADDER = ["easy", "medium", "hard"];

// How many questions a single interview runs for.
export const DEFAULT_TOTAL_QUESTIONS =
    Number(process.env.INTERVIEW_TOTAL_QUESTIONS) || 6;

// How many questions the interview agent pre-generates per difficulty level.
export const POOL_PER_DIFFICULTY =
    Number(process.env.INTERVIEW_POOL_PER_DIFFICULTY) || 3;

/**
 * Coerce any model output into a valid ladder value.
 * The LLM occasionally returns "Easy", "EASY" or something off-list.
 */
export const normalizeDifficulty = (value) => {
    const cleaned = String(value || "").trim().toLowerCase();

    return DIFFICULTY_LADDER.includes(cleaned) ? cleaned : "easy";
};

/**
 * The Difficulty Control Node.
 *
 * Compares the composite score S(q) against the thresholds and returns the
 * action to take plus the difficulty the next question should be served at.
 *
 * Returns: { action, from, to, score, reason }
 *   action is one of: "raise" | "retain" | "lower" | "follow-up"
 */
export const decideNextDifficulty = ({ score, currentDifficulty }) => {
    const from = normalizeDifficulty(currentDifficulty);
    const index = DIFFICULTY_LADDER.indexOf(from);

    const safeScore = Number.isFinite(Number(score)) ? Number(score) : 0;

    const { low, high } = SCORE_THRESHOLDS;

    // Strong answer -> push harder.
    if (safeScore >= high) {
        const atTop = index >= DIFFICULTY_LADDER.length - 1;

        if (atTop) {
            return {
                action: "follow-up",
                from,
                to: from,
                score: safeScore,
                reason: "Strong answer at the highest difficulty, probing deeper with a follow-up.",
            };
        }

        return {
            action: "raise",
            from,
            to: DIFFICULTY_LADDER[index + 1],
            score: safeScore,
            reason: "Strong answer, raising difficulty.",
        };
    }

    // Weak answer -> ease off.
    if (safeScore <= low) {
        const atBottom = index <= 0;

        if (atBottom) {
            return {
                action: "retain",
                from,
                to: from,
                score: safeScore,
                reason: "Weak answer but already at the lowest difficulty.",
            };
        }

        return {
            action: "lower",
            from,
            to: DIFFICULTY_LADDER[index - 1],
            score: safeScore,
            reason: "Weak answer, lowering difficulty.",
        };
    }

    // In between -> hold steady.
    return {
        action: "retain",
        from,
        to: from,
        score: safeScore,
        reason: "Answer within the expected band, holding difficulty.",
    };
};

/**
 * Pick the next unused question from the pre-generated pool.
 *
 * Tries the target difficulty first, then walks outwards along the ladder so a
 * partially exhausted pool never stalls the interview.
 *
 * Returns: { question, poolIndex } or null when the pool is fully used.
 */
export const pickFromPool = (pool = [], targetDifficulty = "easy") => {
    if (!Array.isArray(pool) || pool.length === 0) return null;

    const target = normalizeDifficulty(targetDifficulty);
    const targetIndex = DIFFICULTY_LADDER.indexOf(target);

    // Search order: exact target, then nearest levels by distance.
    const searchOrder = [...DIFFICULTY_LADDER].sort(
        (a, b) =>
            Math.abs(DIFFICULTY_LADDER.indexOf(a) - targetIndex) -
            Math.abs(DIFFICULTY_LADDER.indexOf(b) - targetIndex)
    );

    for (const difficulty of searchOrder) {
        const poolIndex = pool.findIndex(
            (item) =>
                !item?.used && normalizeDifficulty(item?.difficulty) === difficulty
        );

        if (poolIndex !== -1) {
            return { question: pool[poolIndex], poolIndex };
        }
    }

    return null;
};
