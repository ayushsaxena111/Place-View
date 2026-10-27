import { authHeaders, SECRET, USER_A, USER_B } from "./helpers/env.js"
import { test, describe, before, after, mock } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { Readable } from "node:stream"
import { fileURLToPath, pathToFileURL } from "node:url"
import { serve, startFakeAuth, startFakeGroq } from "./helpers/fakeServers.js"
import { installMemoryModel } from "./helpers/memoryModel.js"
import { makePdf } from "./helpers/pdf.js"
import { normalizeResumeAnalysis } from "../services/resume/utils/normalizeResume.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const serviceDir = path.join(here, "..", "services", "resume")

describe("resume analysis normalisation", () => {
    test("coerces the model's output into the schema", () => {
        const r = normalizeResumeAnalysis({
            name: "Jane", score: "142", skills: "Node, React; Node",
            projects: ["A plain string project", { name: "Shop", tech: ["React"] }],
            education: [{ school: "IIT", degree: "B.Tech", cgpa: "8.1" }],
            experience: "not an array",
            strengths: [{ title: "Teamwork" }, "", null],
        })
        assert.equal(r.score, 100)
        assert.deepEqual(r.skills, ["Node", "React"])
        assert.equal(r.projects[0].description, "A plain string project")
        assert.deepEqual(r.projects[1].technologies, ["React"])
        assert.equal(r.education[0].institution, "IIT")
        assert.equal(r.education[0].details, "8.1")
        assert.deepEqual(r.experience, [])
        assert.deepEqual(r.strengths, ["Teamwork"])
    })
})

