// OPTIONAL: start all 7 dev processes from one terminal.
// Usage (from backend/):  npm run dev:all
//
// It runs exactly the same `npm run dev` commands as the 7-terminal setup, in
// the same directories, and prefixes each line with the service name.
// Ctrl+C stops all of them. The 7-terminal workflow is unchanged — use
// whichever you prefer. Redis must already be running (docker compose up -d).

import { spawn, spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const root = path.resolve(backend, "..")

const PROCESSES = [
    { name: "gateway", cwd: path.join(backend, "gateway"), color: 36 },
    { name: "auth", cwd: path.join(backend, "services/auth"), color: 33 },
    { name: "resume", cwd: path.join(backend, "services/resume"), color: 35 },
    { name: "interview", cwd: path.join(backend, "services/interview"), color: 32 },
    { name: "roadmap", cwd: path.join(backend, "services/roadmap"), color: 34 },
    { name: "billing", cwd: path.join(backend, "services/billing"), color: 31 },
    { name: "frontend", cwd: path.join(root, "frontend"), color: 37 },
]

const isWindows = process.platform === "win32"
const npm = isWindows ? "npm.cmd" : "npm"
const width = Math.max(...PROCESSES.map((p) => p.name.length))
const children = []

for (const p of PROCESSES) {
    const child = spawn(npm, ["run", "dev"], {
        cwd: p.cwd,
        env: { ...process.env, FORCE_COLOR: "1" },
        shell: isWindows,
        // Own process group, so the whole tree (npm → nodemon → node) can be stopped.
        detached: !isWindows,
    })
    const prefix = `\x1b[${p.color}m${p.name.padEnd(width)}\x1b[0m │ `
    const pipe = (stream, out) => {
        let buffer = ""
        stream.on("data", (chunk) => {
            buffer += chunk
            const lines = buffer.split(/\r?\n/)
            buffer = lines.pop()
            for (const line of lines) out.write(prefix + line + "\n")
        })
    }
    pipe(child.stdout, process.stdout)
    pipe(child.stderr, process.stderr)
    child.on("exit", (code) => process.stdout.write(`${prefix}exited with code ${code}\n`))
    children.push(child)
}

// Stop a child and everything it started (npm does not forward signals).
const killTree = (child, signal = "SIGTERM") => {
    if (child.exitCode !== null || !child.pid) return
    try {
        if (isWindows) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })
        else process.kill(-child.pid, signal)
    } catch {
        // already gone
    }
}

let stopping = false
const stopAll = () => {
    if (stopping) return
    stopping = true
    children.forEach((child) => killTree(child))
    setTimeout(() => {
        children.forEach((child) => killTree(child, "SIGKILL"))
        process.exit(0)
    }, 2000)
}
process.on("SIGINT", stopAll)
process.on("SIGTERM", stopAll)
process.on("exit", () => children.forEach((child) => killTree(child, "SIGKILL")))
