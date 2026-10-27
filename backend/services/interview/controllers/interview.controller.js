import redis from "../../../shared/redis/redis.js";
import graph from "../graph/graph.js";
import Interview from "../models/interview.model.js";
import { countProgress, DEFAULT_MAX_FOLLOW_UPS } from "../engine/adaptive.js";
import { buildSpeechMetrics } from "../engine/speech.js";
import { parseAnswerInput, parseStartInput, ValidationError } from "./validation.js";
import { chargeCoins, CoinError, refundCoins, sendCoinError } from "../../../shared/utils/coins.js";
import { COIN_COSTS } from "../../../shared/config/pricing.js";
import { getSessionIdFromCookie, isValidObjectId } from "../../../shared/middleware/serviceAuth.js";

// A crashed request must not block an interview forever.
export const LOCK_TIMEOUT_MS = 2 * 60 * 1000;

const listCacheKey = (userId) => `interviews:${userId}`;

const clearListCache = async (userId) => {
    try {
        await redis.del(listCacheKey(userId));
    } catch (error) {
        console.log("Redis cache delete failed:", error.message);
    }
};

const sendError = (res, error, fallbackStatus = 500) => {
    if (error instanceof ValidationError) {
        return res.status(400).json({ success: false, message: error.message });
    }
    console.log(error);
    return res.status(fallbackStatus).json({ success: false, message: error.message });
};

const releaseLock = async (interviewId) => {
    try {
        await Interview.updateOne({ _id: interviewId }, { $set: { processingLock: null } });
    } catch (error) {
        console.log("Failed to release interview lock:", error.message);
    }
};

const totalMainQuestions = (interview) =>
    interview.totalQuestions || interview.questions.filter((q) => !q.isFollowUp).length;

const progressOf = (interview) => {
    const { mainAnswered, followUpsUsed } = countProgress(interview.questions);
    return { mainAnswered, totalMain: totalMainQuestions(interview), followUpsUsed };
};

// Public shape of feedback during the interview (no internal fields).
const publicFeedback = (feedback) => {
    if (!feedback) return null;
    const plain = typeof feedback.toObject === "function" ? feedback.toObject() : feedback;
    const { followUp: _followUp, ...rest } = plain;
    return rest;
};

const applyReport = (interview, report) => {
    interview.overallScore = report.overallScore;
    interview.summary = report.summary;
    interview.strengths = report.strengths;
    interview.weaknesses = report.weaknesses;
    interview.recommendations = report.recommendations;
    interview.improvementAreas = report.improvementAreas;
    interview.technicalSkills = report.technicalSkills;
    interview.keywords = report.keywords;
    interview.communication = report.communication;
    interview.summaryStatus = report.summaryStatus;
    interview.summaryError = report.summaryError;
};

export const startInterview = async (req, res) => {
    let input;
    try {
        input = parseStartInput(req.body);
    } catch (error) {
        return sendError(res, error);
    }

    const userId = req.userId;
    const sessionId = getSessionIdFromCookie(req.headers.cookie);

    let charge;
    try {
        charge = await chargeCoins({ userId, coins: COIN_COSTS.interview, sessionId, action: "start-interview" });
    } catch (error) {
        if (error instanceof CoinError) return sendCoinError(res, error);
        return sendError(res, error);
    }

    try {
        const result = await graph.invoke({
            action: "start",
            role: input.role,
            type: input.type,
            useResume: input.useResume,
            resume: input.resume,
            questionCount: input.questionCount,
        });

        const interview = await Interview.create({
            userId,
            type: input.type,
            role: input.role,
            useResume: input.useResume,
            resumeContext: input.resume || undefined,
            adaptive: true,
            plan: result.plan,
            totalQuestions: result.plan.length,
            maxFollowUps: DEFAULT_MAX_FOLLOW_UPS,
            currentDifficulty: result.firstQuestion.difficulty,
            questions: [result.firstQuestion],
            currentQuestion: 0,
            status: "in-progress",
            summaryStatus: "pending",
        });

        await clearListCache(userId);

        return res.status(200).json({
            success: true,
            interviewId: interview._id,
            currentQuestion: 0,
            totalQuestions: interview.totalQuestions,
            question: interview.questions[0],
            adaptive: true,
            interviewCoin: charge.interviewCoin,
        });
    } catch (error) {
        console.log(error);
        const refund = await refundCoins({ userId, coins: COIN_COSTS.interview, sessionId, action: "start-interview" });
        return res.status(502).json({
            success: false,
            message: "Could not generate interview questions right now. Your coins were refunded — please try again.",
            interviewCoin: refund?.interviewCoin,
        });
    }
};

