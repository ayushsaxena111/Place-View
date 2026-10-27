// Verbal-communication metrics.
//
// Timing data (speaking time, pauses) comes from voice-activity detection in
// the browser. Words and filler words are counted here from the raw
// speech-to-text transcript. Browser speech recognition often drops
// disfluencies such as "um", so filler counts are a lower bound — the report
// says so instead of overstating precision.

// Canonical filler -> regex. "like" is deliberately excluded: it is usually a
// real word ("I like Python") and cannot be told apart from text alone.
export const FILLER_PATTERNS = Object.freeze({
    um: /\bu+m+\b/gi,
    uh: /\bu+h+\b/gi,
    hmm: /\bh+m+\b/gi,
    ah: /\bah+\b/gi,
    oh: /\boh+\b/gi,
    er: /\b(?:er+|erm+)\b/gi,
    "you know": /\byou know\b/gi,
})

const MAX_TRANSCRIPT = 20000

export const countWords = (text = "") => {
    const words = String(text).trim().match(/[A-Za-z0-9'’+#.-]+/g)
    return words ? words.length : 0
}

export const countFillers = (text = "") => {
    const fillers = {}
    let total = 0
    for (const [name, pattern] of Object.entries(FILLER_PATTERNS)) {
        const matches = String(text).match(pattern)
        const n = matches ? matches.length : 0
        if (n > 0) {
            fillers[name] = n
            total += n
        }
    }
    return { fillers, total }
}

const num = (value, max = 3600) => {
    const n = Number(value)
    if (!Number.isFinite(n) || n < 0) return 0
    return Math.min(max, Math.round(n * 10) / 10)
}

/**
 * Validate the client-reported metrics for one answer and derive word and
 * filler counts from the transcript. Returns null if nothing was spoken.
 */
export const buildSpeechMetrics = (input) => {
    if (!input || typeof input !== "object") return null
    const transcript = String(input.transcript || "").slice(0, MAX_TRANSCRIPT).trim()
    const wordCount = countWords(transcript)
    if (wordCount === 0) return null

    const { fillers, total } = countFillers(transcript)
    const vadAvailable = Boolean(input.vadAvailable)
    const speakingTimeSec = vadAvailable ? num(input.speakingTimeSec) : 0
    const listeningTimeSec = num(input.listeningTimeSec)
    const minutes = (speakingTimeSec || listeningTimeSec) / 60

    return {
        transcript,
        wordCount,
        speakingTimeSec,
        listeningTimeSec,
        wordsPerMinute: minutes > 0.05 ? Math.round(wordCount / minutes) : 0,
        fillerCount: total,
        fillers,
        pauseCount: vadAvailable ? Math.round(num(input.pauseCount, 10000)) : 0,
        longPauseCount: vadAvailable ? Math.round(num(input.longPauseCount, 10000)) : 0,
        longestPauseSec: vadAvailable ? num(input.longestPauseSec) : 0,
        totalPauseSec: vadAvailable ? num(input.totalPauseSec) : 0,
        vadAvailable,
    }
}

const mapToObject = (value) => {
    if (!value) return {}
    if (value instanceof Map) return Object.fromEntries(value)
    return { ...value }
}

export const paceLabel = (wpm) => {
    if (!wpm) return ""
    if (wpm < 100) return "slow"
    if (wpm <= 170) return "conversational"
    return "fast"
}

export const FILLER_CAVEAT =
    "Filler words are counted from the browser's speech-to-text transcript, which often omits sounds like \"um\" and \"uh\". Treat these counts as a minimum."

/**
 * Aggregate per-question metrics into the interview-level communication analysis.
 * Clarity comes from the AI evaluation scores of the spoken answers.
 */
export const summarizeCommunication = (questions = []) => {
    const spoken = questions.filter(
        (q) => (q.answered || q.userAnswer) && q.speechMetrics && q.speechMetrics.wordCount >= 5
    )

    if (spoken.length === 0) {
        return {
            available: false,
            reason: "No spoken answers were recorded in this interview, so verbal communication could not be analysed.",
            questionsAnalyzed: 0,
            notes: [],
            caveat: "",
        }
    }

    let totalWords = 0
    let speakingTimeSec = 0
    let listeningTimeSec = 0
    let fillerCount = 0
    let longPauseCount = 0
    let longestPauseSec = 0
    let totalPauseSec = 0
    let pauseCount = 0
    let vadQuestions = 0
    const fillers = {}
    const clarityScores = []

    for (const q of spoken) {
        const m = q.speechMetrics
        totalWords += m.wordCount || 0
        listeningTimeSec += m.listeningTimeSec || 0
        fillerCount += m.fillerCount || 0
        for (const [name, n] of Object.entries(mapToObject(m.fillers))) {
            fillers[name] = (fillers[name] || 0) + n
        }
        if (m.vadAvailable) {
            vadQuestions++
            speakingTimeSec += m.speakingTimeSec || 0
            longPauseCount += m.longPauseCount || 0
            totalPauseSec += m.totalPauseSec || 0
            pauseCount += m.pauseCount || 0
            longestPauseSec = Math.max(longestPauseSec, m.longestPauseSec || 0)
        }
        const clarity = Number(q.feedback?.clarity)
        const communication = Number(q.feedback?.communication)
        const parts = [clarity, communication].filter((n) => Number.isFinite(n) && n > 0)
        if (parts.length) clarityScores.push(parts.reduce((a, b) => a + b, 0) / parts.length)
    }

    const minutes = (vadQuestions === spoken.length ? speakingTimeSec : listeningTimeSec) / 60
    const wordsPerMinute = minutes > 0.05 ? Math.round(totalWords / minutes) : 0
    const fillersPerMinute = minutes > 0.05 ? Math.round((fillerCount / minutes) * 10) / 10 : 0
    const fillersPer100Words = totalWords ? Math.round((fillerCount / totalWords) * 1000) / 10 : 0
    const clarityScore = clarityScores.length
        ? Math.round(clarityScores.reduce((a, b) => a + b, 0) / clarityScores.length)
        : 0
    const pauseDataAvailable = vadQuestions > 0
    const averagePauseSec = pauseCount ? Math.round((totalPauseSec / pauseCount) * 10) / 10 : 0

    const notes = []
    const topFiller = Object.entries(fillers).sort((a, b) => b[1] - a[1])[0]
    if (fillerCount === 0) {
        notes.push("No filler words were detected in the transcript of your spoken answers.")
    } else {
        notes.push(
            `${fillerCount} filler word${fillerCount === 1 ? "" : "s"} detected (${fillersPer100Words} per 100 words)` +
            (topFiller ? `; "${topFiller[0]}" was the most frequent.` : ".")
        )
    }
    if (wordsPerMinute) {
        const label = paceLabel(wordsPerMinute)
        notes.push(
            label === "conversational"
                ? `Speaking pace of about ${wordsPerMinute} words per minute is comfortable for interviews.`
                : label === "slow"
                    ? `Speaking pace of about ${wordsPerMinute} words per minute is on the slow side; aim for 120–160.`
                    : `Speaking pace of about ${wordsPerMinute} words per minute is fast; slowing down helps clarity.`
        )
    }
    if (pauseDataAvailable) {
        notes.push(
            longPauseCount === 0
                ? "No long pauses (over 2.5 seconds) while answering."
                : `${longPauseCount} long pause${longPauseCount === 1 ? "" : "s"} (over 2.5 seconds); the longest was ${longestPauseSec}s.`
        )
    }

    return {
        available: true,
        reason: "",
        questionsAnalyzed: spoken.length,
        totalWords,
        speakingTimeSec: Math.round(speakingTimeSec),
        wordsPerMinute,
        paceLabel: paceLabel(wordsPerMinute),
        fillerCount,
        fillers,
        fillersPerMinute,
        fillersPer100Words,
        longPauseCount,
        longestPauseSec,
        averagePauseSec,
        pauseDataAvailable,
        clarityScore,
        notes,
        caveat: FILLER_CAVEAT,
    }
}
