import "./helpers/env.js"
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
    clampTimer,
    computeOverallScore,
    countProgress,
    decideNextDifficulty,
    normalizePlan,
    normalizeQuestionType,
    shouldAskFollowUp,
} from "../services/interview/engine/adaptive.js"
import {
    buildSpeechMetrics,
    countFillers,
    countWords,
    summarizeCommunication,
} from "../services/interview/engine/speech.js"
import {
    groundKeywords,
    isNoAnswer,
    normalizeFeedback,
    sanitizeResumeContext,
} from "../services/interview/engine/normalize.js"
import { parseAnswerInput, parseStartInput } from "../services/interview/controllers/validation.js"

describe("adaptive difficulty", () => {
    test("one excellent answer raises difficulty", () => {
        const d = decideNextDifficulty("easy", [93])
        assert.equal(d.difficulty, "medium")
        assert.equal(d.change, 1)
        assert.match(d.reason, /Excellent answer \(93\/100\)/)
    })

    test("two consecutive strong answers raise difficulty", () => {
        assert.equal(decideNextDifficulty("medium", [78, 82]).difficulty, "hard")
        assert.equal(decideNextDifficulty("medium", [60, 82]).difficulty, "medium")
    })

    test("a clear knowledge gap lowers difficulty", () => {
        const d = decideNextDifficulty("hard", [85, 30])
        assert.equal(d.difficulty, "medium")
        assert.equal(d.change, -1)
    })

    test("two weak answers in a row lower difficulty", () => {
        assert.equal(decideNextDifficulty("medium", [50, 52]).difficulty, "easy")
    })

    test("mixed performance keeps difficulty", () => {
        const d = decideNextDifficulty("medium", [70])
        assert.equal(d.difficulty, "medium")
        assert.equal(d.change, 0)
    })

    test("clamps at the ends of the scale", () => {
        assert.equal(decideNextDifficulty("hard", [95]).difficulty, "hard")
        assert.equal(decideNextDifficulty("easy", [10]).difficulty, "easy")
    })
})

describe("follow-up decisions", () => {
    const feedback = (score, needed = true) => ({ score, followUp: { needed, question: "Why?", reason: "probe" } })

    test("asks a follow-up for a partially correct answer", () => {
        assert.equal(shouldAskFollowUp({ feedback: feedback(65), question: { isFollowUp: false } }), true)
    })

    test("does not follow up on very weak or excellent answers", () => {
        assert.equal(shouldAskFollowUp({ feedback: feedback(20), question: {} }), false)
        assert.equal(shouldAskFollowUp({ feedback: feedback(95), question: {} }), false)
    })

    test("never chains follow-ups and respects the limit", () => {
        assert.equal(shouldAskFollowUp({ feedback: feedback(65), question: { isFollowUp: true } }), false)
        assert.equal(shouldAskFollowUp({ feedback: feedback(65), question: {}, followUpsUsed: 2, maxFollowUps: 2 }), false)
    })

    test("requires the model to propose a question", () => {
        assert.equal(shouldAskFollowUp({ feedback: feedback(65, false), question: {} }), false)
        assert.equal(shouldAskFollowUp({ feedback: { score: 65, followUp: { needed: true, question: "  " } }, question: {} }), false)
    })
})

describe("progress, scoring and plans", () => {
    test("countProgress separates main questions from follow-ups", () => {
        const p = countProgress([
            { answered: true },
            { answered: true, isFollowUp: true },
            { answered: false },
        ])
        assert.deepEqual(p, { mainAnswered: 1, followUpsUsed: 1, mainAsked: 2 })
    })

    test("overall score weights hard questions more and follow-ups less", () => {
        const score = computeOverallScore([
            { answered: true, difficulty: "easy", feedback: { score: 50 } },
            { answered: true, difficulty: "hard", feedback: { score: 90 } },
            { answered: true, difficulty: "hard", isFollowUp: true, feedback: { score: 0 } },
            { answered: false, difficulty: "hard", feedback: { score: 0 } },
        ])
        // (50*1 + 90*1.4 + 0*0.84) / (1 + 1.4 + 0.84) = 54.3
        assert.equal(score, 54)
        assert.equal(computeOverallScore([]), null)
    })

    test("HR interviews are verbal only and coding is capped", () => {
        assert.equal(normalizeQuestionType("coding", "hr"), "verbal")
        const plan = normalizePlan(
            [
                { topic: "a", questionType: "coding" },
                { topic: "b", questionType: "coding" },
                { topic: "c", questionType: "coding" },
                { topic: "d", questionType: "verbal" },
                { topic: "e", questionType: "practical" },
                { topic: "f", questionType: "verbal" },
                { topic: "extra", questionType: "verbal" },
            ],
            { questionCount: 6, interviewType: "technical" }
        )
        assert.equal(plan.length, 6)
        assert.equal(plan.filter((s) => s.questionType === "coding").length, 2)
        assert.equal(plan[2].questionType, "written")
        assert.equal(plan[4].questionType, "written")
    })

    test("timers are clamped per question type", () => {
        assert.equal(clampTimer(10, "verbal"), 60)
        assert.equal(clampTimer(99999, "coding"), 1800)
        assert.equal(clampTimer("abc", "written"), 300)
    })
})

