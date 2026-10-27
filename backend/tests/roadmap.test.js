import { authHeaders, SECRET, USER_A, USER_B } from "./helpers/env.js"
import { test, describe, before, after } from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import express from "../services/roadmap/node_modules/express/index.js"
import { serve, startFakeAuth, startFakeGroq } from "./helpers/fakeServers.js"
import { installMemoryModel } from "./helpers/memoryModel.js"
import {
    assessFeasibility,
    buildMilestones,
    computeProgress,
    rescheduleRemaining,
    resolveDuration,
    resolveHoursPerWeek,
    scheduleModules,
} from "../services/roadmap/engine/schedule.js"
import { buildInsights } from "../services/roadmap/configs/interviewInsights.js"
import { isHttpUrl, isReachable } from "../services/roadmap/configs/linkCheck.js"

const WEEK = 7 * 24 * 3600 * 1000
const start = new Date("2026-01-05T00:00:00Z")

describe("duration and scheduling", () => {
    test("presets and custom durations resolve to weeks", () => {
        assert.deepEqual(resolveDuration({ preset: "3m" }), { preset: "3m", weeks: 13, label: "3 months (13 weeks)" })
        assert.equal(resolveDuration({ preset: "1y" }).weeks, 52)
        assert.equal(resolveDuration({ preset: "custom", value: 10, unit: "weeks" }).weeks, 10)
        assert.equal(resolveDuration({ preset: "custom", value: 4, unit: "months" }).weeks, 17)
        assert.equal(resolveDuration(undefined).preset, "auto")
    })

    test("invalid durations are rejected", () => {
        assert.throws(() => resolveDuration({ preset: "custom", value: 1, unit: "weeks" }), /between/)
        assert.throws(() => resolveDuration({ preset: "custom", value: 30, unit: "months" }), /between/)
        assert.throws(() => resolveDuration({ preset: "custom", value: 5, unit: "days" }), /unit/)
        assert.throws(() => resolveDuration({ preset: "2y" }), /Unknown/)
        assert.throws(() => resolveHoursPerWeek(100), /between/)
        assert.equal(resolveHoursPerWeek(undefined), 10)
    })

    test("modules are laid out in order, proportional to their hours", () => {
        const { modules, totalHours } = scheduleModules(
            [{ title: "A", estimatedHours: 10 }, { title: "B", estimatedHours: 30 }, { title: "C", estimatedHours: 0, duration: "2 weeks" }],
            { durationWeeks: 8, hoursPerWeek: 10, startDate: start }
        )
        // C has no hours estimate: its "2 weeks" text is converted at 10 h/week = 20 h.
        assert.equal(totalHours, 60)
        assert.deepEqual(modules.map((m) => [m.startWeek, m.endWeek]), [[0, 1.3], [1.3, 5.3], [5.3, 8]])
        assert.equal(modules[2].endDate.getTime(), start.getTime() + 8 * WEEK)
        assert.equal(modules[1].duration, "Weeks 2–6 · ~30 hrs")
    })

    test("feasibility compares required and available hours honestly", () => {
        assert.equal(assessFeasibility({ totalHours: 100, durationWeeks: 10, hoursPerWeek: 10 }).status, "realistic")
        assert.equal(assessFeasibility({ totalHours: 60, durationWeeks: 10, hoursPerWeek: 10 }).status, "comfortable")
        const intensive = assessFeasibility({ totalHours: 200, durationWeeks: 10, hoursPerWeek: 10 })
        assert.equal(intensive.status, "intensive")
        assert.match(intensive.note, /20 weeks/)
    })

    test("milestones are validated, or derived from the real modules", () => {
        const modules = ["A", "B", "C", "D", "E"].map((title, i) => ({ title, endWeek: i + 1, endDate: new Date(start.getTime() + (i + 1) * WEEK) }))
        const good = buildMilestones(
            [{ title: "Basics", goal: "x", moduleIndexes: [0, 1] }, { title: "Advanced", goal: "y", moduleIndexes: [2, 3, 4] }],
            modules
        )
        assert.deepEqual(good.map((m) => [m.title, m.targetWeek]), [["Basics", 2], ["Advanced", 5]])

        const derived = buildMilestones([{ title: "Only one", moduleIndexes: [0, 99] }], modules)
        assert.equal(derived.length, 2)
        assert.deepEqual(derived.flatMap((m) => m.moduleIndexes), [0, 1, 2, 3, 4])
        assert.equal(derived[0].title, "A → C")
    })

    test("progress is measured by hours and compared with the schedule", () => {
        const roadmap = {
            startDate: start,
            endDate: new Date(start.getTime() + 4 * WEEK),
            modules: [
                { estimatedHours: 10, status: "completed", startDate: start, endDate: new Date(start.getTime() + 2 * WEEK) },
                { estimatedHours: 10, status: "not-started", startDate: new Date(start.getTime() + 2 * WEEK), endDate: new Date(start.getTime() + 4 * WEEK) },
            ],
        }
        const onTrack = computeProgress(roadmap, new Date(start.getTime() + 2 * WEEK))
        assert.deepEqual(onTrack, { completedModules: 1, totalModules: 2, percent: 50, expectedPercent: 50, status: "on-track" })
        assert.equal(computeProgress(roadmap, new Date(start.getTime() + 4 * WEEK)).status, "behind")
        assert.equal(computeProgress(roadmap, new Date(start.getTime() + WEEK / 2)).status, "ahead")
    })

    test("rescheduling replans only unfinished modules from today", () => {
        const today = new Date(start.getTime() + 3 * WEEK)
        const roadmap = {
            startDate: start,
            endDate: new Date(start.getTime() + 6 * WEEK),
            hoursPerWeek: 10,
            modules: [
                { title: "A", estimatedHours: 10, status: "completed", startWeek: 0, endWeek: 2 },
                { title: "B", estimatedHours: 10, status: "not-started", startWeek: 2, endWeek: 4 },
                { title: "C", estimatedHours: 30, status: "in-progress", startWeek: 4, endWeek: 6 },
            ],
        }
        const r = rescheduleRemaining(roadmap, { endDate: new Date(start.getTime() + 7 * WEEK), now: today })
        assert.deepEqual(r.modules[0], roadmap.modules[0])
        assert.equal(r.modules[1].startDate.getTime(), today.getTime())
        assert.equal(r.modules[2].endDate.getTime(), start.getTime() + 7 * WEEK)
        assert.equal(r.modules[1].startWeek, 3)
        assert.equal(r.durationWeeks, 7)
        assert.equal(r.feasibility.requiredHoursPerWeek, 10)
        assert.throws(() => rescheduleRemaining(roadmap, { endDate: today, now: today }), /at least one week/)
    })

    test("interview insights pick out weak and strong topics", () => {
        const insights = buildInsights({
            _id: "x", role: "Dev", type: "technical", overallScore: 61,
            weaknesses: ["Caching"], improvementAreas: ["System design"],
            questions: [
                { answered: true, topic: "Redis", feedback: { score: 40, keyConceptsMissed: ["TTL", "eviction"] } },
                { answered: true, topic: "REST", feedback: { score: 85 } },
                { answered: false, topic: "Unanswered", feedback: { score: 0 } },
            ],
        })
        assert.deepEqual(insights.lowScoringTopics, [{ topic: "Redis", score: 40, missedConcepts: ["TTL", "eviction"] }])
        assert.deepEqual(insights.strongTopics, ["REST"])
    })

    test("generated article links must be real http(s) URLs that resolve", async () => {
        assert.equal(isHttpUrl("javascript:alert(1)"), false)
        const fakeFetch = async (url) => ({ status: url.includes("missing") ? 404 : url.includes("bot") ? 403 : 200, body: null })
        assert.equal(await isReachable("https://docs.example.com/ok", { fetchImpl: fakeFetch }), true)
        assert.equal(await isReachable("https://docs.example.com/bot-blocked", { fetchImpl: fakeFetch }), true)
        assert.equal(await isReachable("https://docs.example.com/missing", { fetchImpl: fakeFetch }), false)
    })
})

