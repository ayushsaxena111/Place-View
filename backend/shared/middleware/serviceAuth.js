import crypto from "crypto"

// Service-to-service authentication.
//
// The gateway authenticates the browser session and forwards the user id in
// the `x-user-id` header. Services must only trust that header when the
// request really came from the gateway (or another internal service). When
// INTERNAL_SERVICE_SECRET is configured, every request must carry a matching
// `x-internal-secret` header. Without the secret, services fall back to the
// original behaviour (trusting the header) so local setups keep working, but
// a warning is logged once at startup.

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i

export const isValidObjectId = (value) =>
    typeof value === "string" && OBJECT_ID_RE.test(value)

const safeEqual = (a, b) => {
    const left = Buffer.from(String(a))
    const right = Buffer.from(String(b))
    if (left.length !== right.length) return false
    return crypto.timingSafeEqual(left, right)
}

export const hasValidInternalSecret = (req) => {
    const secret = process.env.INTERNAL_SERVICE_SECRET
    if (!secret) return false
    const provided = req.headers["x-internal-secret"]
    return typeof provided === "string" && safeEqual(provided, secret)
}

let warned = false
const warnOnce = (serviceName) => {
    if (warned) return
    warned = true
    console.warn(
        `[${serviceName}] INTERNAL_SERVICE_SECRET is not set. ` +
        "Requests are trusted based on the x-user-id header alone. " +
        "Set the same INTERNAL_SERVICE_SECRET in the gateway and every service."
    )
}

/**
 * Require an authenticated user forwarded by the gateway.
 * Sets req.userId on success.
 */
export const requireUser = (serviceName = "service") => {
    return (req, res, next) => {
        if (process.env.INTERNAL_SERVICE_SECRET) {
            if (!hasValidInternalSecret(req)) {
                return res.status(401).json({ success: false, message: "Unauthorized" })
            }
        } else {
            warnOnce(serviceName)
        }

        const userId = req.headers["x-user-id"]
        if (!isValidObjectId(userId)) {
            return res.status(401).json({ success: false, message: "Unauthorized" })
        }

        req.userId = userId
        next()
    }
}

/**
 * Require a request from another internal service (never from a browser).
 * Always requires INTERNAL_SERVICE_SECRET; refuses when it is not configured.
 */
export const requireInternal = (req, res, next) => {
    if (!hasValidInternalSecret(req)) {
        return res.status(403).json({ success: false, message: "Forbidden" })
    }
    next()
}

// Read the browser session id from a forwarded Cookie header.
export const getSessionIdFromCookie = (cookieHeader = "") => {
    const match = String(cookieHeader)
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("session="))
    if (!match) return null
    try {
        return decodeURIComponent(match.slice("session=".length)) || null
    } catch {
        return null
    }
}