describe("speech metrics", () => {
    test("counts words and filler words from the transcript", () => {
        assert.equal(countWords("So um I think, uh, Node.js is great"), 8)
        const { fillers, total } = countFillers("Um, so umm I uh think, ah, oh well, er, you know, hmm")
        assert.deepEqual(fillers, { um: 2, uh: 1, hmm: 1, ah: 1, oh: 1, er: 1, "you know": 1 })
        assert.equal(total, 8)
    })

    test("does not count 'like' or words containing filler letters", () => {
        assert.equal(countFillers("I like Python and the umbrella is huge, ohio").total, 0)
    })

    test("buildSpeechMetrics derives pace from VAD speaking time", () => {
        const m = buildSpeechMetrics({
            transcript: "um " + "word ".repeat(59),
            speakingTimeSec: 30,
            listeningTimeSec: 45,
            pauseCount: 4,
            longPauseCount: 1,
            longestPauseSec: 3.2,
            totalPauseSec: 6,
            vadAvailable: true,
        })
        assert.equal(m.wordCount, 60)
        assert.equal(m.wordsPerMinute, 120)
        assert.equal(m.fillerCount, 1)
        assert.equal(m.longPauseCount, 1)
    })

    test("ignores pause data when VAD was unavailable and drops silent answers", () => {
        const m = buildSpeechMetrics({ transcript: "hello there friend", listeningTimeSec: 6, longPauseCount: 9, vadAvailable: false })
        assert.equal(m.longPauseCount, 0)
        assert.equal(m.speakingTimeSec, 0)
        assert.equal(m.wordsPerMinute, 30)
        assert.equal(buildSpeechMetrics({ transcript: "   " }), null)
        assert.equal(buildSpeechMetrics(null), null)
    })

    test("summarizeCommunication is honest when nothing was spoken", () => {
        const c = summarizeCommunication([{ answered: true, userAnswer: "typed", speechMetrics: null }])
        assert.equal(c.available, false)
        assert.match(c.reason, /No spoken answers/)
    })

    test("summarizeCommunication aggregates spoken answers", () => {
        const q = (fillers, words, extra = {}) => ({
            answered: true,
            userAnswer: "x",
            feedback: { clarity: 80, communication: 70 },
            speechMetrics: {
                wordCount: words,
                speakingTimeSec: 60,
                listeningTimeSec: 70,
                fillerCount: Object.values(fillers).reduce((a, b) => a + b, 0),
                fillers,
                pauseCount: 2,
                longPauseCount: 1,
                longestPauseSec: 3,
                totalPauseSec: 4,
                vadAvailable: true,
                ...extra,
            },
        })
        const c = summarizeCommunication([q({ um: 3 }, 130), q({ uh: 1, um: 1 }, 110)])
        assert.equal(c.available, true)
        assert.equal(c.questionsAnalyzed, 2)
        assert.equal(c.fillerCount, 5)
        assert.deepEqual(c.fillers, { um: 4, uh: 1 })
        assert.equal(c.wordsPerMinute, 120)
        assert.equal(c.longPauseCount, 2)
        assert.equal(c.clarityScore, 75)
        assert.match(c.notes[0], /5 filler words/)
        assert.match(c.caveat, /minimum/)
    })
})

