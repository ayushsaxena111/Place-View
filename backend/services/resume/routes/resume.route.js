import express from "express"

import {
    activateResumeVersion,
    deleteResumeVersion,
    downloadResumeFile,
    getResume,
    getResumeHistory,
    getResumeVersion,
    uploadResume,
} from "../controllers/resume.controller.js"
import { uploadResumeFile } from "../middleware/multer.js"
import { requireUser } from "../../../shared/middleware/serviceAuth.js"

const resumeRouter = express.Router()

resumeRouter.use(requireUser("resume"))

resumeRouter.post("/upload", uploadResumeFile, uploadResume)

resumeRouter.get("/get-resume", getResume)

// Resume history
resumeRouter.get("/history", getResumeHistory)
resumeRouter.get("/history/:id", getResumeVersion)
resumeRouter.get("/history/:id/file", downloadResumeFile)
resumeRouter.post("/history/:id/activate", activateResumeVersion)
resumeRouter.delete("/history/:id", deleteResumeVersion)

export default resumeRouter;