export const submitAnswer = async (req, res) => {
    let input;
    try {
        input = parseAnswerInput(req.body);
    } catch (error) {
        return sendError(res, error);
    }

    const userId = req.userId;
    const now = new Date();

    // Lock the interview so a double submit cannot evaluate the same question twice.
    const interview = await Interview.findOneAndUpdate(
        {
            _id: input.interviewId,
            userId,
            status: "in-progress",
            $or: [
                { processingLock: null },
                { processingLock: { $lt: new Date(now.getTime() - LOCK_TIMEOUT_MS) } },
            ],
        },
        { $set: { processingLock: now } },
        { new: true }
    );

    if (!interview) {
        const existing = await Interview.findOne({ _id: input.interviewId, userId }).select("status");
        if (!existing) {
            return res.status(404).json({ success: false, message: "Interview not found" });
        }
        if (existing.status === "completed") {
            return res.status(400).json({ success: false, message: "Interview already completed" });
        }
        return res.status(409).json({ success: false, message: "Your previous answer is still being processed. Please wait." });
    }

    const index = interview.currentQuestion;
    const currentDoc = interview.questions[index];

    if (!currentDoc) {
        await releaseLock(interview._id);
        return res.status(400).json({ success: false, message: "Invalid question index" });
    }

    if (input.questionIndex !== undefined && input.questionIndex !== index) {
        await releaseLock(interview._id);
        return res.status(409).json({
            success: false,
            message: "This question was already answered.",
            currentQuestion: index,
            question: currentDoc,
        });
    }

    try {
        const snapshot = interview.toObject({ flattenMaps: true });
        const spoken = currentDoc.questionType === "verbal" || ["voice", "mixed"].includes(input.answerMode);

        const current = {
            ...snapshot.questions[index],
            userAnswer: input.answer,
            answerMode: input.answerMode,
            codeLanguage: input.codeLanguage,
            timeTakenSec: input.timeTakenSec,
            timedOut: input.timedOut,
            answeredAt: now,
            speechMetrics: spoken ? buildSpeechMetrics(input.speechMetrics) : null,
        };

        const result = await graph.invoke({ action: "answer", interview: snapshot, index, current });
        const previousDifficulty = currentDoc.difficulty;

        interview.questions = result.questions;
        if (result.nextQuestion) {
            interview.questions.push(result.nextQuestion);
            interview.currentDifficulty = result.nextQuestion.difficulty;
        }
        interview.currentQuestion = index + 1;
        interview.processingLock = null;

        const storedFeedback = interview.questions[index].feedback;

        if (result.completed) {
            interview.status = "completed";
            interview.completedAt = now;
            applyReport(interview, result.report);

            await interview.save();
            await clearListCache(userId);

            return res.status(200).json({
                success: true,
                completed: true,
                interview,
                feedback: storedFeedback,
            });
        }

        await interview.save();
        await clearListCache(userId);

        const nextQuestion = interview.questions[interview.currentQuestion];

        return res.status(200).json({
            success: true,
            completed: false,
            currentQuestion: interview.currentQuestion,
            totalQuestions: totalMainQuestions(interview),
            question: nextQuestion,
            feedback: publicFeedback(storedFeedback),
            progress: progressOf(interview),
            adaptation: interview.adaptive
                ? {
                    type: result.decision?.type,
                    previousDifficulty,
                    difficulty: nextQuestion?.difficulty,
                    change: result.decision?.change || 0,
                    reason: nextQuestion?.difficultyReason || "",
                }
                : null,
        });

    } catch (error) {
        console.log(error);
        await releaseLock(interview._id);
        return res.status(502).json({
            success: false,
            retryable: true,
            message: "Could not evaluate your answer right now. Your answer was not lost — please try again.",
        });
    }
};


