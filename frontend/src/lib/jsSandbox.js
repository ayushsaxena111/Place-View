// Executes candidate JavaScript inside a Web Worker (see
// workers/jsRunner.worker.js) and captures console output. The worker has no
// DOM access and is terminated if it runs too long.

const MAX_OUTPUT_CHARS = 20000

export const formatValue = (value) => {
    if (typeof value === "string") return value
    if (value === undefined) return "undefined"
    if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`
    if (typeof value === "bigint") return `${value}n`
    if (typeof value === "symbol") return value.toString()
    if (value instanceof Error) return `${value.name}: ${value.message}`
    if (value instanceof Map) return `Map(${value.size}) ${formatValue(Object.fromEntries(value))}`
    if (value instanceof Set) return `Set(${value.size}) ${formatValue([...value])}`
    try {
        const seen = new WeakSet()
        return JSON.stringify(value, (key, v) => {
            if (typeof v === "object" && v !== null) {
                if (seen.has(v)) return "[Circular]"
                seen.add(v)
            }
            if (typeof v === "bigint") return `${v}n`
            if (typeof v === "function") return `[Function ${v.name || "anonymous"}]`
            return v
        })
    } catch {
        return String(value)
    }
}

/**
 * Run code with a captured console. Returns { stdout, stderr, error }.
 * Async code (top-level await) is supported.
 */
export const runJavaScriptSource = async (code) => {
    const out = []
    const err = []
    let size = 0
    const push = (target, args) => {
        if (size > MAX_OUTPUT_CHARS) return
        const line = args.map(formatValue).join(" ")
        size += line.length
        target.push(size > MAX_OUTPUT_CHARS ? `${line.slice(0, 200)}\n… output truncated` : line)
    }
    const sandboxConsole = {
        log: (...a) => push(out, a),
        info: (...a) => push(out, a),
        debug: (...a) => push(out, a),
        table: (...a) => push(out, a),
        warn: (...a) => push(err, a),
        error: (...a) => push(err, a),
    }

    let error = null
    try {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
        const fn = new AsyncFunction("console", `"use strict";\n${code}`)
        await fn(sandboxConsole)
    } catch (e) {
        error = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    }
    return { stdout: out.join("\n"), stderr: err.join("\n"), error }
}
