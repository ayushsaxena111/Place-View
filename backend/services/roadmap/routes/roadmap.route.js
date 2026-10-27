import express from "express"
import {
    deleteRoadmap,
    generateRoadmap,
    getAllRoadmap,
    getRoadmapbyId,
    getRoadmapByInterview,
    rescheduleRoadmap,
    updateModuleStatus,
} from "../controllers/roadmap.controller.js"
import { requireUser } from "../../../shared/middleware/serviceAuth.js"

const roadmapRouter = express.Router()

roadmapRouter.use(requireUser("roadmap"))

roadmapRouter.post("/generate" , generateRoadmap)

roadmapRouter.get("/all" ,getAllRoadmap )

roadmapRouter.get("/by-interview/:interviewId", getRoadmapByInterview)

roadmapRouter.patch("/:id/modules/:index", updateModuleStatus)

roadmapRouter.post("/:id/reschedule", rescheduleRoadmap)

roadmapRouter.delete("/:id", deleteRoadmap)

roadmapRouter.get("/:id",getRoadmapbyId)

export default roadmapRouter