export const getInterview = async (req, res) => {
    try {
        const userId = req.userId
        const { id } = req.params

        if (!isValidObjectId(id)) {
            return res.status(404).json({ success: false, message: "Interview not found" });
        }

        const interview = await Interview.findOne({
            _id: id,
            userId
        }).select("-processingLock")

        if (!interview) {
            return res.status(404).json({
                success: false,
                message: "Interview not found",
            });
        }

        return res.status(200).json({
            success: true,
            interview,
        });
    } catch (error) {
        return sendError(res, error);
    }
}

// Lightweight, paginated list for the history page.
export const getInterviewHistory = async (req, res) => {
    try {
        const userId = req.userId;
        const page = Math.max(1, Math.min(1000, parseInt(req.query.page, 10) || 1));
        const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 20));

        const [items, total] = await Promise.all([
            Interview.find({ userId })
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .select("role type status overallScore createdAt completedAt totalQuestions adaptive summaryStatus useResume questions.questionType questions.isFollowUp questions.answered questions.userAnswer questions.feedback.score")
                .lean(),
            Interview.countDocuments({ userId }),
        ]);

        const data = items.map((item) => {
            const questions = item.questions || [];
            const types = { verbal: 0, written: 0, coding: 0 };
            let answered = 0;
            let followUps = 0;
            for (const q of questions) {
                types[q.questionType || "verbal"] = (types[q.questionType || "verbal"] || 0) + 1;
                // Follow-ups are extra questions, so they don't count toward "x of N answered".
                if (!q.isFollowUp && (q.answered || q.userAnswer)) answered++;
                if (q.isFollowUp) followUps++;
            }
            return {
                _id: item._id,
                role: item.role,
                type: item.type,
                status: item.status,
                overallScore: item.overallScore || 0,
                createdAt: item.createdAt,
                completedAt: item.completedAt,
                adaptive: Boolean(item.adaptive),
                useResume: Boolean(item.useResume),
                summaryStatus: item.summaryStatus || (item.status === "completed" ? "ready" : ""),
                totalQuestions: item.totalQuestions || questions.filter((q) => !q.isFollowUp).length,
                answeredQuestions: answered,
                followUps,
                questionTypes: types,
            };
        });

        return res.status(200).json({
            success: true,
            data,
            pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
        });
    } catch (error) {
        return sendError(res, error);
    }
};

// Re-run the end-of-interview analysis (e.g. after the AI summary failed).
export const regenerateSummary = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(404).json({ success: false, message: "Interview not found" });
        }

        const interview = await Interview.findOne({ _id: id, userId });
        if (!interview) {
            return res.status(404).json({ success: false, message: "Interview not found" });
        }
        if (interview.status !== "completed") {
            return res.status(400).json({ success: false, message: "The interview is not finished yet" });
        }
        if (interview.summaryStatus === "ready") {
            return res.status(200).json({ success: true, interview });
        }

        const result = await graph.invoke({
            action: "summary",
            interview: interview.toObject({ flattenMaps: true }),
        });

        applyReport(interview, result.report);
        await interview.save();
        await clearListCache(userId);

        if (result.report.summaryStatus !== "ready") {
            return res.status(502).json({
                success: false,
                message: "The AI summary could not be generated right now. Please try again.",
                interview,
            });
        }

        return res.status(200).json({ success: true, interview });
    } catch (error) {
        return sendError(res, error);
    }
};