describe("roadmap API", () => {
    let groq, auth, api, memory, redis, interviewService, lastRoadmapPrompt
    const completedInterviewId = "64b7f0c2a1b2c3d4e5f607aa"

    const responder = (prompt) => {
        if (prompt.includes("Learning Roadmap Generator")) {
            lastRoadmapPrompt = prompt
            return {
                title: "Backend Developer Roadmap",
                targetPackage: "20 LPA",
                level: "intermediate",
                summary: "Focus on caching and system design first.",
                totalWeeks: 9,
                modules: [
                    { title: "Redis caching", difficulty: "medium", description: "TTL, eviction.", estimatedHours: 40, skills: ["Redis"], whyIncluded: "Interview weakness: caching", practiceTask: "Cache an API" },
                    { title: "System design basics", difficulty: "hard", description: "Load balancing.", estimatedHours: 60, skills: ["Design"], whyIncluded: "Improvement area", practiceTask: "Design a URL shortener" },
                    { title: "Docker", difficulty: "EASY", description: "Containers.", estimatedHours: 30, skills: ["Docker"], whyIncluded: "Missing skill", practiceTask: "Containerise the API" },
                    { title: "Mock interviews", difficulty: "Medium", description: "Practice.", estimatedHours: 0, skills: [], whyIncluded: "", practiceTask: "" },
                ],
                milestones: [
                    { title: "Performance", goal: "Ship a cached API", moduleIndexes: [0, 1] },
                    { title: "Deploy & interview", goal: "Deploy and pass mocks", moduleIndexes: [2, 3] },
                ],
            }
        }
        // resource agent
        return []
    }

    const post = (path, body, userId = USER_A) =>
        fetch(`${api.url}${path}`, { method: "POST", headers: authHeaders(userId), body: JSON.stringify(body) })
    const patch = (path, body, userId = USER_A) =>
        fetch(`${api.url}${path}`, { method: "PATCH", headers: authHeaders(userId), body: JSON.stringify(body) })
    const get = (path, userId = USER_A) => fetch(`${api.url}${path}`, { headers: authHeaders(userId) })

    before(async () => {
        groq = await startFakeGroq(responder)
        auth = await startFakeAuth({ balance: 100, secret: SECRET })

        // Fake interview service: serves one completed interview to USER_A only.
        interviewService = http.createServer((req, res) => {
            const ok = req.headers["x-internal-secret"] === SECRET && req.headers["x-user-id"] === USER_A &&
                req.url === `/${completedInterviewId}`
            res.writeHead(ok ? 200 : 404, { "content-type": "application/json" })
            res.end(JSON.stringify(ok ? {
                success: true,
                interview: {
                    _id: completedInterviewId, role: "Backend Developer", type: "technical", status: "completed",
                    overallScore: 58, weaknesses: ["Caching strategies"], improvementAreas: ["System design: caching"],
                    questions: [{ answered: true, topic: "Redis", feedback: { score: 35, keyConceptsMissed: ["eviction"] } }],
                },
            } : { success: false }))
        })
        await new Promise((r) => interviewService.listen(0, "127.0.0.1", r))

        process.env.GROQ_BASE_URL = groq.url
        process.env.AUTH_SERVICE_URL = auth.url
        process.env.INTERVIEW_SERVICE_URL = `http://127.0.0.1:${interviewService.address().port}`
        process.env.YOUTUBE_API_KEY = ""

        redis = (await import("../shared/redis/redis.js")).default
        await redis.flushdb()
        const Roadmap = (await import("../services/roadmap/models/roadmap.model.js")).default
        memory = installMemoryModel(Roadmap)
        const { default: router } = await import("../services/roadmap/routes/roadmap.route.js")
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
        await new Promise((r) => interviewService.close(r))
        await redis.flushdb()
        redis.disconnect()
    })

    let roadmapId

    test("rejects an invalid custom duration before charging", async () => {
        const res = await post("/generate", { role: "Backend", targetPackage: "20 LPA", duration: { preset: "custom", value: 1, unit: "weeks" } })
        assert.equal(res.status, 400)
        assert.equal(auth.state.balance, 100)
    })

    test("generates a 3-month roadmap personalised with interview results", async () => {
        const res = await post("/generate", {
            role: "Backend Developer",
            targetPackage: "20 LPA",
            duration: { preset: "3m" },
            hoursPerWeek: 12,
            startDate: new Date().toISOString().slice(0, 10),
            interviewId: completedInterviewId,
            useResume: true,
            resume: { skills: ["Node.js"], missingSkills: ["Docker"] },
        })
        const body = await res.json()
        assert.equal(res.status, 201, JSON.stringify(body))
        const r = body.data
        roadmapId = r._id
        assert.equal(r.durationWeeks, 13)
        assert.equal(r.duration, "3 months (13 weeks)")
        assert.equal(r.hoursPerWeek, 12)
        assert.equal(r.level, "Intermediate")
        assert.equal(r.modules[2].difficulty, "Easy")
        assert.equal(r.modules.at(-1).endWeek, 13)
        assert.equal(r.milestones.length, 2)
        assert.equal(r.milestones[1].targetWeek, 13)
        assert.equal(r.personalization.usedInterview, true)
        assert.equal(r.personalization.interviewScore, 58)
        assert.deepEqual(r.personalization.focusAreas, ["System design: caching", "Caching strategies", "Docker"])
        assert.equal(r.progress.percent, 0)
        assert.equal(body.interviewCoin, 80)
        assert.match(lastRoadmapPrompt, /13 weeks at about 12 study hours per week/)
        assert.match(lastRoadmapPrompt, /"lowScoringTopics"/)
        assert.match(lastRoadmapPrompt, /eviction/)
    })

    test("roadmaps from another user's interview are refused", async () => {
        const res = await post("/generate", { role: "Dev", targetPackage: "10 LPA", interviewId: completedInterviewId }, USER_B)
        assert.equal(res.status, 404)
    })

    test("module progress is tracked and an ownership check applies", async () => {
        const res = await patch(`/${roadmapId}/modules/0`, { status: "completed" })
        const body = await res.json()
        assert.equal(res.status, 200, JSON.stringify(body))
        assert.equal(body.data.modules[0].status, "completed")
        assert.ok(body.data.modules[0].completedAt)
        assert.equal(body.data.progress.completedModules, 1)
        assert.ok(body.data.progress.percent > 0)

        assert.equal((await patch(`/${roadmapId}/modules/0`, { status: "done" })).status, 400)
        assert.equal((await patch(`/${roadmapId}/modules/9`, { status: "completed" })).status, 400)
        assert.equal((await patch(`/${roadmapId}/modules/1`, { status: "completed" }, USER_B)).status, 404)
    })

    test("cached roadmaps are never served to another user", async () => {
        assert.equal((await get(`/${roadmapId}`)).status, 200)
        assert.equal((await get(`/${roadmapId}`)).status, 200) // now from cache
        assert.equal((await get(`/${roadmapId}`, USER_B)).status, 404)
    })

    test("updating a roadmap keeps progress for surviving modules", async () => {
        const res = await post("/generate", {
            role: "Backend Developer", targetPackage: "20 LPA", duration: { preset: "6m" }, updateRoadmapId: roadmapId,
        })
        const body = await res.json()
        assert.equal(res.status, 200, JSON.stringify(body))
        assert.equal(body.data._id, roadmapId)
        assert.equal(body.data.revision, 2)
        assert.equal(body.data.durationWeeks, 26)
        assert.equal(body.data.modules[0].status, "completed")
    })

    test("reschedule rejects bad input and replans otherwise", async () => {
        assert.equal((await post(`/${roadmapId}/reschedule`, { endDate: "not a date" })).status, 400)
        const end = new Date(Date.now() + 20 * WEEK).toISOString()
        const res = await post(`/${roadmapId}/reschedule`, { endDate: end, hoursPerWeek: 8 })
        const body = await res.json()
        assert.equal(res.status, 200, JSON.stringify(body))
        assert.equal(body.data.hoursPerWeek, 8)
        assert.equal(body.data.modules[0].status, "completed")
        assert.match(body.data.duration, /rescheduled/)
    })

    test("AI-decided duration uses the model's estimate", async () => {
        const res = await post("/generate", { role: "Backend", targetPackage: "10 LPA" })
        const body = await res.json()
        assert.equal(res.status, 201, JSON.stringify(body))
        assert.equal(body.data.durationWeeks, 9)
        assert.equal(body.data.durationPreset, "auto")
    })

    test("insufficient coins stop generation", async () => {
        auth.state.balance = 5
        const res = await post("/generate", { role: "Backend", targetPackage: "10 LPA", duration: { preset: "1y" } })
        assert.equal(res.status, 402)
    })

    test("by-interview lookup and listing", async () => {
        const found = await (await get(`/by-interview/${completedInterviewId}`)).json()
        assert.equal(found.data._id, roadmapId)
        const list = await (await get("/all")).json()
        assert.equal(list.data.length, 2)
        assert.ok(list.data.every((r) => r.progress))
        assert.equal((await (await get("/all", USER_B)).json()).data.length, 0)
    })

    test("delete is limited to the owner", async () => {
        const del = (u) => fetch(`${api.url}/${roadmapId}`, { method: "DELETE", headers: authHeaders(u) })
        assert.equal((await del(USER_B)).status, 404)
        assert.equal((await del(USER_A)).status, 200)
    })
})
