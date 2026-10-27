// Load .env before any other module reads process.env (ES imports are hoisted).
import "dotenv/config"
import express from "express"
import { connectDB } from "./config/db.js"
import resumeRouter from "./routes/resume.route.js"

const app = express()

app.use(express.json())

const PORT = process.env.PORT || 6002

app.get("/" , (req,res)=>{
    res.send("Hello from Resume-service")
})

app.use("/",resumeRouter)

app.listen(PORT , ()=>{
    console.log(`Resume-service Started on ${PORT}`)
    connectDB()
})
