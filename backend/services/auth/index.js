// Load .env before any other module reads process.env (ES imports are hoisted).
import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import { connectDb } from "./configs/db.js";
import authRouter from "./routes/auth.route.js";

const app = express();

app.use(express.json());

app.use(cookieParser());

const PORT = process.env.PORT || 6001

app.use("/", authRouter);

app.listen(PORT, () => {
  console.log(`Auth Service Started on ${PORT}`);
  connectDb()
});