describe("normalisation", () => {
    test("feedback scores are clamped and lists cleaned", () => {
        const f = normalizeFeedback({
            score: 140, clarity: -5, correctness: "71.6",
            feedback: " Specific. ",
            whatWasCorrect: ["a", "A", "", null, "b"],
            improvements: ["do x"],
            followUp: { needed: true, question: "Explain the event loop phases?" },
        })
        assert.equal(f.score, 100)
        assert.equal(f.clarity, 0)
        assert.equal(f.correctness, 72)
        assert.deepEqual(f.whatWasCorrect, ["a", "b"])
        assert.deepEqual(f.howToImprove, ["do x"])
        assert.deepEqual(f.improvements, ["do x"])
        assert.equal(f.verdict, "strong")
        assert.equal(f.followUp.needed, true)
    })

    test("no-answer forces zero scores and no follow-up", () => {
        const f = normalizeFeedback({ score: 80, correctness: 90, whatWasCorrect: ["x"], followUp: { needed: true, question: "q" } }, { noAnswer: true })
        assert.equal(f.score, 0)
        assert.equal(f.correctness, 0)
        assert.deepEqual(f.whatWasCorrect, [])
        assert.equal(f.verdict, "no-answer")
        assert.equal(f.followUp.needed, false)
    })

    test("isNoAnswer detects empty and timeout answers", () => {
        assert.equal(isNoAnswer(""), true)
        assert.equal(isNoAnswer("No answer provided. Time over."), true)
        assert.equal(isNoAnswer("I don't know"), true)
        assert.equal(isNoAnswer("A closure captures variables"), false)
    })

    test("keywords are kept only if the candidate actually used them", () => {
        const kept = groundKeywords(
            ["event loop", "Redis", "Kubernetes", "garbage collection"],
            ["The event loop runs callbacks", "I cached it in redis and tuned the collection of garbage"]
        )
        assert.deepEqual(kept, ["event loop", "Redis", "garbage collection"])
    })

    test("resume context is reduced to safe, bounded fields", () => {
        const r = sanitizeResumeContext({
            skills: ["Node", "React", "Node"],
            projects: [{ title: "Shop", description: "MERN store", technologies: ["React"] }, "Blog"],
            experience: [{ role: "Intern", company: "Acme" }],
            extractedText: "very long text",
            email: "x@y.z",
        })
        assert.deepEqual(r.skills, ["Node", "React"])
        assert.deepEqual(r.projects, ["Shop — MERN store — React", "Blog"])
        assert.equal(r.experience[0], "Intern — Acme")
        assert.equal("email" in r, false)
        assert.equal("extractedText" in r, false)
    })
})

describe("request validation", () => {
    test("start input", () => {
        assert.throws(() => parseStartInput({ type: "x", role: "Dev" }), /type/)
        assert.throws(() => parseStartInput({ type: "hr", role: "" }), /role/)
        assert.throws(() => parseStartInput({ type: "hr", role: "Dev", questionCount: 50 }), /between/)
        assert.throws(() => parseStartInput({ type: "hr", role: "Dev", useResume: true, resume: {} }), /Resume/)
        const ok = parseStartInput({ type: "Technical", role: "  Backend Developer ", questionCount: "8" })
        assert.deepEqual({ type: ok.type, role: ok.role, questionCount: ok.questionCount }, { type: "technical", role: "Backend Developer", questionCount: 8 })
    })

    test("answer input", () => {
        const id = "64b7f0c2a1b2c3d4e5f60720"
        assert.throws(() => parseAnswerInput({ interviewId: "bad", answer: "x" }), /interviewId/)
        assert.throws(() => parseAnswerInput({ interviewId: id, answer: "  " }), /required/)
        assert.equal(parseAnswerInput({ interviewId: id, answer: "", timedOut: true }).answer, "No answer provided. Time over.")
        const parsed = parseAnswerInput({ interviewId: id, answer: "code", answerMode: "code", codeLanguage: "Python", questionIndex: 2, timeTakenSec: 12.7 })
        assert.deepEqual(
            { mode: parsed.answerMode, lang: parsed.codeLanguage, idx: parsed.questionIndex, t: parsed.timeTakenSec },
            { mode: "code", lang: "python", idx: 2, t: 13 }
        )
        assert.equal(parseAnswerInput({ interviewId: id, answer: "x", codeLanguage: "<script>" }).codeLanguage, "")
    })
})
