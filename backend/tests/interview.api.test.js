// End-to-end tests of the interview service HTTP API: real routes,
// controllers, LangGraph flow, agents, prompts and normalisation. The LLM is a
// local fake Groq endpoint, coins go to a fake auth service, and only the
// MongoDB storage is in memory. Redis is a real local instance.

import { authHeaders, SECRET, USER_A, USER_B } from "./helpers/env.js"
import { test, describe, before, after } from "node:test"
import assert from "node:assert/strict"
import express from "../services/interview/node_modules/express/index.js"
import { serve, startFakeAuth, startFakeGroq } from "./helpers/fakeServers.js"
import { installMemoryModel } from "./helpers/memoryModel.js"

let groq, auth, api, memory, redis, Interview

const scoreFrom = (prompt) => {
    const answer = prompt.split("<<<ANSWER")[1]?.split("ANSWER>>>")[0] || ""
    const m = answer.match(/SCORE=(\d+)/)
    return { score: m ? Number(m[1]) : 50, followUp: answer.includes("FOLLOWUP"), answer }
}

const defaultResponder = (prompt) => {
    if (prompt.includes("planning an ADAPTIVE")) {
        const count = Number(prompt.match(/Plan exactly (\d+) main questions/)[1])
        const topics = [
            { topic: "Event loop", questionType: "verbal" },
            { topic: "REST API design", questionType: "verbal" },
            { topic: "Arrays", questionType: "coding" },
            { topic: "SQL joins", questionType: "written" },
            { topic: "Caching", questionType: "verbal" },
            { topic: "Testing", questionType: "verbal" },
        ]
        return { plan: topics.slice(0, count), firstQuestion: { question: "What is the Node.js event loop?", timer: 90 } }
    }
    if (prompt.includes("Write the NEXT question")) {
        const difficulty = prompt.match(/- Difficulty: (\w+)/)[1]
        const topic = prompt.match(/- Topic: (.+)/)[1]
        return `Here you go: {"question": "[${difficulty}] Question about ${topic}?", "timer": 100}`
    }
    if (prompt.includes("evaluating one answer")) {
        const { score, followUp } = scoreFrom(prompt)
        return "```json\n" + JSON.stringify({
            score, correctness: score, clarity: 80, relevance: score, detail: score, efficiency: score,
            communication: 70, problemSolving: score, creativity: 60,
            verdict: score >= 80 ? "strong" : "partial",
            feedback: `You explained the callback queue but skipped microtasks (score ${score}).`,
            whatWasCorrect: ["Mentioned the callback queue"],
            whatWasMissing: ["Microtask queue"],
            howToImprove: ["Describe process.nextTick vs setImmediate"],
            modelAnswer: "The event loop processes phases...",
            keyConceptsCovered: ["callback queue", "event loop"],
            keyConceptsMissed: ["microtasks"],
            technicalSkills: ["Node.js"],
            followUp: followUp ? { needed: true, question: "How do microtasks differ from macrotasks?", reason: "Named the queue but did not explain ordering" } : { needed: false, question: "", reason: "" },
        }) + "\n```"
    }
    if (prompt.includes("writing the final report")) {
        return {
            summary: "Solid fundamentals on the event loop; coding needs work.",
            strengths: ["Event loop basics"],
            weaknesses: ["Array algorithms"],
            improvementAreas: ["Algorithms: two pointers"],
            recommendations: ["Practice array problems"],
            technicalSkills: ["Node.js", "Kubernetes"],
            keywords: ["event loop", "callback queue", "Kubernetes"],
            communicationFeedback: "Clear delivery with a few fillers.",
        }
    }
    throw new Error("unexpected prompt")
}

const post = (path, body, userId = USER_A) =>
    fetch(`${api.url}${path}`, { method: "POST", headers: authHeaders(userId), body: JSON.stringify(body) })
const get = (path, userId = USER_A) => fetch(`${api.url}${path}`, { headers: authHeaders(userId) })

before(async () => {
    groq = await startFakeGroq(defaultResponder)
    auth = await startFakeAuth({ balance: 500, secret: SECRET })
    process.env.GROQ_BASE_URL = groq.url
    process.env.AUTH_SERVICE_URL = auth.url

    redis = (await import("../shared/redis/redis.js")).default
    await redis.flushdb()

    Interview = (await import("../services/interview/models/interview.model.js")).default
    memory = installMemoryModel(Interview)
    const { default: router } = await import("../services/interview/routes/interview.route.js")
    const app = express()
    app.use(express.json())
    app.use("/", router)
    api = await serve(app)
})

