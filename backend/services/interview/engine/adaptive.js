// Deterministic adaptive-interview rules. Kept free of I/O so they can be unit
// tested and reasoned about independently of the LLM.

export const LEVELS = ["easy", "medium", "hard"]

export const THRESHOLDS = Object.freeze({
    outstanding: 90, // one answer at or above this moves difficulty up
    strong: 75,      // two consecutive answers at or above this move it up
    gap: 40,         // one answer below this moves difficulty down
    weak: 55,        // two consecutive answers below this move it down
    followUpMin: 45, // follow-ups probe partially-correct answers only
    followUpMax: 85,
})

export const DEFAULT_MAX_FOLLOW_UPS = 2

const levelIndex = (level) => {
    const i = LEVELS.indexOf(level)
    return i === -1 ? 0 : i
}

export const normalizeLevel = (level) => LEVELS[levelIndex(String(level || "").toLowerCase())]

/**
 * Decide the difficulty of the next question.
 * @param {string} current - difficulty of the question just answered
 * @param {number[]} scores - scores of answered questions, oldest first
 */
export const decideNextDifficulty = (current, scores = []) => {
    const level = normalizeLevel(current)
    const last = scores.at(-1)
    const prev = scores.length > 1 ? scores.at(-2) : null

    if (last === undefined || last === null) {
        return { difficulty: level, change: 0, reason: "Starting difficulty." }
    }

    const wantsUp = last >= THRESHOLDS.outstanding || (prev !== null && last >= THRESHOLDS.strong && prev >= THRESHOLDS.strong)
    const wantsDown = last < THRESHOLDS.gap || (prev !== null && last < THRESHOLDS.weak && prev < THRESHOLDS.weak)

    if (wantsUp) {
        if (level === "hard") {
            return { difficulty: "hard", change: 0, reason: `Strong answer (${last}/100) — staying at the highest difficulty.` }
        }
        const next = LEVELS[levelIndex(level) + 1]
        const why = last >= THRESHOLDS.outstanding
            ? `Excellent answer (${last}/100)`
            : `Consistently strong answers (${prev} and ${last})`
        return { difficulty: next, change: 1, reason: `${why} — increasing difficulty to ${next}.` }
    }

    if (wantsDown) {
        if (level === "easy") {
            return { difficulty: "easy", change: 0, reason: `Knowledge gaps detected (${last}/100) — staying at easy to rebuild foundations.` }
        }
        const next = LEVELS[levelIndex(level) - 1]
        const why = last < THRESHOLDS.gap
            ? `The answer showed clear knowledge gaps (${last}/100)`
            : `Two weaker answers in a row (${prev} and ${last})`
        return { difficulty: next, change: -1, reason: `${why} — easing difficulty to ${next}.` }
    }

    return { difficulty: level, change: 0, reason: `Mixed performance (${last}/100) — keeping difficulty at ${level}.` }
}

/**
 * Should the next question be a follow-up that probes the answer just given?
 */
export const shouldAskFollowUp = ({ feedback, question, followUpsUsed = 0, maxFollowUps = DEFAULT_MAX_FOLLOW_UPS }) => {
    if (!question || question.isFollowUp) return false
    if (followUpsUsed >= maxFollowUps) return false
    const followUp = feedback?.followUp
    if (!followUp?.needed || !followUp?.question?.trim()) return false
    const score = Number(feedback?.score)
    if (!Number.isFinite(score)) return false
    return score >= THRESHOLDS.followUpMin && score <= THRESHOLDS.followUpMax
}

/** Count answered main questions and follow-ups. */
export const countProgress = (questions = []) => {
    let mainAnswered = 0
    let followUpsUsed = 0
    let mainAsked = 0
    for (const q of questions) {
        if (q.isFollowUp) {
            followUpsUsed++
        } else {
            mainAsked++
            if (q.answered || q.userAnswer) mainAnswered++
        }
    }
    return { mainAnswered, followUpsUsed, mainAsked }
}

const DIFFICULTY_WEIGHT = { easy: 1, medium: 1.2, hard: 1.4 }
const FOLLOW_UP_WEIGHT = 0.6

/**
 * Weighted overall score: harder questions count more, follow-ups count less.
 * Returns null when nothing has been scored.
 */
export const computeOverallScore = (questions = []) => {
    let total = 0
    let weightSum = 0
    for (const q of questions) {
        if (!(q.answered || q.userAnswer)) continue
        const score = Number(q.feedback?.score)
        if (!Number.isFinite(score)) continue
        const weight = (DIFFICULTY_WEIGHT[normalizeLevel(q.difficulty)] || 1) * (q.isFollowUp ? FOLLOW_UP_WEIGHT : 1)
        total += score * weight
        weightSum += weight
    }
    if (weightSum === 0) return null
    return Math.round(total / weightSum)
}

/** Timer bounds (seconds) per question type. */
export const TIMER_BOUNDS = Object.freeze({
    verbal: { min: 60, max: 300, fallback: 120 },
    written: { min: 120, max: 900, fallback: 300 },
    coding: { min: 300, max: 1800, fallback: 900 },
})

export const clampTimer = (value, questionType = "verbal") => {
    const bounds = TIMER_BOUNDS[questionType] || TIMER_BOUNDS.verbal
    const n = Math.round(Number(value))
    if (!Number.isFinite(n) || n <= 0) return bounds.fallback
    return Math.max(bounds.min, Math.min(bounds.max, n))
}

export const QUESTION_TYPES = ["verbal", "written", "coding"]

export const normalizeQuestionType = (value, interviewType) => {
    if (String(interviewType).toLowerCase() === "hr") return "verbal"
    const v = String(value || "").toLowerCase().trim()
    if (v === "coding" || v === "code") return "coding"
    if (v === "written" || v === "practical" || v === "scenario") return "written"
    return "verbal"
}

/**
 * Validate an LLM-produced plan. HR interviews are verbal only; at most a
 * third of a technical interview is coding.
 */
export const normalizePlan = (plan, { questionCount, interviewType }) => {
    const slots = Array.isArray(plan) ? plan : []
    const out = []
    const maxCoding = Math.max(1, Math.ceil(questionCount / 3))
    let coding = 0

    for (const slot of slots) {
        if (out.length >= questionCount) break
        const topic = String(slot?.topic || slot?.title || "").trim().slice(0, 120)
        let questionType = normalizeQuestionType(slot?.questionType || slot?.type, interviewType)
        if (questionType === "coding") {
            if (coding >= maxCoding) questionType = "written"
            else coding++
        }
        out.push({ topic, questionType })
    }
    return out
}
