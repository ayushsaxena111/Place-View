// Text helpers for speech input.

export const tokenize = (text = "") =>
    String(text)
        .toLowerCase()
        .replace(/[^a-z0-9'\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean)

export const countWords = (text = "") => tokenize(text).length

/**
 * Echo guard: true when a recognised phrase is most likely the AI
 * interviewer's own voice picked up by the microphone, rather than the
 * candidate. Candidates often repeat key terms from the question ("the event
 * loop"), so short phrases are never treated as echo.
 */
export const isLikelyEcho = (transcript, aiText, { minWords = 5, overlap = 0.8 } = {}) => {
    const heard = tokenize(transcript)
    const spoken = tokenize(aiText)
    if (heard.length < minWords || spoken.length === 0) return false

    const heardText = heard.join(" ")
    if (spoken.join(" ").includes(heardText)) return true

    const vocabulary = new Set(spoken)
    const shared = heard.filter((w) => vocabulary.has(w)).length
    return shared / heard.length >= overlap
}

/** Append a recognised phrase to the answer text with sensible spacing. */
export const appendTranscript = (current = "", addition = "") => {
    const add = String(addition).trim()
    if (!add) return current
    const base = String(current).replace(/\s+$/, "")
    if (!base) return add
    return `${base} ${add}`
}

/**
 * Work out how an answer was produced: entirely from speech, typed, or both.
 * `spoken` is the concatenated speech transcript added to the answer.
 */
export const answerModeFor = (answer = "", spoken = "") => {
    const a = tokenize(answer)
    const s = tokenize(spoken)
    if (s.length === 0) return "text"
    if (a.join(" ") === s.join(" ")) return "voice"
    return "mixed"
}
