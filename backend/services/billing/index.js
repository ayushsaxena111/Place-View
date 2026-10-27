// Load .env before any other module reads process.env (ES imports are hoisted).
import "dotenv/config"
import express from "express"
import { connectDB } from "./configs/db.js"
import billingRouter from "./routes/billing.route.js"

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 6005

app.get("/",(req,res)=>{
    res.send("Hello from Billing-service")
})

app.use("/",billingRouter)

app.listen(PORT , ()=>{
    console.log(`Billing-service Started on ${PORT}`)
    connectDB()
})
