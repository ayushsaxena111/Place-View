// Robust JSON extraction for LLM responses.
//
// LLMs occasionally wrap JSON in markdown fences, prepend a sentence, or
// return content as an array of parts. This helper extracts the first complete
// JSON object/array and parses it, throwing a descriptive error otherwise.

export class LLMJsonError extends Error {
    constructor(message, raw) {
        super(message)
        this.name = "LLMJsonError"
        this.raw = typeof raw === "string" ? raw.slice(0, 2000) : raw
    }
}

export const contentToText = (content) => {
    if (typeof content === "string") return content
    if (Array.isArray(content)) {
        return content
            .map((part) => (typeof part === "string" ? part : part?.text || ""))
            .join("")
    }
    if (content && typeof content === "object" && typeof content.text === "string") {
        return content.text
    }
    return ""
}

// Find the end index of a balanced JSON value starting at `start`.
const findBalancedEnd = (text, start) => {
    const pairs = { "{": "}", "[": "]" }
    const stack = []
    let inString = false
    let escaped = false

    for (let i = start; i < text.length; i++) {
        const ch = text[i]
        if (inString) {
            if (escaped) escaped = false
            else if (ch === "\\") escaped = true
            else if (ch === '"') inString = false
            continue
        }
        if (ch === '"') {
            inString = true
        } else if (pairs[ch]) {
            stack.push(pairs[ch])
        } else if (ch === "}" || ch === "]") {
            if (stack.pop() !== ch) return -1
            if (stack.length === 0) return i
        }
    }
    return -1
}

/**
 * Parse JSON from an LLM response.
 * @param {string|Array|object} content - LLM message content
 * @param {{expect?: "object"|"array"}} [options]
 */
export const parseLLMJson = (content, { expect } = {}) => {
    const text = contentToText(content)
        .replace(/```(?:json|JSON)?/g, "")
        .trim()

    if (!text) throw new LLMJsonError("The AI returned an empty response.", text)

    try {
        const direct = JSON.parse(text)
        if (matches(direct, expect)) return direct
    } catch {
        // fall through to extraction
    }

    const openers = expect === "array" ? ["["] : expect === "object" ? ["{"] : ["{", "["]
    for (let i = 0; i < text.length; i++) {
        if (!openers.includes(text[i])) continue
        const end = findBalancedEnd(text, i)
        if (end === -1) continue
        try {
            const parsed = JSON.parse(text.slice(i, end + 1))
            if (matches(parsed, expect)) return parsed
        } catch {
            // keep scanning
        }
    }

    throw new LLMJsonError("The AI response could not be parsed as JSON.", text)
}

const matches = (value, expect) => {
    if (expect === "array") return Array.isArray(value)
    if (expect === "object") return value !== null && typeof value === "object" && !Array.isArray(value)
    return value !== null && typeof value === "object"
}
