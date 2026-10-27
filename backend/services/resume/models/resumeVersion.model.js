import mongoose from "mongoose";
import { educationSchema, experienceSchema, projectSchema } from "./resume.model.js";

// One document per uploaded resume, so users can revisit earlier uploads and
// their analyses. The PDF itself is stored in GridFS (bucket "resumeFiles").
const resumeVersionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },

        fileId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },

        fileName: {
            type: String,
            default: "",
        },

        fileSize: {
            type: Number,
            default: 0,
        },

        extractedText: {
            type: String,
            default: "",
        },

        // Created from a resume that was uploaded before history existed.
        isLegacy: {
            type: Boolean,
            default: false,
        },

        score: { type: Number, default: 0, min: 0, max: 100 },
        name: { type: String, default: "" },
        email: { type: String, default: "" },
        phone: { type: String, default: "" },
        summary: { type: String, default: "" },
        education: { type: [educationSchema], default: [] },
        skills: { type: [String], default: [] },
        projects: { type: [projectSchema], default: [] },
        experience: { type: [experienceSchema], default: [] },
        strengths: { type: [String], default: [] },
        weaknesses: { type: [String], default: [] },
        missingSkills: { type: [String], default: [] },
        suggestedRole: { type: String, default: "" },
        recommendations: { type: [String], default: [] },
    },
    { timestamps: true }
);

resumeVersionSchema.index({ userId: 1, createdAt: -1 });

const ResumeVersion = mongoose.model("ResumeVersion", resumeVersionSchema);

export default ResumeVersion;