after(async () => {
    memory.restore()
    await api.close()
    await groq.close()
    await auth.close()
    await redis.flushdb()
    redis.disconnect()
})

describe("interview API — adaptive flow", () => {
    let interviewId

    test("rejects requests that did not come through the gateway", async () => {
        const res = await fetch(`${api.url}/start`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-user-id": USER_A },
            body: JSON.stringify({ type: "technical", role: "Backend Developer" }),
        })
        assert.equal(res.status, 401)
    })

    test("validates input before charging coins", async () => {
        const res = await post("/start", { type: "technical", role: "" })
        assert.equal(res.status, 400)
        assert.equal(auth.state.balance, 500)
    })

    test("starts an adaptive interview and charges 50 coins server-side", async () => {
        const res = await post("/start", { type: "technical", role: "Backend Developer", questionCount: 4 })
        const body = await res.json()
        assert.equal(res.status, 200, JSON.stringify(body))
        interviewId = body.interviewId
        assert.equal(body.totalQuestions, 4)
        assert.equal(body.adaptive, true)
        assert.equal(body.question.difficulty, "easy")
        assert.equal(body.question.questionType, "verbal")
        assert.equal(body.question.topic, "Event loop")
        assert.equal(body.interviewCoin, 450)
        assert.equal(auth.state.balance, 450)
    })

    test("an excellent spoken answer raises the difficulty", async () => {
        const res = await post("/answer", {
            interviewId,
            questionIndex: 0,
            answer: "SCORE=93 The event loop runs the callback queue after the stack empties",
            answerMode: "voice",
            timeTakenSec: 50,
            speechMetrics: {
                transcript: "um so the event loop uh runs the callback queue after the stack empties um",
                speakingTimeSec: 30, listeningTimeSec: 40, pauseCount: 3, longPauseCount: 1,
                longestPauseSec: 2.8, totalPauseSec: 5, vadAvailable: true,
            },
        })
        const body = await res.json()
        assert.equal(res.status, 200, JSON.stringify(body))
        assert.equal(body.completed, false)
        assert.equal(body.question.difficulty, "medium")
        assert.equal(body.question.topic, "REST API design")
        assert.match(body.question.question, /^\[medium\]/)
        assert.equal(body.adaptation.change, 1)
        assert.match(body.adaptation.reason, /Excellent answer \(93\/100\)/)
        assert.equal(body.feedback.score, 93)
        assert.deepEqual(body.feedback.whatWasMissing, ["Microtask queue"])
        assert.equal("followUp" in body.feedback, false)

        const stored = memory.get(interviewId)
        assert.equal(stored.questions[0].answered, true)
        assert.equal(stored.questions[0].speechMetrics.fillerCount, 3)
        assert.equal(stored.questions[0].speechMetrics.wordsPerMinute, 30) // 15 words in 30s of speech
        assert.equal(stored.processingLock, null)
    })

    test("a partially correct answer triggers one follow-up at the same difficulty", async () => {
        const res = await post("/answer", { interviewId, questionIndex: 1, answer: "SCORE=65 FOLLOWUP use REST verbs" })
        const body = await res.json()
        assert.equal(res.status, 200, JSON.stringify(body))
        assert.equal(body.question.isFollowUp, true)
        assert.equal(body.question.followUpOf, 1)
        assert.equal(body.question.questionType, "verbal")
        assert.equal(body.question.difficulty, "medium")
        assert.equal(body.question.question, "How do microtasks differ from macrotasks?")
        assert.equal(body.adaptation.type, "follow-up")
        assert.deepEqual(body.progress, { mainAnswered: 2, totalMain: 4, followUpsUsed: 1 })
    })

    test("rejects an answer for the wrong question index", async () => {
        const res = await post("/answer", { interviewId, questionIndex: 0, answer: "late duplicate" })
        assert.equal(res.status, 409)
        const body = await res.json()
        assert.equal(body.currentQuestion, 2)
    })

    test("another user cannot see or answer this interview", async () => {
        assert.equal((await post("/answer", { interviewId, answer: "hi" }, USER_B)).status, 404)
        assert.equal((await get(`/${interviewId}`, USER_B)).status, 404)
    })

    test("after the follow-up, the next planned slot (coding) is generated", async () => {
        const res = await post("/answer", { interviewId, questionIndex: 2, answer: "SCORE=70 microtasks run first" })
        const body = await res.json()
        assert.equal(res.status, 200, JSON.stringify(body))
        assert.equal(body.question.isFollowUp, false)
        assert.equal(body.question.questionType, "coding")
        assert.equal(body.question.difficulty, "medium")
        assert.ok(body.question.timer >= 300, "coding timers are at least 5 minutes")
    })

    test("a clearly wrong coding answer lowers the difficulty", async () => {
        const res = await post("/answer", {
            interviewId, questionIndex: 3, answer: "SCORE=30 def f(a): return a", answerMode: "code", codeLanguage: "python",
        })
        const body = await res.json()
        assert.equal(res.status, 200, JSON.stringify(body))
        assert.equal(body.question.difficulty, "easy")
        assert.equal(body.question.questionType, "written")
        assert.equal(body.adaptation.change, -1)
        const stored = memory.get(interviewId)
        assert.equal(stored.questions[3].codeLanguage, "python")
        assert.equal(stored.questions[3].speechMetrics, null)
    })

    test("the last answer completes the interview with a full report", async () => {
        const res = await post("/answer", { interviewId, questionIndex: 4, answer: "SCORE=80 SELECT * FROM a JOIN b ON a.id = b.a_id event loop" })
        const body = await res.json()
        assert.equal(res.status, 200, JSON.stringify(body))
        assert.equal(body.completed, true)
        const report = body.interview
        assert.equal(report.status, "completed")
        assert.equal(report.summaryStatus, "ready")
        // weights: easy 93*1, medium 65*1.2, follow-up medium 70*0.72, medium 30*1.2, easy 80*1
        assert.equal(report.overallScore, Math.round((93 + 78 + 50.4 + 36 + 80) / (1 + 1.2 + 0.72 + 1.2 + 1)))
        assert.deepEqual(report.improvementAreas, ["Algorithms: two pointers"])
        assert.ok(report.technicalSkills.includes("Node.js"))
        assert.equal(report.technicalSkills.includes("Kubernetes"), false, "ungrounded skills are dropped")
        assert.ok(report.keywords.includes("event loop"))
        assert.equal(report.keywords.includes("Kubernetes"), false, "ungrounded keywords are dropped")
        assert.equal(report.communication.available, true)
        assert.equal(report.communication.fillerCount, 3)
        assert.equal(report.communication.feedback, "Clear delivery with a few fillers.")
        assert.ok(report.completedAt)
    })

    test("answering a completed interview is refused", async () => {
        const res = await post("/answer", { interviewId, answer: "more" })
        assert.equal(res.status, 400)
    })

    test("history lists the interview with question-type breakdown", async () => {
        const body = await (await get("/history")).json()
        const item = body.data.find((i) => i._id === interviewId)
        assert.equal(item.status, "completed")
        assert.equal(item.answeredQuestions, 4)
        assert.equal(item.totalQuestions, 4)
        assert.equal(item.followUps, 1)
        assert.deepEqual(item.questionTypes, { verbal: 3, written: 1, coding: 1 })
        assert.equal((await (await get("/history", USER_B)).json()).data.length, 0)
    })

    test("dashboard stats still work (and come from cache the second time)", async () => {
        const first = await (await get("/all")).json()
        assert.equal(first.stats.completed, 1)
        assert.equal(first.technicalCount, 1)
        assert.equal(first.technicalData.length, 8)
        const cached = await redis.get(`interviews:${USER_A}`)
        assert.ok(cached)
    })
})

