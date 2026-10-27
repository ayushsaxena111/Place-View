/* global loadPyodide */
// Runs candidate Python code with Pyodide (CPython compiled to WebAssembly)
// inside a classic Web Worker. Pyodide is loaded from the jsDelivr CDN the
// first time Python code is run.

const PYODIDE_VERSION = "0.28.3"
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`
const MAX_OUTPUT_CHARS = 20000

let pyodideReady = null

const getPyodide = () => {
    if (!pyodideReady) {
        pyodideReady = (async () => {
            importScripts(`${INDEX_URL}pyodide.js`)
            return loadPyodide({ indexURL: INDEX_URL })
        })()
        pyodideReady.catch(() => {
            pyodideReady = null
        })
    }
    return pyodideReady
}

self.onmessage = async (event) => {
    const { id, code, type } = event.data || {}
    if (type === "warmup") {
        try {
            await getPyodide()
            self.postMessage({ id, ready: true })
        } catch (error) {
            self.postMessage({ id, ready: false, error: `Could not load the Python runtime: ${error.message}` })
        }
        return
    }

    const started = performance.now()
    let pyodide
    try {
        pyodide = await getPyodide()
    } catch (error) {
        self.postMessage({ id, stdout: "", stderr: "", error: `Could not load the Python runtime (check your internet connection): ${error.message}` })
        return
    }

    const out = []
    const err = []
    let size = 0
    const collect = (target) => (line) => {
        if (size > MAX_OUTPUT_CHARS) return
        size += line.length
        target.push(line)
    }
    pyodide.setStdout({ batched: collect(out) })
    pyodide.setStderr({ batched: collect(err) })

    let error = null
    try {
        // Fresh globals for every run so earlier runs do not leak state.
        const globals = pyodide.toPy({})
        await pyodide.runPythonAsync(String(code || ""), { globals })
        globals.destroy()
    } catch (e) {
        const message = String(e && e.message ? e.message : e)
        // Show the Python traceback's last lines rather than Pyodide internals.
        const lines = message.trim().split("\n")
        const start = lines.findIndex((l) => l.includes('File "<exec>"'))
        error = (start >= 0 ? lines.slice(start) : lines.slice(-4)).join("\n")
    }

    self.postMessage({
        id,
        stdout: out.join("\n") + (size > MAX_OUTPUT_CHARS ? "\n… output truncated" : ""),
        stderr: err.join("\n"),
        error,
        durationMs: Math.round(performance.now() - started),
    })
}
