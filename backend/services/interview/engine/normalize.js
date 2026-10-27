// Normalisers for LLM output and client input. Everything stored in the
// database passes through here so the schema never receives junk.

import { clampTimer, normalizeLevel, normalizeQuestionType } from "./adaptive.js"

export const str = (value, max = 2000) => {
    if (value === null || value === undefined) return ""
    if (typeof value === "string") return value.trim().slice(0, max)
    if (typeof value === "number" || typeof value === "boolean") return String(value)
    return ""
}

export const strList = (value, { maxItems = 10, maxLength = 400 } = {}) => {
    if (!Array.isArray(value)) return []
    const seen = new Set()
    const out = []
    for (const item of value) {
        const text = typeof item === "string" ? item.trim() : str(item?.text || item?.title || item?.name || "")
        if (!text) continue
        const key = text.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(text.slice(0, maxLength))
        if (out.length >= maxItems) break
    }
    return out
}

export const clampScore = (value) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return 0
    return Math.max(0, Math.min(100, Math.round(n)))
}

const SCORE_FIELDS = [
    "score", "correctness", "clarity", "relevance", "detail",
    "efficiency", "communication", "problemSolving", "creativity",
]

const VERDICTS = ["strong", "adequate", "partial", "weak", "incorrect", "no-answer"]

export const verdictFromScore = (score) => {
    if (score >= 80) return "strong"
    if (score >= 65) return "adequate"
    if (score >= 45) return "partial"
    if (score >= 25) return "weak"
    return "incorrect"
}

const NO_ANSWER_SENTINELS = [
    "no answer provided",
    "no answer provided. time over.",
    "no answer",
]

/** True when the candidate did not give a substantive answer. */
export const isNoAnswer = (answer) => {
    const text = String(answer || "").trim().toLowerCase()
    if (text.length < 3) return true
    if (NO_ANSWER_SENTINELS.includes(text)) return true
    return /^(i\s+don'?t\s+know|idk|pass|skip)\.?$/i.test(text)
}

/**
 * Normalise the feedback agent's JSON. Scores are clamped to 0–100; when the
 * candidate gave no answer every score is forced to 0 regardless of the LLM.
 */
export const normalizeFeedback = (raw = {}, { noAnswer = false } = {}) => {
    const out = {}
    for (const field of SCORE_FIELDS) out[field] = noAnswer ? 0 : clampScore(raw[field])

    const howToImprove = strList(raw.howToImprove || raw.improvements, { maxItems: 5 })

    out.feedback = str(raw.feedback, 1200)
    out.whatWasCorrect = noAnswer ? [] : strList(raw.whatWasCorrect, { maxItems: 6 })
    out.whatWasMissing = strList(raw.whatWasMissing, { maxItems: 6 })
    out.howToImprove = howToImprove
    out.improvements = howToImprove
    out.modelAnswer = str(raw.modelAnswer, 6000)
    out.keyConceptsCovered = noAnswer ? [] : strList(raw.keyConceptsCovered, { maxItems: 12, maxLength: 80 })
    out.keyConceptsMissed = strList(raw.keyConceptsMissed, { maxItems: 12, maxLength: 80 })
    out.technicalSkills = noAnswer ? [] : strList(raw.technicalSkills, { maxItems: 10, maxLength: 80 })

    const verdict = String(raw.verdict || "").toLowerCase()
    out.verdict = noAnswer ? "no-answer" : VERDICTS.includes(verdict) && verdict !== "no-answer" ? verdict : verdictFromScore(out.score)

    const followUp = raw.followUp && typeof raw.followUp === "object" ? raw.followUp : {}
    out.followUp = {
        needed: !noAnswer && Boolean(followUp.needed) && Boolean(str(followUp.question)),
        question: str(followUp.question, 600),
        reason: str(followUp.reason, 300),
    }
    out.followUpReason = ""
    return out
}

/** Normalise a generated question. */
export const normalizeQuestion = (raw = {}, { difficulty, questionType, interviewType, topic }) => {
    const type = normalizeQuestionType(questionType || raw.questionType, interviewType)
    return {
        question: str(raw.question, 2000),
        difficulty: normalizeLevel(difficulty || raw.difficulty),
        timer: clampTimer(raw.timer, type),
        questionType: type,
        topic: str(topic || raw.topic, 120),
        isFollowUp: false,
        followUpOf: null,
    }
}

/**
 * Keep only keywords that the candidate actually used. A multi-word keyword
 * counts if the phrase appears, or every significant word in it appears.
 */
export const groundKeywords = (keywords = [], answers = []) => {
    const haystack = answers.join(" \n ").toLowerCase()
    if (!haystack.trim()) return []
    return strList(keywords, { maxItems: 40, maxLength: 60 }).filter((keyword) => {
        const k = keyword.toLowerCase()
        if (haystack.includes(k)) return true
        const tokens = k.split(/[^a-z0-9+#.]+/).filter((t) => t.length > 2)
        return tokens.length > 0 && tokens.every((t) => haystack.includes(t))
    })
}

export const mergeUnique = (...lists) => {
    const seen = new Set()
    const out = []
    for (const list of lists) {
        for (const item of list || []) {
            const text = str(item, 80)
            if (!text) continue
            const key = text.toLowerCase()
            if (seen.has(key)) continue
            seen.add(key)
            out.push(text)
        }
    }
    return out
}

/** Keep only the resume fields the interview prompts need, size-limited. */
export const sanitizeResumeContext = (resume) => {
    if (!resume || typeof resume !== "object") return null
    const projects = Array.isArray(resume.projects)
        ? resume.projects.slice(0, 6).map((p) =>
            typeof p === "string"
                ? str(p, 300)
                : [str(p?.title, 120), str(p?.description, 300), strList(p?.technologies, { maxItems: 8, maxLength: 40 }).join(", ")]
                    .filter(Boolean)
                    .join(" — ")
        ).filter(Boolean)
        : []
    const experience = Array.isArray(resume.experience)
        ? resume.experience.slice(0, 5).map((e) =>
            typeof e === "string"
                ? str(e, 300)
                : [str(e?.role, 120), str(e?.company, 120), str(e?.description, 300)].filter(Boolean).join(" — ")
        ).filter(Boolean)
        : []

    return {
        summary: str(resume.summary, 800),
        skills: strList(resume.skills, { maxItems: 40, maxLength: 60 }),
        projects,
        experience,
        strengths: strList(resume.strengths, { maxItems: 8, maxLength: 200 }),
        weaknesses: strList(resume.weaknesses, { maxItems: 8, maxLength: 200 }),
        missingSkills: strList(resume.missingSkills, { maxItems: 15, maxLength: 80 }),
        suggestedRole: str(resume.suggestedRole, 120),
    }
}

/** Normalise the summary agent's narrative output. */
export const normalizeSummary = (raw = {}) => ({
    summary: str(raw.summary, 2000),
    strengths: strList(raw.strengths, { maxItems: 6 }),
    weaknesses: strList(raw.weaknesses, { maxItems: 6 }),
    improvementAreas: strList(raw.improvementAreas, { maxItems: 6 }),
    recommendations: strList(raw.recommendations, { maxItems: 8 }),
    technicalSkills: strList(raw.technicalSkills, { maxItems: 20, maxLength: 80 }),
    keywords: strList(raw.keywords, { maxItems: 40, maxLength: 60 }),
    communicationFeedback: str(raw.communicationFeedback, 800),
})
