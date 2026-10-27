// Unit tests for the browser-independent interview logic.
// Run with: npm test
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { rmsDb, VoiceActivityDetector } from "./vad.js"
import { answerModeFor, appendTranscript, countWords, isLikelyEcho } from "./speechText.js"
import { formatValue, runJavaScriptSource } from "./jsSandbox.js"
import { customDurationError, customDurationWeeks, describeDuration } from "./roadmapDuration.js"
import { DEFAULT_CODE, isTemplate } from "./codeTemplates.js"
import { splitForSpeech } from "../hooks/useSpeechSynthesis.js"

// Feed the detector a level (dB) for a duration, sampled every 50 ms.
const feed = (vad, segments, start = 0) => {
    let t = start
    const events = []
    for (const [db, ms] of segments) {
        for (let i = 0; i < ms; i += 50) {
            const e = vad.process(db, t)
            if (e) events.push([e, t])
            t += 50
        }
    }
    return { t, events }
}

describe("voice activity detection", () => {
    test("detects speech above the adaptive noise floor", () => {
        const vad = new VoiceActivityDetector()
        const { events } = feed(vad, [[-60, 1000], [-25, 2000], [-60, 1000]])
        assert.deepEqual(events.map(([e]) => e), ["speech-start", "speech-end"])
    })

    test("ignores short clicks", () => {
        const vad = new VoiceActivityDetector()
        const { events } = feed(vad, [[-60, 1000], [-20, 50], [-60, 1000]])
        assert.equal(events.length, 0)
    })

    test("measures speaking time and pauses, including long pauses", () => {
        const vad = new VoiceActivityDetector()
        const { t } = feed(vad, [[-60, 500], [-25, 3000], [-60, 3000], [-25, 2000], [-60, 1000], [-25, 1000], [-60, 1000]])
        const stats = vad.getStats(t)
        assert.equal(stats.speakingTimeSec, 6)
        assert.equal(stats.pauseCount, 2)
        assert.equal(stats.longPauseCount, 1)
        assert.equal(stats.longestPauseSec, 3)
        assert.equal(stats.totalPauseSec, 4)
    })

    test("a gap while suspended (AI speaking) is not counted as a pause", () => {
        const vad = new VoiceActivityDetector()
        let { t } = feed(vad, [[-60, 500], [-25, 1000], [-60, 1000]])
        vad.suspend(t)
        t += 10000
        ;({ t } = feed(vad, [[-25, 1000], [-60, 1000]], t))
        const stats = vad.getStats(t)
        assert.equal(stats.pauseCount, 0)
        assert.equal(stats.speakingTimeSec, 2)
    })

    test("adapts to a noisy room", () => {
        const vad = new VoiceActivityDetector()
        const { events } = feed(vad, [[-40, 3000], [-38, 1000]])
        assert.equal(events.length, 0, "steady background noise is not speech")
        const loud = feed(vad, [[-15, 1000]], 4000)
        assert.equal(loud.events[0][0], "speech-start")
    })

    test("rmsDb computes signal level", () => {
        assert.equal(rmsDb(new Float32Array(10)), -100)
        assert.equal(Math.round(rmsDb(new Float32Array(10).fill(0.1))), -20)
    })
})

describe("speech text helpers", () => {
    const ai = "Explain how the JavaScript event loop handles promises and timers."

    test("detects the interviewer's own words picked up by the mic", () => {
        assert.equal(isLikelyEcho("the javascript event loop handles promises", ai), true)
        assert.equal(isLikelyEcho("explain how the JavaScript event loop", ai), true)
        assert.equal(isLikelyEcho("how javascript event loop handles timers and", ai), true)
    })

    test("does not discard genuine answers", () => {
        assert.equal(isLikelyEcho("microtasks run before the next macrotask", ai), false)
        assert.equal(isLikelyEcho("the event loop", ai), false, "short phrases are kept")
        assert.equal(isLikelyEcho("so the event loop handles promises first", ai), false, "an answer reusing question terms is kept")
        assert.equal(isLikelyEcho("anything", ""), false)
    })

    test("appends transcripts and classifies the answer mode", () => {
        assert.equal(appendTranscript("", " hello "), "hello")
        assert.equal(appendTranscript("I think  ", "it works"), "I think it works")
        assert.equal(answerModeFor("I think it works", "i think it works"), "voice")
        assert.equal(answerModeFor("typed answer", ""), "text")
        assert.equal(answerModeFor("I think it works, edited", "I think it works"), "mixed")
        assert.equal(countWords("Node.js isn't slow!"), 4)
    })
})

describe("JavaScript sandbox", () => {
    test("captures console output", async () => {
        const r = await runJavaScriptSource("console.log('sum', 1 + 2); console.log({ a: [1, 2] }); console.error('oops')")
        assert.equal(r.stdout, "sum 3\n{\"a\":[1,2]}")
        assert.equal(r.stderr, "oops")
        assert.equal(r.error, null)
    })

    test("reports runtime errors without throwing", async () => {
        const r = await runJavaScriptSource("console.log('before'); undefinedFn()")
        assert.equal(r.stdout, "before")
        assert.match(r.error, /ReferenceError: undefinedFn is not defined/)
    })

    test("supports await and runs in strict mode", async () => {
        const r = await runJavaScriptSource("const v = await Promise.resolve(42); console.log(v); x = 1")
        assert.equal(r.stdout, "42")
        assert.match(r.error, /ReferenceError/)
    })

    test("truncates runaway output", async () => {
        const r = await runJavaScriptSource("for (let i = 0; i < 5000; i++) console.log('line ' + i)")
        assert.ok(r.stdout.length < 25000)
        assert.match(r.stdout, /output truncated/)
    })

    test("formats values like a console", () => {
        const circular = { a: 1 }
        circular.self = circular
        assert.equal(formatValue(circular), '{"a":1,"self":"[Circular]"}')
        assert.equal(formatValue(new Map([["k", 1]])), 'Map(1) {"k":1}')
        assert.equal(formatValue(undefined), "undefined")
        assert.equal(formatValue(10n), "10n")
    })
})

describe("roadmap duration and code templates", () => {
    test("custom durations are validated like the server", () => {
        assert.equal(customDurationWeeks(3, "months"), 13)
        assert.equal(customDurationError(1, "weeks"), "At least 2 weeks")
        assert.equal(customDurationError(25, "months"), "At most 24 months")
        assert.equal(customDurationError("", "weeks"), "Enter a duration")
        assert.equal(customDurationError(10, "weeks"), "")
        assert.equal(describeDuration("6m"), "6 months")
        assert.equal(describeDuration("custom", 10, "weeks"), "10 weeks")
    })

    test("starter templates are recognised so they are not submitted as answers", () => {
        assert.equal(isTemplate(DEFAULT_CODE.python), true)
        assert.equal(isTemplate("print('hi')"), false)
    })
})

describe("speech chunking", () => {
    test("splits long text into short sentence-based chunks", () => {
        const text = "First sentence. " + "word ".repeat(80) + "end. Last one?"
        const chunks = splitForSpeech(text)
        assert.ok(chunks.length >= 3)
        assert.ok(chunks.every((c) => c.length <= 185))
        assert.equal(chunks.join(" ").replace(/\s+/g, " "), text.replace(/\s+/g, " ").trim())
    })
})
