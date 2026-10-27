// Load .env before any other module reads process.env (ES imports are hoisted).
import "dotenv/config"
import express from "express"
import { connectDB } from "./configs/db.js"
import roadmapRouter from "./routes/roadmap.route.js"

const app = express()
app.use(express.json({ limit: "512kb" }))

const PORT = process.env.PORT || 6004

app.get("/", (req, res) => {
    res.send("Hello from Roadmap-service")
})

app.use("/",roadmapRouter)

app.listen(PORT , ()=>{
    console.log(`Roadmap-service Started on ${PORT}`)
    connectDB()
})
