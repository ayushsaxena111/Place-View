import express from "express"
import cors from "cors"
import morgan from "morgan"
import cookieParser from "cookie-parser"
import { getCurrentUser } from "./controllers/user.controller.js"
import { isAuth } from "./middleware/isAuth.js"
import { proxyWithHeaders, publicProxy } from "./utils/proxyWithHeaders.js"

export const createApp = () => {
    const app = express()
    app.use(express.json({ limit: "1mb" }))

    app.use(cors({
        origin: process.env.FRONTEND_URL,
        credentials: true
    }))

    if (process.env.NODE_ENV !== "test") app.use(morgan("dev"))
    app.use(cookieParser())

    app.get("/", (req, res) => {
        res.send("Hello from Gateway")
    })

    // Internal service-to-service endpoints are never reachable from the browser.
    app.use("/api/auth/internal", (req, res) => {
        res.status(404).json({ success: false, message: "Not found" })
    })

    app.use("/api/auth", publicProxy(process.env.AUTH_SERVICE_URL))
    app.use("/api/resume", isAuth, proxyWithHeaders(process.env.RESUME_SERVICE_URL))
    app.use("/api/interview", isAuth, proxyWithHeaders(process.env.INTERVIEW_SERVICE_URL))
    app.use("/api/roadmap", isAuth, proxyWithHeaders(process.env.ROADMAP_SERVICE_URL))
    app.use("/api/billing", isAuth, proxyWithHeaders(process.env.BILLING_SERVICE_URL))
    app.get("/api/me", isAuth, getCurrentUser)

    return app
}
