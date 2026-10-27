import "./helpers/env.js"
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { parseLLMJson, LLMJsonError } from "../shared/utils/llmJson.js"
import {
    getSessionIdFromCookie,
    isValidObjectId,
    requireInternal,
    requireUser,
} from "../shared/middleware/serviceAuth.js"
import { chargeCoins, CoinError, refundCoins } from "../shared/utils/coins.js"
import { startFakeAuth } from "./helpers/fakeServers.js"
import { SECRET, USER_A } from "./helpers/env.js"

const restoreEnv = (name, value) => {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
}

const runMiddleware = (mw, headers) => {
    const req = { headers }
    let status = 200
    let body = null
    let nextCalled = false
    const res = {
        status(code) { status = code; return this },
        json(payload) { body = payload; return this },
    }
    mw(req, res, () => { nextCalled = true })
    return { req, status, body, nextCalled }
}

describe("parseLLMJson", () => {
    test("parses plain JSON", () => {
        assert.deepEqual(parseLLMJson('{"a":1}'), { a: 1 })
    })
    test("strips markdown fences and surrounding prose", () => {
        const text = 'Sure! Here you go:\n```json\n{"score": 80, "list": [1,2]}\n```\nHope it helps'
        assert.deepEqual(parseLLMJson(text, { expect: "object" }), { score: 80, list: [1, 2] })
    })
    test("handles braces inside strings", () => {
        const text = 'prefix {"code": "function f() { return \\"}\\" }", "ok": true} suffix'
        assert.equal(parseLLMJson(text).ok, true)
    })
    test("finds an array when an array is expected", () => {
        assert.deepEqual(parseLLMJson('Result: [{"title":"x"}]', { expect: "array" }), [{ title: "x" }])
    })
    test("accepts LangChain content parts", () => {
        assert.deepEqual(parseLLMJson([{ type: "text", text: '{"x":2}' }]), { x: 2 })
    })
    test("throws a descriptive error for invalid output", () => {
        assert.throws(() => parseLLMJson("not json at all"), LLMJsonError)
        assert.throws(() => parseLLMJson(""), LLMJsonError)
    })
})

describe("service authentication", () => {
    test("isValidObjectId only accepts 24-hex strings", () => {
        assert.equal(isValidObjectId(USER_A), true)
        assert.equal(isValidObjectId("123"), false)
        assert.equal(isValidObjectId({ $ne: null }), false)
        assert.equal(isValidObjectId("zzzzzzzzzzzzzzzzzzzzzzzz"), false)
    })

    test("requireUser accepts the gateway secret and a valid user id", () => {
        const r = runMiddleware(requireUser("t"), { "x-user-id": USER_A, "x-internal-secret": SECRET })
        assert.equal(r.nextCalled, true)
        assert.equal(r.req.userId, USER_A)
    })

    test("requireUser rejects a missing or wrong secret", () => {
        assert.equal(runMiddleware(requireUser("t"), { "x-user-id": USER_A }).status, 401)
        assert.equal(runMiddleware(requireUser("t"), { "x-user-id": USER_A, "x-internal-secret": "nope" }).status, 401)
    })

    test("requireUser rejects malformed user ids (NoSQL-injection shaped values)", () => {
        const r = runMiddleware(requireUser("t"), { "x-user-id": "abc", "x-internal-secret": SECRET })
        assert.equal(r.status, 401)
        assert.equal(r.nextCalled, false)
    })

    test("requireInternal refuses requests without the secret", () => {
        assert.equal(runMiddleware(requireInternal, {}).status, 403)
        assert.equal(runMiddleware(requireInternal, { "x-internal-secret": SECRET }).nextCalled, true)
    })

    test("getSessionIdFromCookie reads the session cookie", () => {
        assert.equal(getSessionIdFromCookie("a=1; session=abc-123; b=2"), "abc-123")
        assert.equal(getSessionIdFromCookie("a=1"), null)
        assert.equal(getSessionIdFromCookie(undefined), null)
    })
})

describe("coin client", () => {
    test("charges, refuses when balance is too low, and refunds", async () => {
        const auth = await startFakeAuth({ balance: 60, secret: SECRET })
        const previous = process.env.AUTH_SERVICE_URL
        process.env.AUTH_SERVICE_URL = auth.url
        try {
            const charged = await chargeCoins({ userId: USER_A, coins: 50, action: "x" })
            assert.equal(charged.interviewCoin, 10)

            await assert.rejects(
                chargeCoins({ userId: USER_A, coins: 50, action: "x" }),
                (error) => error instanceof CoinError && error.status === 402
            )

            const refunded = await refundCoins({ userId: USER_A, coins: 50, action: "x" })
            assert.equal(refunded.interviewCoin, 60)
            assert.ok(auth.state.requests.every((r) => r.secret === SECRET))
        } finally {
            restoreEnv("AUTH_SERVICE_URL", previous)
            await auth.close()
        }
    })

    test("reports misconfiguration clearly", async () => {
        const previous = process.env.AUTH_SERVICE_URL
        delete process.env.AUTH_SERVICE_URL
        try {
            await assert.rejects(chargeCoins({ userId: USER_A, coins: 5 }), /AUTH_SERVICE_URL/)
        } finally {
            restoreEnv("AUTH_SERVICE_URL", previous)
        }
    })
})