export const deleteInterview = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(404).json({ success: false, message: "Interview not found" });
        }

        const result = await Interview.deleteOne({ _id: id, userId });
        if (!result.deletedCount) {
            return res.status(404).json({ success: false, message: "Interview not found" });
        }

        await clearListCache(userId);
        return res.status(200).json({ success: true, message: "Interview deleted" });
    } catch (error) {
        return sendError(res, error);
    }
};


export const getAllInterviews = async (req, res) => {
    try {
        const userId = req.userId

        const cache = await redis.get(listCacheKey(userId))

        if (cache) {
            return res.status(200).json(JSON.parse(cache))
        }

        const interviews = await Interview.find({ userId }).sort({ createdAt: -1 }).select("-processingLock")

        const completed = interviews.filter((item) => item.status === "completed")

        const totalQuestions = interviews.reduce((sum, item) => sum + item.questions.length, 0)

        const averageScore = completed.length > 0 ? Number(
            ((completed.reduce((sum, item) => sum + (item.overallScore || 0), 0)) / completed.length).toFixed(1)) : 0


        const stats = {
            totalInterviews: interviews.length,
            totalQuestions,
            completed: completed.length,
            averageScore
        }

        const EMPTY = [
            { skill: "Correctness", score: 0 },
            { skill: "Clarity", score: 0 },
            { skill: "Relevance", score: 0 },
            { skill: "Detail", score: 0 },
            { skill: "Efficiency", score: 0 },
            { skill: "Communication", score: 0 },
            { skill: "Problem solving", score: 0 },
            { skill: "Creativity", score: 0 },
        ];

        const getAverageData = (list) => {
            const total = {
                correctness: 0,
                clarity: 0,
                relevance: 0,
                detail: 0,
                efficiency: 0,
                communication: 0,
                problemSolving: 0,
                creativity: 0,
            }
            let count = 0

            list.forEach((interview) => {
                interview.questions.forEach((q) => {
                    if (!(q.answered || q.userAnswer) || !q.feedback) return
                    count++
                    total.correctness += q.feedback.correctness || 0;
                    total.clarity += q.feedback.clarity || 0;
                    total.relevance += q.feedback.relevance || 0;
                    total.detail += q.feedback.detail || 0;
                    total.efficiency += q.feedback.efficiency || 0;
                    total.communication += q.feedback.communication || 0;
                    total.problemSolving += q.feedback.problemSolving || 0;
                    total.creativity += q.feedback.creativity || 0;
                })
            })

            if (count === 0) return EMPTY

            return [
                { skill: "Correctness", score: Math.round(total.correctness / count) },
                { skill: "Clarity", score: Math.round(total.clarity / count) },
                { skill: "Relevance", score: Math.round(total.relevance / count) },
                { skill: "Detail", score: Math.round(total.detail / count) },
                { skill: "Efficiency", score: Math.round(total.efficiency / count) },
                { skill: "Communication", score: Math.round(total.communication / count) },
                { skill: "Problem solving", score: Math.round(total.problemSolving / count) },
                { skill: "Creativity", score: Math.round(total.creativity / count) },
            ]
        }

        const technicalInterviews = completed.filter((item) => item.type === "technical")
        const HrInterviews = completed.filter((item) => item.type === "hr")

        const payload = {
            success: true,
            interviews,
            stats,
            technicalData: getAverageData(technicalInterviews),
            hrData: getAverageData(HrInterviews),
            technicalCount: technicalInterviews.length,
            hrCount: HrInterviews.length,
        }

        try {
            await redis.set(listCacheKey(userId), JSON.stringify(payload), "EX", 600)
        } catch (error) {
            console.log("Redis cache write failed:", error.message)
        }

        return res.status(200).json(payload);

    } catch (error) {
        return sendError(res, error);
    }
}
