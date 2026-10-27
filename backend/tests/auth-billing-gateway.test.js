import { authHeaders, SECRET, USER_A, USER_B } from "./helpers/env.js"
import { test, describe, before, after, mock } from "node:test"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import http from "node:http"
import { serve, startFakeAuth } from "./helpers/fakeServers.js"
import { installMemoryModel } from "./helpers/memoryModel.js"

let redis

before(async () => {
    redis = (await import("../shared/redis/redis.js")).default
    await redis.flushdb()
})

after(async () => {
    await redis.flushdb()
    redis.disconnect()
})

describe("auth service — coins", () => {
    let api, users, userId

    before(async () => {
        process.env.NODE_ENV = "test"
        const User = (await import("../services/auth/model/user.model.js")).default
        users = installMemoryModel(User)
        const created = await User.create({ firebaseUid: "uid-1", email: "a@b.c", name: "Test User", interviewCoin: 100 })
        userId = String(created._id)
        await redis.set("session:sess-1", JSON.stringify({ userId, name: "Test User", email: "a@b.c", interviewCoin: 100 }), "EX", 3600)

        const express = (await import("../services/auth/node_modules/express/index.js")).default
        const cookieParser = (await import("../services/auth/node_modules/cookie-parser/index.js")).default
        const { default: router } = await import("../services/auth/routes/auth.route.js")
        const app = express()
        app.use(express.json())
        app.use(cookieParser())
        app.use("/", router)
        api = await serve(app)
    })

    after(async () => {
        users.restore()
        await api.close()
    })

    const asBrowser = (path, body) =>
        fetch(`${api.url}${path}`, {
            method: "POST",
            headers: { "content-type": "application/json", cookie: "session=sess-1" },
            body: JSON.stringify(body),
        })
    const asService = (path, body, secret = SECRET) =>
        fetch(`${api.url}${path}`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-internal-secret": secret },
            body: JSON.stringify(body),
        })

    test("a browser can no longer mint coins through /add-coins", async () => {
        const res = await asBrowser("/add-coins", { coins: 100000 })
        assert.equal(res.status, 403)
        assert.equal(users.get(userId).interviewCoin, 100)
    })

    test("negative or fractional coin amounts are rejected (they used to add coins)", async () => {
        assert.equal((await asBrowser("/use-coins", { coins: -500 })).status, 400)
        assert.equal((await asBrowser("/use-coins", { coins: 1.5 })).status, 400)
        assert.equal(users.get(userId).interviewCoin, 100)
    })

    test("use-coins requires a session", async () => {
        const res = await fetch(`${api.url}/use-coins`, {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ coins: 10 }),
        })
        assert.equal(res.status, 401)
    })

    test("use-coins deducts atomically and refreshes the session", async () => {
        const res = await asBrowser("/use-coins", { coins: 10, action: "download-pdf" })
        const body = await res.json()
        assert.equal(res.status, 200)
        assert.equal(body.interviewCoin, 90)
        assert.equal(JSON.parse(await redis.get("session:sess-1")).interviewCoin, 90)
        assert.ok((await redis.ttl("session:sess-1")) <= 3600, "session lifetime is not extended")
        assert.equal((await asBrowser("/use-coins", { coins: 1000 })).status, 403)
    })

    test("internal endpoints need the shared secret", async () => {
        assert.equal((await asService("/internal/use-coins", { userId, coins: 5 }, "wrong")).status, 403)
        const charged = await (await asService("/internal/use-coins", { userId, coins: 50, sessionId: "sess-1" })).json()
        assert.equal(charged.interviewCoin, 40)
        const tooMuch = await asService("/internal/use-coins", { userId, coins: 50 })
        assert.equal(tooMuch.status, 402)
        const added = await (await asService("/internal/add-coins", { userId, coins: 300, sessionId: "sess-1" })).json()
        assert.equal(added.interviewCoin, 340)
        assert.equal(JSON.parse(await redis.get("session:sess-1")).interviewCoin, 340)
    })

    test("a session belonging to someone else is never overwritten", async () => {
        await redis.set("session:other", JSON.stringify({ userId: USER_B, interviewCoin: 7 }), "EX", 3600)
        await asService("/internal/add-coins", { userId, coins: 1, sessionId: "other" })
        assert.equal(JSON.parse(await redis.get("session:other")).interviewCoin, 7)
    })

    test("login without a token is a clear 400", async () => {
        const res = await fetch(`${api.url}/login`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
        assert.equal(res.status, 400)
    })
})