describe("interview API — failures and recovery", () => {
    test("LLM failure at start refunds the coins", async () => {
        const before = auth.state.balance
        groq.setResponder(() => ({ __status: 500 }))
        const res = await post("/start", { type: "hr", role: "HR Executive" })
        groq.setResponder(defaultResponder)
        assert.equal(res.status, 502)
        const body = await res.json()
        assert.match(body.message, /refunded/)
        assert.equal(auth.state.balance, before)
    })

    test("insufficient coins are reported as 402", async () => {
        const saved = auth.state.balance
        auth.state.balance = 10
        const res = await post("/start", { type: "hr", role: "HR Executive" })
        auth.state.balance = saved
        assert.equal(res.status, 402)
    })

    test("LLM failure while grading keeps the question open for a retry", async () => {
        const start = await (await post("/start", { type: "hr", role: "HR Executive", questionCount: 4 })).json()
        assert.equal(start.question.questionType, "verbal")

        groq.setResponder((p) => (p.includes("evaluating one answer") ? "not json" : defaultResponder(p)))
        const failed = await post("/answer", { interviewId: start.interviewId, questionIndex: 0, answer: "SCORE=60 I am a team player" })
        assert.equal(failed.status, 502)
        assert.equal((await failed.json()).retryable, true)
        assert.equal(memory.get(start.interviewId).processingLock, null)
        assert.equal(memory.get(start.interviewId).questions[0].answered, false)

        groq.setResponder(defaultResponder)
        const retried = await post("/answer", { interviewId: start.interviewId, questionIndex: 0, answer: "SCORE=60 I am a team player" })
        assert.equal(retried.status, 200)
    })

    test("a double submit is processed only once", async () => {
        const start = await (await post("/start", { type: "technical", role: "Frontend Developer", questionCount: 4 })).json()
        groq.setResponder(async (p) => {
            if (p.includes("evaluating one answer")) await new Promise((r) => setTimeout(r, 150))
            return defaultResponder(p)
        })
        const body = { interviewId: start.interviewId, questionIndex: 0, answer: "SCORE=60 virtual DOM diffing" }
        const [a, b] = await Promise.all([post("/answer", body), post("/answer", body)])
        groq.setResponder(defaultResponder)
        assert.deepEqual([a.status, b.status].sort(), [200, 409])
        assert.equal(memory.get(start.interviewId).questions.length, 2)
    })

    test("a failed AI summary still completes the interview and can be regenerated", async () => {
        const start = await (await post("/start", { type: "technical", role: "Data Analyst", questionCount: 4 })).json()
        const id = start.interviewId
        groq.setResponder((p) => (p.includes("writing the final report") ? { __status: 500 } : defaultResponder(p)))
        let res
        for (let i = 0; i < 4; i++) {
            res = await (await post("/answer", { interviewId: id, answer: "SCORE=70 joins and group by" })).json()
        }
        assert.equal(res.completed, true)
        assert.equal(res.interview.summaryStatus, "failed")
        assert.ok(res.interview.overallScore > 0, "deterministic score is still computed")
        assert.ok(res.interview.questions.every((q) => q.feedback.feedback), "per-question feedback is kept")

        groq.setResponder(defaultResponder)
        const regen = await post(`/${id}/summary`, {})
        const body = await regen.json()
        assert.equal(regen.status, 200, JSON.stringify(body))
        assert.equal(body.interview.summaryStatus, "ready")
        assert.equal(body.interview.summary, "Solid fundamentals on the event loop; coding needs work.")
    })

    test("legacy (non-adaptive) interviews keep working", async () => {
        const legacy = await Interview.create({
            userId: USER_A,
            type: "technical",
            role: "Java Developer",
            questions: [
                { question: "What is the JVM?", difficulty: "easy", timer: 60 },
                { question: "Explain garbage collection.", difficulty: "medium", timer: 90 },
            ],
            currentQuestion: 0,
            status: "in-progress",
        })
        const id = String(legacy._id)
        const first = await (await post("/answer", { interviewId: id, answer: "SCORE=75 runs bytecode" })).json()
        assert.equal(first.completed, false)
        assert.equal(first.question.question, "Explain garbage collection.")
        assert.equal(first.adaptation, null)
        const last = await (await post("/answer", { interviewId: id, answer: "SCORE=85 generational collection" })).json()
        assert.equal(last.completed, true)
        assert.equal(last.interview.questions.length, 2)
        assert.equal(last.interview.summaryStatus, "ready")
    })

    test("delete is limited to the owner", async () => {
        const created = await (await post("/start", { type: "hr", role: "Recruiter", questionCount: 4 })).json()
        const asB = await fetch(`${api.url}/${created.interviewId}`, { method: "DELETE", headers: authHeaders(USER_B) })
        assert.equal(asB.status, 404)
        const asA = await fetch(`${api.url}/${created.interviewId}`, { method: "DELETE", headers: authHeaders(USER_A) })
        assert.equal(asA.status, 200)
        assert.equal(memory.get(created.interviewId), undefined)
    })
})
