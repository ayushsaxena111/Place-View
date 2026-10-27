// Test-only HTTP servers.
//
// fakeGroq: an OpenAI-compatible endpoint that the real ChatGroq client talks
// to (via GROQ_BASE_URL). Each test supplies a responder that decides what the
// "model" returns for a given prompt, so the real agent → parse → normalise →
// graph path is exercised without network access.
//
// fakeAuth: the auth service's internal coin endpoints, with an in-memory balance.

import http from "node:http"

const readBody = (req) =>
    new Promise((resolve) => {
        let data = ""
        req.on("data", (chunk) => (data += chunk))
        req.on("end", () => {
            try {
                resolve(data ? JSON.parse(data) : {})
            } catch {
                resolve({})
            }
        })
    })

const listen = (server) =>
    new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`))
    })

export const startFakeGroq = async (responder) => {
    const calls = []
    const state = { responder }
    const server = http.createServer(async (req, res) => {
        const body = await readBody(req)
        const prompt = (body.messages || [])
            .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
            .join("\n\n")
        calls.push(prompt)

        let content
        try {
            content = await state.responder(prompt, calls.length)
        } catch (error) {
            res.writeHead(500, { "content-type": "application/json" })
            res.end(JSON.stringify({ error: { message: error.message } }))
            return
        }
        if (content && content.__status) {
            res.writeHead(content.__status, { "content-type": "application/json" })
            res.end(JSON.stringify({ error: { message: "fake failure" } }))
            return
        }
        const text = typeof content === "string" ? content : JSON.stringify(content)
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({
            id: `chatcmpl-${calls.length}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: body.model || "test",
            choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }))
    })
    const url = await listen(server)
    return {
        url,
        calls,
        setResponder: (fn) => (state.responder = fn),
        close: () => new Promise((r) => server.close(r)),
    }
}

export const startFakeAuth = async ({ balance = 500, secret }) => {
    const state = { balance, requests: [] }
    const server = http.createServer(async (req, res) => {
        const body = await readBody(req)
        state.requests.push({ path: req.url, body, secret: req.headers["x-internal-secret"] })
        const send = (status, payload) => {
            res.writeHead(status, { "content-type": "application/json" })
            res.end(JSON.stringify(payload))
        }
        if (req.headers["x-internal-secret"] !== secret) return send(403, { success: false, message: "Forbidden" })
        if (req.url === "/internal/use-coins") {
            if (state.balance < body.coins) {
                return send(402, { success: false, message: "Not enough interview coins", interviewCoin: state.balance })
            }
            state.balance -= body.coins
            return send(200, { success: true, interviewCoin: state.balance })
        }
        if (req.url === "/internal/add-coins") {
            state.balance += body.coins
            return send(200, { success: true, interviewCoin: state.balance })
        }
        send(404, { success: false })
    })
    const url = await listen(server)
    return { url, state, close: () => new Promise((r) => server.close(r)) }
}

/** Start an express app on a random port. */
export const serve = (app) =>
    new Promise((resolve) => {
        const server = app.listen(0, "127.0.0.1", () => {
            resolve({
                url: `http://127.0.0.1:${server.address().port}`,
                close: () => new Promise((r) => server.close(r)),
            })
        })
    })
