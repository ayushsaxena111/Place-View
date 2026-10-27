// Load .env before any other module reads process.env (ES imports are hoisted).
import "dotenv/config"
import { createApp } from "./app.js"

// Browsers refuse port 6000 (an "unsafe" port), so default to 8000 like the Dockerfile.
const PORT = process.env.PORT || 8000

const app = createApp()

app.listen(PORT, () => {
    console.log(`Gateway Started on ${PORT}`)
    if (!process.env.INTERNAL_SERVICE_SECRET) {
        console.warn("[gateway] INTERNAL_SERVICE_SECRET is not set; services cannot verify that requests came from the gateway.")
    }
})
