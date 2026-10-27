// Article links come from the LLM, which can invent URLs. Before showing a
// link, confirm it is a real http(s) URL that resolves. Sites that block bots
// (401/403/405/429) still exist, so those links are kept.

const KEEP_STATUSES = new Set([401, 403, 405, 429])

export const isHttpUrl = (value) => {
    try {
        const url = new URL(String(value))
        return url.protocol === "https:" || url.protocol === "http:"
    } catch {
        return false
    }
}

export const isReachable = async (url, { timeoutMs = 4000, fetchImpl = fetch } = {}) => {
    if (!isHttpUrl(url)) return false
    for (const method of ["HEAD", "GET"]) {
        try {
            const response = await fetchImpl(url, {
                method,
                redirect: "follow",
                signal: AbortSignal.timeout(timeoutMs),
                headers: { "user-agent": "Mozilla/5.0 (compatible; RoadmapLinkCheck/1.0)" },
            })
            if (response.body && method === "GET") {
                response.body.cancel().catch(() => {})
            }
            if (response.status < 400 || KEEP_STATUSES.has(response.status)) return true
            if (response.status === 404 || response.status === 410) return false
        } catch {
            // try the next method
        }
    }
    return false
}

export const filterReachable = async (urls, options) => {
    const unique = [...new Set(urls.filter(isHttpUrl))]
    const results = await Promise.all(unique.map(async (url) => [url, await isReachable(url, options)]))
    return new Set(results.filter(([, ok]) => ok).map(([url]) => url))
}
