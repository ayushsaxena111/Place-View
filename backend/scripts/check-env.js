// Checks every service's .env before you start the 7 terminals.
// Usage (from backend/):  npm run check-env
// Never prints secret values.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const root = path.resolve(backend, "..")

const SERVICES = [
    { name: "gateway", dir: "gateway", required: ["PORT", "FRONTEND_URL", "AUTH_SERVICE_URL", "RESUME_SERVICE_URL", "INTERVIEW_SERVICE_URL", "ROADMAP_SERVICE_URL", "BILLING_SERVICE_URL", "INTERNAL_SERVICE_SECRET"] },
    { name: "auth", dir: "services/auth", required: ["MONGODB_URL", "INTERNAL_SERVICE_SECRET"], files: ["serviceAccountKey.json"] },
    { name: "resume", dir: "services/resume", required: ["MONGODB_URL", "GROQ_API_KEY", "INTERNAL_SERVICE_SECRET", "AUTH_SERVICE_URL"] },
    { name: "interview", dir: "services/interview", required: ["MONGODB_URL", "GROQ_API_KEY", "INTERNAL_SERVICE_SECRET", "AUTH_SERVICE_URL"] },
    { name: "roadmap", dir: "services/roadmap", required: ["MONGODB_URL", "GROQ_API_KEY", "INTERNAL_SERVICE_SECRET", "AUTH_SERVICE_URL", "INTERVIEW_SERVICE_URL"], optional: ["YOUTUBE_API_KEY"] },
    { name: "billing", dir: "services/billing", required: ["MONGODB_URL", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "INTERNAL_SERVICE_SECRET", "AUTH_SERVICE_URL"] },
]

export const parseEnv = (text) => {
    const env = {}
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim()
        if (!line || line.startsWith("#")) continue
        const i = line.indexOf("=")
        if (i === -1) continue
        const key = line.slice(0, i).trim().replace(/^export\s+/, "")
        let value = line.slice(i + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1)
        }
        env[key] = value
    }
    return env
}

const isPlaceholder = (v) => !v || /change-me|your-|xxxx/i.test(v)

const run = () => {
    let errors = 0
    let warnings = 0
    const secrets = new Map()

    const fail = (msg) => { errors++; console.log(`  ✖ ${msg}`) }
    const warn = (msg) => { warnings++; console.log(`  ! ${msg}`) }

    for (const svc of SERVICES) {
        const dir = path.join(backend, svc.dir)
        const envPath = path.join(dir, ".env")
        console.log(`\n${svc.name} (${path.relative(root, dir)})`)
        if (!fs.existsSync(path.join(dir, "node_modules"))) warn("node_modules missing — run npm install here")
        if (!fs.existsSync(envPath)) {
            fail(".env not found — copy .env.example to .env and fill it in")
            continue
        }
        const env = parseEnv(fs.readFileSync(envPath, "utf8"))
        for (const key of svc.required) {
            if (!env[key]) fail(`${key} is missing`)
            else if (isPlaceholder(env[key])) fail(`${key} still has the example placeholder value`)
        }
        for (const key of svc.optional || []) {
            if (!env[key] || isPlaceholder(env[key])) warn(`${key} not set (optional)`)
        }
        for (const [key, value] of Object.entries(env)) {
            if (key.endsWith("_URL") && key !== "MONGODB_URL" && key !== "REDIS_URL" && value && !/^https?:\/\//.test(value)) {
                fail(`${key} should start with http:// or https://`)
            }
        }
        if (svc.name === "gateway" && env.PORT === "6000") fail("PORT=6000 is blocked by browsers — use 8000")
        for (const file of svc.files || []) {
            const custom = env.FIREBASE_SERVICE_ACCOUNT_PATH && path.resolve(dir, env.FIREBASE_SERVICE_ACCOUNT_PATH)
            if (!fs.existsSync(custom || path.join(dir, file))) fail(`${file} not found (Firebase Admin key)`)
        }
        if (env.INTERNAL_SERVICE_SECRET) secrets.set(svc.name, env.INTERNAL_SERVICE_SECRET)
    }

    if (new Set(secrets.values()).size > 1) {
        errors++
        console.log("\n  ✖ INTERNAL_SERVICE_SECRET differs between services — it must be identical everywhere")
    }

    const frontendEnv = ["", ".local", ".development", ".development.local"]
        .map((s) => path.join(root, "frontend", `.env${s}`))
        .find((p) => fs.existsSync(p))
    console.log("\nfrontend")
    if (!frontendEnv) fail("frontend/.env not found — copy frontend/.env.example")
    else {
        const env = parseEnv(fs.readFileSync(frontendEnv, "utf8"))
        if (!env.VITE_BACKEND_URL) fail("VITE_BACKEND_URL is missing")
        if (/:6000\b/.test(env.VITE_BACKEND_URL || "")) fail("VITE_BACKEND_URL uses port 6000, which browsers block")
        if (!env.VITE_FIREBASE_APIKEY || isPlaceholder(env.VITE_FIREBASE_APIKEY)) fail("VITE_FIREBASE_APIKEY is missing or still the example value")
    }

    console.log(`\n${errors ? "✖" : "✔"} ${errors} error(s), ${warnings} warning(s)`)
    return errors
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    process.exitCode = run() ? 1 : 0
}
