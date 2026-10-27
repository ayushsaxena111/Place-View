// Fetch a completed interview from the interview service (as the same user)
// and condense it into the signals the roadmap prompt needs.

export class InsightsError extends Error {
    constructor(message, status = 500) {
        super(message)
        this.name = "InsightsError"
        this.status = status
    }
}

const short = (value, max = 200) => String(value || "").trim().slice(0, max)

export const buildInsights = (interview) => {
    const answered = (interview.questions || []).filter((q) => q.answered || q.userAnswer)
    const lowScoring = answered
        .filter((q) => (q.feedback?.score ?? 0) < 60)
        .slice(0, 6)
        .map((q) => ({
            topic: short(q.topic || q.question, 120),
            score: q.feedback?.score ?? 0,
            missedConcepts: (q.feedback?.keyConceptsMissed || q.feedback?.whatWasMissing || []).slice(0, 4).map((c) => short(c, 120)),
        }))
    const strongTopics = answered
        .filter((q) => (q.feedback?.score ?? 0) >= 80)
        .slice(0, 6)
        .map((q) => short(q.topic || q.question, 120))

    return {
        interviewId: String(interview._id),
        role: interview.role,
        type: interview.type,
        overallScore: interview.overallScore ?? null,
        weaknesses: (interview.weaknesses || []).slice(0, 5),
        improvementAreas: (interview.improvementAreas || []).slice(0, 5),
        recommendations: (interview.recommendations || []).slice(0, 5),
        technicalSkillsShown: (interview.technicalSkills || []).slice(0, 10),
        lowScoringTopics: lowScoring,
        strongTopics,
    }
}

export const fetchInterviewInsights = async ({ interviewId, userId, fetchImpl = fetch }) => {
    const baseUrl = process.env.INTERVIEW_SERVICE_URL
    if (!baseUrl) {
        throw new InsightsError("Server misconfigured: INTERVIEW_SERVICE_URL is not set for the roadmap service.", 500)
    }

    const headers = { "x-user-id": String(userId) }
    if (process.env.INTERNAL_SERVICE_SECRET) headers["x-internal-secret"] = process.env.INTERNAL_SERVICE_SECRET

    let response
    try {
        response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(interviewId)}`, {
            headers,
            signal: AbortSignal.timeout(10000),
        })
    } catch (error) {
        throw new InsightsError(`Could not reach the interview service: ${error.message}`, 503)
    }

    if (response.status === 404) throw new InsightsError("Interview not found", 404)
    if (!response.ok) throw new InsightsError(`Interview service responded with ${response.status}`, 502)

    const data = await response.json()
    const interview = data?.interview
    if (!interview) throw new InsightsError("Interview not found", 404)
    if (interview.status !== "completed") {
        throw new InsightsError("Finish the interview before generating a roadmap from it.", 400)
    }
    return buildInsights(interview)
}
