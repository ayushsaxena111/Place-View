import proxy from "express-http-proxy"

// Headers that only the gateway may set. Anything a browser sends with these
// names is discarded so it cannot impersonate another user or service.
const TRUSTED_HEADERS = ["x-user-id", "x-internal-secret"]

// Large enough for the 20 MB resume upload limit enforced by the resume service.
const BODY_LIMIT = "25mb"

const stripTrustedHeaders = (headers = {}) => {
    for (const name of Object.keys(headers)) {
        if (TRUSTED_HEADERS.includes(name.toLowerCase())) {
            delete headers[name]
        }
    }
    return headers
}

export const proxyWithHeaders = (serviceUrl) => {
    return proxy(serviceUrl, {
        limit: BODY_LIMIT,
        proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
            stripTrustedHeaders(proxyReqOpts.headers)

            if (srcReq.user) {
                proxyReqOpts.headers["x-user-id"] = String(srcReq.user.userId)
            }
            if (process.env.INTERNAL_SERVICE_SECRET) {
                proxyReqOpts.headers["x-internal-secret"] = process.env.INTERNAL_SERVICE_SECRET
            }
            return proxyReqOpts
        },
    })
}

// Proxy for public routes (auth): forwards the request but never trusted headers.
export const publicProxy = (serviceUrl) => {
    return proxy(serviceUrl, {
        limit: BODY_LIMIT,
        proxyReqOptDecorator: (proxyReqOpts) => {
            stripTrustedHeaders(proxyReqOpts.headers)
            return proxyReqOpts
        },
    })
}

export { stripTrustedHeaders }
