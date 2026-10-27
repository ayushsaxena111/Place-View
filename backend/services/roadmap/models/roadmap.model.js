import mongoose from "mongoose";

// New fields are optional with defaults, so roadmaps generated before
// durations and progress tracking existed still load.

const moduleSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
    },

    duration: {
        type: String,
        required: true,
    },

    difficulty: {
        type: String,
        enum: ["Easy", "Medium", "Hard"],
        required: true,
    },

    description: {
        type: String,
        required: true,
    },

    youtube: {
        type: String,
        default: "",
    },

    article: {
        type: String,
        default: "",
    },

    // ── Scheduling & personalisation (new) ──
    estimatedHours: { type: Number, default: 0 },
    startWeek: { type: Number, default: null },
    endWeek: { type: Number, default: null },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    skills: { type: [String], default: [] },
    whyIncluded: { type: String, default: "" },
    practiceTask: { type: String, default: "" },

    // ── Progress (new) ──
    status: {
        type: String,
        enum: ["not-started", "in-progress", "completed"],
        default: "not-started",
    },
    completedAt: { type: Date, default: null },
},
    {
        _id: false,
    })

const milestoneSchema = new mongoose.Schema({
    title: { type: String, required: true },
    goal: { type: String, default: "" },
    moduleIndexes: { type: [Number], default: [] },
    targetWeek: { type: Number, default: null },
    targetDate: { type: Date, default: null },
}, { _id: false })

const roadmapSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },

    title: {
        type: String,
        required: true,
    },

    targetPackage: {
        type: String,
        required: true,
    },

    duration: {
        type: String,
        required: true,
    },

    level: {
        type: String,
        enum: ["Beginner", "Intermediate", "Advanced"],
        required: true,
    },

    modules: {
        type: [moduleSchema],
        default: [],
    },

    // ── New ──
    role: { type: String, default: "" },
    summary: { type: String, default: "" },
    durationPreset: { type: String, enum: ["3m", "6m", "1y", "custom", "auto", ""], default: "" },
    durationWeeks: { type: Number, default: null },
    hoursPerWeek: { type: Number, default: null },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    milestones: { type: [milestoneSchema], default: [] },
    feasibility: {
        status: { type: String, enum: ["comfortable", "realistic", "intensive", ""], default: "" },
        requiredHoursPerWeek: { type: Number, default: 0 },
        totalHours: { type: Number, default: 0 },
        note: { type: String, default: "" },
    },
    personalization: {
        usedResume: { type: Boolean, default: false },
        usedInterview: { type: Boolean, default: false },
        interviewId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
        interviewScore: { type: Number, default: null },
        focusAreas: { type: [String], default: [] },
    },
    revision: { type: Number, default: 1 },

}, { timestamps: true })


const Roadmap = mongoose.model("Roadmap",roadmapSchema)

export default Roadmap
