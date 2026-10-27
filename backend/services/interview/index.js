// Load .env before any other module reads process.env (ES imports are hoisted).
import "dotenv/config"
import express from "express"
import { connectDB } from "./config/db.js"
import interviewRouter from "./routes/interview.route.js"

const app = express()

app.use(express.json({ limit: "512kb" }))

const PORT = process.env.PORT || 6003

app.get("/" , (req,res)=>{
    res.send("Hello from Interview-service")
})


app.use("/",interviewRouter)


app.listen(PORT , ()=>{
    console.log(`Interview-service Started on ${PORT}`)
    connectDB()
})