describe("resume API — upload and history", () => {
    let groq, auth, api, resumes, versions, redis
    const files = new Map()
    let fail = false

    const analysis = (role) => ({
        name: "Jane Doe", email: "jane@example.com", phone: "", summary: "Backend developer",
        skills: ["Node.js", "MongoDB"], projects: [{ title: "API", description: "REST API", technologies: ["Express"] }],
        education: [], experience: [], strengths: ["APIs"], weaknesses: ["Testing"], missingSkills: ["Docker"],
        suggestedRole: role, score: 72, recommendations: ["Add metrics"],
    })

    const upload = async (buffer, { userId = USER_A, name = "Jane Resume.pdf", type = "application/pdf" } = {}) => {
        const form = new FormData()
        form.append("resume", new Blob([buffer], { type }), name)
        const headers = authHeaders(userId)
        delete headers["content-type"]
        return fetch(`${api.url}/upload`, { method: "POST", headers, body: form })
    }
    const get = (p, userId = USER_A) => fetch(`${api.url}${p}`, { headers: authHeaders(userId) })
    const post = (p, userId = USER_A) => fetch(`${api.url}${p}`, { method: "POST", headers: authHeaders(userId) })
    const del = (p, userId = USER_A) => fetch(`${api.url}${p}`, { method: "DELETE", headers: authHeaders(userId) })

    let role = "Backend Developer"

    before(async () => {
        groq = await startFakeGroq(() => (fail ? "garbage" : analysis(role)))
        auth = await startFakeAuth({ balance: 100, secret: SECRET })
        process.env.GROQ_BASE_URL = groq.url
        process.env.AUTH_SERVICE_URL = auth.url

        // GridFS needs a live MongoDB; replace only the file store.
        let n = 0
        mock.module(pathToFileURL(path.join(serviceDir, "utils", "fileStore.js")).href, {
            namedExports: {
                saveResumeFile: async (filePath, { userId }) => {
                    const id = `64b7f0c2a1b2c3d4e5f6${String(++n).padStart(4, "0")}`
                    files.set(id, { bytes: fs.readFileSync(filePath), userId })
                    return id
                },
                openResumeFile: (id) => Readable.from([files.get(String(id)).bytes]),
                deleteResumeFile: async (id) => { files.delete(String(id)) },
            },
        })

        redis = (await import("../shared/redis/redis.js")).default
        await redis.flushdb()
        resumes = installMemoryModel((await import("../services/resume/models/resume.model.js")).default)
        versions = installMemoryModel((await import("../services/resume/models/resumeVersion.model.js")).default)

        // The upload middleware writes to ./uploads relative to the working directory.
        process.chdir(serviceDir)
        const express = (await import("../services/resume/node_modules/express/index.js")).default
        const { default: router } = await import("../services/resume/routes/resume.route.js")
        const app = express()
        app.use(express.json())
        app.use("/", router)
        api = await serve(app)
    })

    after(async () => {
        resumes.restore()
        versions.restore()
        await api.close()
        await groq.close()
        await auth.close()
        await redis.flushdb()
        redis.disconnect()
    })

    const uploadsLeft = () => fs.readdirSync(path.join(serviceDir, "uploads")).filter((f) => f.endsWith(".pdf"))

    const RESUME_LINES = [
        "Jane Doe - Backend Developer",
        "Skills: Node.js, Express, MongoDB, Redis",
        "Projects: Built a REST API serving 10k users with caching and tests",
    ]

    test("rejects a file that is not really a PDF, without charging", async () => {
        const res = await upload(Buffer.from("hello, I am not a pdf"))
        assert.equal(res.status, 400)
        assert.match((await res.json()).message, /not a valid PDF/)
        assert.equal(auth.state.balance, 100)
        assert.deepEqual(uploadsLeft(), [])
    })

    test("rejects non-PDF uploads by type", async () => {
        const res = await upload(Buffer.from("x"), { name: "a.png", type: "image/png" })
        assert.equal(res.status, 400)
    })

    test("rejects a PDF without readable text (e.g. scanned), without charging", async () => {
        const res = await upload(makePdf([]))
        assert.equal(res.status, 422)
        assert.equal(auth.state.balance, 100)
    })

    let firstVersion
    test("analyses a resume, stores the file and records history", async () => {
        const res = await upload(makePdf(RESUME_LINES))
        const body = await res.json()
        assert.equal(res.status, 200, JSON.stringify(body))
        assert.equal(body.interviewCoin, 90)
        assert.equal(body.data.suggestedRole, "Backend Developer")
        assert.equal(body.data.score, 72)
        assert.ok(body.versionId)
        firstVersion = body.versionId
        assert.equal(String(body.data.activeVersionId), String(firstVersion))

        const stored = versions.get(firstVersion)
        assert.equal(stored.fileName, "Jane Resume.pdf")
        assert.match(stored.extractedText, /REST API serving 10k users/)
        assert.equal(files.size, 1)
        assert.deepEqual(uploadsLeft(), [], "temporary upload is removed")
    })

    test("LLM failure refunds the coins and cleans up", async () => {
        fail = true
        const res = await upload(makePdf(RESUME_LINES))
        fail = false
        assert.equal(res.status, 500)
        assert.match((await res.json()).message, /refunded/)
        assert.equal(auth.state.balance, 90)
        assert.equal(files.size, 1)
        assert.deepEqual(uploadsLeft(), [])
    })

    let secondVersion
    test("a second upload becomes current; history keeps both", async () => {
        role = "Full Stack Developer"
        const body = await (await upload(makePdf(RESUME_LINES), { name: "v2.pdf" })).json()
        secondVersion = body.versionId
        const history = (await (await get("/history")).json()).data
        assert.equal(history.length, 2)
        assert.deepEqual(history.map((h) => h.isActive), [true, false])
        assert.equal(history[0].suggestedRole, "Full Stack Developer")
        assert.equal("extractedText" in history[0], false)
        assert.equal((await (await get("/history", USER_B)).json()).data.length, 0)
    })

    test("an older resume can be reopened, downloaded and made current again", async () => {
        const version = await (await get(`/history/${firstVersion}`)).json()
        assert.equal(version.data.suggestedRole, "Backend Developer")
        assert.equal(version.data.isActive, false)
        assert.equal("extractedText" in version.data, false)

        const file = await get(`/history/${firstVersion}/file`)
        assert.equal(file.status, 200)
        assert.equal(file.headers.get("content-type"), "application/pdf")
        assert.match(file.headers.get("content-disposition"), /Jane Resume\.pdf/)
        assert.equal(file.headers.get("cache-control"), "private, no-store")
        assert.equal(Buffer.from(await file.arrayBuffer()).subarray(0, 5).toString(), "%PDF-")

        const activated = await (await post(`/history/${firstVersion}/activate`)).json()
        assert.equal(activated.data.suggestedRole, "Backend Developer")
        const current = await (await get("/get-resume")).json()
        assert.equal(current.data.suggestedRole, "Backend Developer")
    })

    test("other users cannot read, download, activate or delete it", async () => {
        assert.equal((await get(`/history/${firstVersion}`, USER_B)).status, 404)
        assert.equal((await get(`/history/${firstVersion}/file`, USER_B)).status, 404)
        assert.equal((await post(`/history/${firstVersion}/activate`, USER_B)).status, 404)
        assert.equal((await del(`/history/${firstVersion}`, USER_B)).status, 404)
        assert.equal((await get(`/history/not-an-id`)).status, 404)
    })

    test("deleting the current resume promotes the next one; deleting all clears it", async () => {
        const first = await (await del(`/history/${firstVersion}`)).json()
        assert.equal(first.activeResume.suggestedRole, "Full Stack Developer")
        assert.equal(files.size, 1)
        const last = await (await del(`/history/${secondVersion}`)).json()
        assert.equal(last.activeResume, null)
        assert.equal((await get("/get-resume")).status, 404)
        assert.equal(files.size, 0)
    })

    test("a resume uploaded before history existed appears as a legacy entry", async () => {
        const Resume = (await import("../services/resume/models/resume.model.js")).default
        await Resume.create({ userId: USER_B, extractedText: "old text", suggestedRole: "Tester", score: 55 })
        const history = (await (await get("/history", USER_B)).json()).data
        assert.equal(history.length, 1)
        assert.equal(history[0].isLegacy, true)
        assert.equal(history[0].hasFile, false)
        assert.equal(history[0].isActive, true)
        const file = await get(`/history/${history[0]._id}/file`, USER_B)
        assert.equal(file.status, 404)
        assert.match((await file.json()).message, /not available/)
    })
})