describe("billing service — payment verification", () => {
    let api, auth, billing, razorpay, orderId
    const sign = (o, p) => crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${o}|${p}`).digest("hex")
    const post = (path, body, userId = USER_A) =>
        fetch(`${api.url}${path}`, {
            method: "POST",
            headers: { ...authHeaders(userId), cookie: "session=sess-b" },
            body: JSON.stringify(body),
        })

    before(async () => {
        auth = await startFakeAuth({ balance: 0, secret: SECRET })
        process.env.AUTH_SERVICE_URL = auth.url
        razorpay = (await import("../services/billing/configs/razorpay.js")).default
        let n = 0
        mock.method(razorpay.orders, "create", async ({ amount, currency }) => ({ id: `order_${++n}`, amount, currency }))
        const Billing = (await import("../services/billing/models/billing.model.js")).default
        billing = installMemoryModel(Billing)
        const express = (await import("../services/billing/node_modules/express/index.js")).default
        const { default: router } = await import("../services/billing/routes/billing.route.js")
        const app = express()
        app.use(express.json())
        app.use("/", router)
        api = await serve(app)
    })

    after(async () => {
        billing.restore()
        await api.close()
        await auth.close()
    })

    test("creates an order for a known plan only", async () => {
        assert.equal((await post("/create", { planId: "gold" })).status, 400)
        const body = await (await post("/create", { planId: "starter" })).json()
        orderId = body.order.id
        assert.equal(body.order.amount, 19900)
    })

    test("rejects a forged signature and marks the order failed", async () => {
        const res = await post("/verify", { razorpay_order_id: orderId, razorpay_payment_id: "pay_1", razorpay_signature: "f".repeat(64) })
        assert.equal(res.status, 400)
        assert.equal(auth.state.balance, 0)
    })

    test("another user cannot verify this order", async () => {
        const res = await post("/verify", { razorpay_order_id: orderId, razorpay_payment_id: "pay_1", razorpay_signature: sign(orderId, "pay_1") }, USER_B)
        assert.equal(res.status, 404)
    })

    test("a valid payment credits coins server-side exactly once", async () => {
        const body = { razorpay_order_id: orderId, razorpay_payment_id: "pay_1", razorpay_signature: sign(orderId, "pay_1") }
        const first = await (await post("/verify", body)).json()
        assert.equal(first.success, true)
        assert.equal(first.coinsAdded, 300)
        assert.equal(first.interviewCoin, 300)
        assert.equal(auth.state.requests.at(-1).body.sessionId, "sess-b")

        const again = await (await post("/verify", body)).json()
        assert.equal(again.alreadyCredited, true)
        assert.equal(auth.state.balance, 300)
    })

    test("if crediting fails, the payment can be retried and is credited later", async () => {
        const created = await (await post("/create", { planId: "starter" })).json()
        const id = created.order.id
        const body = { razorpay_order_id: id, razorpay_payment_id: "pay_2", razorpay_signature: sign(id, "pay_2") }

        const saved = process.env.AUTH_SERVICE_URL
        process.env.AUTH_SERVICE_URL = "http://127.0.0.1:9" // nothing listens here
        const failed = await post("/verify", body)
        process.env.AUTH_SERVICE_URL = saved
        assert.equal(failed.status, 502)
        assert.equal((await failed.json()).retryable, true)

        const retried = await (await post("/verify", body)).json()
        assert.equal(retried.coinsAdded, 300)
        assert.equal(auth.state.balance, 600)
    })

    test("missing fields are a 400", async () => {
        assert.equal((await post("/verify", { razorpay_order_id: orderId })).status, 400)
    })
})

describe("gateway", () => {
    let gateway, upstream, seen

    before(async () => {
        seen = []
        upstream = http.createServer((req, res) => {
            let data = ""
            req.on("data", (c) => (data += c))
            req.on("end", () => {
                seen.push({ url: req.url, headers: req.headers, body: data })
                res.writeHead(200, { "content-type": "application/json" })
                res.end(JSON.stringify({ ok: true }))
            })
        })
        await new Promise((r) => upstream.listen(0, "127.0.0.1", r))
        const url = `http://127.0.0.1:${upstream.address().port}`
        for (const name of ["AUTH", "RESUME", "INTERVIEW", "ROADMAP", "BILLING"]) process.env[`${name}_SERVICE_URL`] = url
        process.env.NODE_ENV = "test"
        await redis.set("session:gw", JSON.stringify({ userId: USER_A, name: "A", interviewCoin: 5 }), "EX", 3600)
        const { createApp } = await import("../gateway/app.js")
        gateway = await serve(createApp())
    })

    after(async () => {
        await gateway.close()
        await new Promise((r) => upstream.close(r))
    })

    test("protected routes require a valid session", async () => {
        assert.equal((await fetch(`${gateway.url}/api/interview/all`)).status, 401)
        assert.equal((await fetch(`${gateway.url}/api/interview/all`, { headers: { cookie: "session=nope" } })).status, 401)
    })

    test("spoofed identity headers are replaced with the session user", async () => {
        const res = await fetch(`${gateway.url}/api/interview/all`, {
            headers: { cookie: "session=gw", "x-user-id": USER_B, "x-internal-secret": "forged" },
        })
        assert.equal(res.status, 200)
        const forwarded = seen.at(-1).headers
        assert.equal(forwarded["x-user-id"], USER_A)
        assert.equal(forwarded["x-internal-secret"], SECRET)
    })

    test("public auth routes never forward identity headers", async () => {
        await fetch(`${gateway.url}/api/auth/login`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-user-id": USER_B, "x-internal-secret": SECRET },
            body: JSON.stringify({ token: "t" }),
        })
        const forwarded = seen.at(-1)
        assert.equal(forwarded.url, "/login")
        assert.equal(forwarded.headers["x-user-id"], undefined)
        assert.equal(forwarded.headers["x-internal-secret"], undefined)
        assert.deepEqual(JSON.parse(forwarded.body), { token: "t" })
    })

    test("internal auth endpoints are not reachable through the gateway", async () => {
        const before = seen.length
        const res = await fetch(`${gateway.url}/api/auth/internal/add-coins`, { method: "POST" })
        assert.equal(res.status, 404)
        assert.equal(seen.length, before)
    })

    test("large multipart uploads pass through (limit raised from 1 MB)", async () => {
        const form = new FormData()
        form.append("resume", new Blob([Buffer.alloc(3 * 1024 * 1024, 65)], { type: "application/pdf" }), "big.pdf")
        const res = await fetch(`${gateway.url}/api/resume/upload`, { method: "POST", headers: { cookie: "session=gw" }, body: form })
        assert.equal(res.status, 200)
        assert.ok(seen.at(-1).body.length > 3 * 1024 * 1024)
    })

    test("/api/me returns the session user", async () => {
        const body = await (await fetch(`${gateway.url}/api/me`, { headers: { cookie: "session=gw" } })).json()
        assert.equal(body.user.userId, USER_A)
    })
})
