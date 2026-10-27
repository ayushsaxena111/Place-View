// Server-side coin charging through the auth service's internal API.
//
// Paid actions (interviews, roadmaps, resume analysis) are charged by the
// service that performs them, so a client cannot skip payment by calling the
// API directly. If the action then fails, the coins are refunded.

export class CoinError extends Error {
    constructor(message, status = 500, data = {}) {
        super(message)
        this.name = "CoinError"
        this.status = status
        this.data = data
    }
}

const getConfig = () => {
    const authUrl = process.env.AUTH_SERVICE_URL
    const secret = process.env.INTERNAL_SERVICE_SECRET
    if (!authUrl || !secret) {
        throw new CoinError(
            "Server misconfigured: AUTH_SERVICE_URL and INTERNAL_SERVICE_SECRET must be set to process paid actions.",
            500
        )
    }
    return { authUrl: authUrl.replace(/\/+$/, ""), secret }
}

const callAuth = async (path, body, fetchImpl = fetch) => {
    const { authUrl, secret } = getConfig()
    let response
    try {
        response = await fetchImpl(`${authUrl}${path}`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-internal-secret": secret,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
        })
    } catch (error) {
        throw new CoinError(`Could not reach the auth service: ${error.message}`, 503)
    }

    let data = {}
    try {
        data = await response.json()
    } catch {
        data = {}
    }

    if (!response.ok || data.success === false) {
        throw new CoinError(
            data.message || `Auth service responded with ${response.status}`,
            response.status,
            data
        )
    }
    return data
}

/** Deduct coins. Throws CoinError(402) when the balance is too low. */
export const chargeCoins = ({ userId, coins, sessionId, action }, fetchImpl) =>
    callAuth("/internal/use-coins", { userId, coins, sessionId, action }, fetchImpl)

/** Give coins back after a failed paid action. Never throws; logs instead. */
export const refundCoins = async ({ userId, coins, sessionId, action }, fetchImpl) => {
    try {
        return await callAuth(
            "/internal/add-coins",
            { userId, coins, sessionId, reason: `refund:${action}` },
            fetchImpl
        )
    } catch (error) {
        console.error(`[coins] Refund of ${coins} coins for user ${userId} failed:`, error.message)
        return null
    }
}

/** Credit purchased coins (billing). Throws on failure. */
export const creditCoins = ({ userId, coins, sessionId, reason }, fetchImpl) =>
    callAuth("/internal/add-coins", { userId, coins, sessionId, reason }, fetchImpl)

/** Map a CoinError to an HTTP response. */
export const sendCoinError = (res, error) => {
    const status = error.status === 402 ? 402 : error.status || 500
    return res.status(status).json({
        success: false,
        message: status === 402 ? "Not enough interview coins" : error.message,
        interviewCoin: error.data?.interviewCoin,
    })
}
