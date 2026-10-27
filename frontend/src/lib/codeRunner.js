// Runs candidate code in the browser, isolated in Web Workers.
//   JavaScript: module worker, terminated after the time limit.
//   Python: Pyodide (WebAssembly) worker, loaded from a CDN on first use.
// Other languages cannot run in the browser; the editor says so and the code
// is still submitted and evaluated.

export const LANGUAGES = [
    { id: "javascript", label: "JavaScript", runnable: true },
    { id: "python", label: "Python", runnable: true },
    { id: "java", label: "Java", runnable: false },
    { id: "cpp", label: "C++", runnable: false },
]

export const isRunnable = (language) => Boolean(LANGUAGES.find((l) => l.id === language)?.runnable)

export const RUN_TIMEOUT_MS = 5000
const PYTHON_TIMEOUT_MS = 10000
const PYTHON_LOAD_TIMEOUT_MS = 60000

let pythonWorker = null
let pythonLoaded = false
let messageId = 0

const createJsWorker = () =>
    new Worker(new URL("../workers/jsRunner.worker.js", import.meta.url), { type: "module" })

const createPythonWorker = () => new Worker("/workers/pyRunner.worker.js")

const runInWorker = (worker, payload, timeoutMs, { terminateOnTimeout = true } = {}) =>
    new Promise((resolve) => {
        const id = ++messageId
        const timer = setTimeout(() => {
            cleanup()
            if (terminateOnTimeout) worker.terminate()
            resolve({ stdout: "", stderr: "", error: null, timedOut: true })
        }, timeoutMs)
        const onMessage = (event) => {
            if (event.data?.id !== id) return
            cleanup()
            resolve({ ...event.data, timedOut: false })
        }
        const onError = (event) => {
            cleanup()
            resolve({ stdout: "", stderr: "", error: event.message || "The code runner crashed", timedOut: false })
        }
        const cleanup = () => {
            clearTimeout(timer)
            worker.removeEventListener("message", onMessage)
            worker.removeEventListener("error", onError)
        }
        worker.addEventListener("message", onMessage)
        worker.addEventListener("error", onError)
        worker.postMessage({ ...payload, id })
    })

const runJavaScript = async (code) => {
    const worker = createJsWorker()
    const result = await runInWorker(worker, { code }, RUN_TIMEOUT_MS)
    worker.terminate()
    return result.timedOut
        ? { ...result, error: `Stopped after ${RUN_TIMEOUT_MS / 1000}s — check for an infinite loop.` }
        : result
}

const runPython = async (code, onStatus) => {
    if (!pythonWorker) pythonWorker = createPythonWorker()
    if (!pythonLoaded) {
        onStatus?.("Loading Python runtime (first run only)…")
        const warm = await runInWorker(pythonWorker, { type: "warmup" }, PYTHON_LOAD_TIMEOUT_MS, { terminateOnTimeout: false })
        if (!warm.ready) {
            pythonWorker.terminate()
            pythonWorker = null
            return { stdout: "", stderr: "", error: warm.error || "Could not load the Python runtime.", timedOut: false }
        }
        pythonLoaded = true
    }
    onStatus?.("Running…")
    const result = await runInWorker(pythonWorker, { code }, PYTHON_TIMEOUT_MS)
    if (result.timedOut) {
        // The worker was terminated; the next run reloads the runtime.
        pythonWorker = null
        pythonLoaded = false
        return { ...result, error: `Stopped after ${PYTHON_TIMEOUT_MS / 1000}s — check for an infinite loop.` }
    }
    return result
}

/**
 * @returns {Promise<{stdout: string, stderr: string, error: string|null, timedOut: boolean, durationMs?: number}>}
 */
export const runCode = async ({ language, code, onStatus }) => {
    if (!code?.trim()) return { stdout: "", stderr: "", error: "Nothing to run yet.", timedOut: false }
    if (language === "javascript") return runJavaScript(code)
    if (language === "python") return runPython(code, onStatus)
    return { stdout: "", stderr: "", error: "Running this language in the browser is not supported.", timedOut: false }
}
