import mongoose from "mongoose";

// All new fields are optional with defaults, so interviews created before the
// adaptive engine existed still load and render.

const feedbackSchema = new mongoose.Schema(
    {
        score: { type: Number, default: 0 },
        correctness: { type: Number, default: 0 },
        clarity: { type: Number, default: 0 },
        relevance: { type: Number, default: 0 },
        detail: { type: Number, default: 0 },
        efficiency: { type: Number, default: 0 },
        communication: { type: Number, default: 0 },
        problemSolving: { type: Number, default: 0 },
        creativity: { type: Number, default: 0 },

        feedback: { type: String, default: "" },

        // Kept for older clients; mirrors howToImprove for new interviews.
        improvements: { type: [String], default: [] },

        // Question-specific breakdown (new)
        verdict: {
            type: String,
            enum: ["strong", "adequate", "partial", "weak", "incorrect", "no-answer", ""],
            default: "",
        },
        whatWasCorrect: { type: [String], default: [] },
        whatWasMissing: { type: [String], default: [] },
        howToImprove: { type: [String], default: [] },
        modelAnswer: { type: String, default: "" },
        keyConceptsCovered: { type: [String], default: [] },
        keyConceptsMissed: { type: [String], default: [] },
        technicalSkills: { type: [String], default: [] },
        followUpReason: { type: String, default: "" },
    },
    { _id: false }
);

const speechMetricsSchema = new mongoose.Schema(
    {
        transcript: { type: String, default: "" },
        wordCount: { type: Number, default: 0 },
        speakingTimeSec: { type: Number, default: 0 },
        listeningTimeSec: { type: Number, default: 0 },
        wordsPerMinute: { type: Number, default: 0 },
        fillerCount: { type: Number, default: 0 },
        fillers: { type: Map, of: Number, default: () => ({}) },
        pauseCount: { type: Number, default: 0 },
        longPauseCount: { type: Number, default: 0 },
        longestPauseSec: { type: Number, default: 0 },
        totalPauseSec: { type: Number, default: 0 },
        vadAvailable: { type: Boolean, default: false },
    },
    { _id: false }
);

const questionSchema = new mongoose.Schema(
    {
        question: {
            type: String,
            required: true,
        },
        userAnswer: {
            type: String,
            default: "",
        },

        difficulty: {
            type: String,
            enum: ["easy", "medium", "hard"],
            default: "easy",
        },

        timer: {
            type: Number,
            default: 60,
        },

        feedback: {
            type: feedbackSchema,
            default: () => ({}),
        },

        // New: how the question should be answered
        questionType: {
            type: String,
            enum: ["verbal", "written", "coding"],
            default: "verbal",
        },
        topic: { type: String, default: "" },

        // New: adaptive follow-ups
        isFollowUp: { type: Boolean, default: false },
        followUpOf: { type: Number, default: null },
        difficultyReason: { type: String, default: "" },

        // New: answer metadata
        answered: { type: Boolean, default: false },
        answerMode: {
            type: String,
            enum: ["voice", "text", "code", "mixed", ""],
            default: "",
        },
        codeLanguage: { type: String, default: "" },
        timeTakenSec: { type: Number, default: 0 },
        timedOut: { type: Boolean, default: false },
        answeredAt: { type: Date, default: null },
        speechMetrics: { type: speechMetricsSchema, default: null },
    },
    { _id: false }
);

const planSlotSchema = new mongoose.Schema(
    {
        topic: { type: String, default: "" },
        questionType: {
            type: String,
            enum: ["verbal", "written", "coding"],
            default: "verbal",
        },
    },
    { _id: false }
);

const communicationSchema = new mongoose.Schema(
    {
        available: { type: Boolean, default: false },
        reason: { type: String, default: "" },
        questionsAnalyzed: { type: Number, default: 0 },
        totalWords: { type: Number, default: 0 },
        speakingTimeSec: { type: Number, default: 0 },
        wordsPerMinute: { type: Number, default: 0 },
        paceLabel: { type: String, default: "" },
        fillerCount: { type: Number, default: 0 },
        fillers: { type: Map, of: Number, default: () => ({}) },
        fillersPerMinute: { type: Number, default: 0 },
        fillersPer100Words: { type: Number, default: 0 },
        longPauseCount: { type: Number, default: 0 },
        longestPauseSec: { type: Number, default: 0 },
        averagePauseSec: { type: Number, default: 0 },
        pauseDataAvailable: { type: Boolean, default: false },
        clarityScore: { type: Number, default: 0 },
        notes: { type: [String], default: [] },
        feedback: { type: String, default: "" },
        caveat: { type: String, default: "" },
    },
    { _id: false }
);

const interviewSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },

        type: {
            type: String,
            enum: ["hr", "technical"],
            required: true,
        },

        role: {
            type: String,
            required: true,
        },
        useResume: {
            type: Boolean,
            default: false,
        },

        currentQuestion: {
            type: Number,
            default: 0,
        },

        questions: {
            type: [questionSchema],
            default: [],
        },

        overallScore: {
            type: Number,
            default: 0,
        },

        strengths: {
            type: [String],
            default: [],
        },

        weaknesses: {
            type: [String],
            default: [],
        },

        recommendations: {
            type: [String],
            default: [],
        },

        summary: {
            type: String,
            default: "",
        },

        status: {
            type: String,
            enum: ["in-progress", "completed"],
            default: "in-progress",
        },

        // ── Adaptive interview (new) ──
        adaptive: { type: Boolean, default: false },
        totalQuestions: { type: Number, default: 0 },
        plan: { type: [planSlotSchema], default: [] },
        maxFollowUps: { type: Number, default: 2 },
        currentDifficulty: {
            type: String,
            enum: ["easy", "medium", "hard"],
            default: "easy",
        },
        // Sanitised resume details used to personalise every question.
        resumeContext: {
            summary: { type: String, default: "" },
            skills: { type: [String], default: [] },
            projects: { type: [String], default: [] },
            experience: { type: [String], default: [] },
            strengths: { type: [String], default: [] },
            weaknesses: { type: [String], default: [] },
            missingSkills: { type: [String], default: [] },
            suggestedRole: { type: String, default: "" },
        },

        // ── Summary (new) ──
        improvementAreas: { type: [String], default: [] },
        technicalSkills: { type: [String], default: [] },
        keywords: { type: [String], default: [] },
        communication: { type: communicationSchema, default: null },
        summaryStatus: {
            type: String,
            enum: ["pending", "ready", "failed", ""],
            default: "",
        },
        summaryError: { type: String, default: "" },
        completedAt: { type: Date, default: null },

        // Prevents two concurrent answer submissions for the same question.
        processingLock: { type: Date, default: null },
    },
    {
        timestamps: true,
    }
);

interviewSchema.index({ userId: 1, createdAt: -1 });

const Interview = mongoose.model("Interview" , interviewSchema)

export default Interview
