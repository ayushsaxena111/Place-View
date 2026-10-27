import express from "express"
import {
    deleteInterview,
    getAllInterviews,
    getInterview,
    getInterviewHistory,
    regenerateSummary,
    startInterview,
    submitAnswer,
} from "../controllers/interview.controller.js"
import { requireUser } from "../../../shared/middleware/serviceAuth.js"

const interviewRouter = express.Router()

interviewRouter.use(requireUser("interview"))

interviewRouter.post("/start", startInterview)

interviewRouter.post("/answer", submitAnswer)

interviewRouter.get("/all", getAllInterviews)

interviewRouter.get("/history", getInterviewHistory)

interviewRouter.post("/:id/summary", regenerateSummary)

interviewRouter.delete("/:id", deleteInterview)

interviewRouter.get("/:id", getInterview)


export default interviewRouter
