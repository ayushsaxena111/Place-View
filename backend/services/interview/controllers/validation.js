import { isValidObjectId } from "../../../shared/middleware/serviceAuth.js"
import { sanitizeResumeContext } from "../engine/normalize.js"

export const DEFAULT_QUESTION_COUNT = 6
export const MIN_QUESTION_COUNT = 4
export const MAX_QUESTION_COUNT = 10
export const MAX_ANSWER_LENGTH = 20000
export const TIMEOUT_ANSWER = "No answer provided. Time over."

const ANSWER_MODES = ["voice", "text", "code", "mixed"]

export class ValidationError extends Error {
    constructor(message) {
        super(message)
        this.name = "ValidationError"
        this.status = 400
    }
}

export const parseStartInput = (body = {}) => {
    const type = String(body.type || "").toLowerCase().trim()
    const role = typeof body.role === "string" ? body.role.trim() : ""

    if (!["hr", "technical"].includes(type)) {
        throw new ValidationError("Interview type must be 'technical' or 'hr'")
    }
    if (role.length < 2 || role.length > 100) {
        throw new ValidationError("Target role is required (2–100 characters)")
    }

    let questionCount = DEFAULT_QUESTION_COUNT
    if (body.questionCount !== undefined && body.questionCount !== null && body.questionCount !== "") {
        const n = Number(body.questionCount)
        if (!Number.isInteger(n) || n < MIN_QUESTION_COUNT || n > MAX_QUESTION_COUNT) {
            throw new ValidationError(`Number of questions must be between ${MIN_QUESTION_COUNT} and ${MAX_QUESTION_COUNT}`)
        }
        questionCount = n
    }

    const useResume = body.useResume === true || body.useResume === "true"
    const resume = useResume ? sanitizeResumeContext(body.resume) : null
    if (useResume && (!resume || (!resume.skills.length && !resume.summary && !resume.projects.length))) {
        throw new ValidationError("Resume data is required when 'Use Resume' is on. Upload a resume first.")
    }

    return { type, role, questionCount, useResume, resume }
}

const toSeconds = (value, max) => {
    const n = Number(value)
    if (!Number.isFinite(n) || n < 0) return 0
    return Math.min(max, Math.round(n))
}

export const parseAnswerInput = (body = {}) => {
    const { interviewId } = body
    if (!isValidObjectId(interviewId)) {
        throw new ValidationError("A valid interviewId is required")
    }

    const timedOut = body.timedOut === true
    let answer = typeof body.answer === "string" ? body.answer : ""
    if (answer.length > MAX_ANSWER_LENGTH) {
        throw new ValidationError(`Answer is too long (maximum ${MAX_ANSWER_LENGTH} characters)`)
    }
    if (!answer.trim()) {
        if (!timedOut) throw new ValidationError("Answer is required")
        answer = TIMEOUT_ANSWER
    }

    let questionIndex
    if (body.questionIndex !== undefined && body.questionIndex !== null) {
        const n = Number(body.questionIndex)
        if (!Number.isInteger(n) || n < 0) throw new ValidationError("questionIndex must be a non-negative integer")
        questionIndex = n
    }

    const answerMode = ANSWER_MODES.includes(body.answerMode) ? body.answerMode : "text"
    const codeLanguage = typeof body.codeLanguage === "string" && /^[a-z0-9+#]{1,20}$/i.test(body.codeLanguage)
        ? body.codeLanguage.toLowerCase()
        : ""

    return {
        interviewId,
        answer: answer.trim(),
        questionIndex,
        answerMode,
        codeLanguage,
        timedOut,
        timeTakenSec: toSeconds(body.timeTakenSec, 7200),
        speechMetrics: body.speechMetrics && typeof body.speechMetrics === "object" ? body.speechMetrics : null,
    }
}
