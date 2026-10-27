import { runJavaScriptSource } from "../lib/jsSandbox.js"

self.onmessage = async (event) => {
    const { id, code } = event.data || {}
    const started = performance.now()
    const result = await runJavaScriptSource(String(code || ""))
    self.postMessage({ id, ...result, durationMs: Math.round(performance.now() - started) })
}
