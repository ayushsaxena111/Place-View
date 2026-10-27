// pdf ---> text ---> charge coins ---> llm analysis ---> store PDF (GridFS)
//     ---> save version (history) ---> set as active resume ---> redis cache
// On any failure after charging, the coins are refunded.

import fs from "fs";
import path from "path";
import redis from "../../../shared/redis/redis.js";
import { resumeAgent } from "../agents/resume.agent.js";
import extractText from "../config/pdf.js";
import Resume from "../models/resume.model.js";
import ResumeVersion from "../models/resumeVersion.model.js";
import { isPdfFile } from "../middleware/multer.js";
import { deleteResumeFile, openResumeFile, saveResumeFile } from "../utils/fileStore.js";
import { pickAnalysis } from "../utils/normalizeResume.js";
import { chargeCoins, CoinError, refundCoins, sendCoinError } from "../../../shared/utils/coins.js";
import { COIN_COSTS } from "../../../shared/config/pricing.js";
import { getSessionIdFromCookie, isValidObjectId } from "../../../shared/middleware/serviceAuth.js";

const MIN_TEXT_LENGTH = 50;
const HISTORY_LIMIT = 50;

const cacheKey = (userId) => `resume:${userId}`;

const removeTempFile = (file) => {
    if (file?.path && fs.existsSync(file.path)) {
        try {
            fs.unlinkSync(file.path);
        } catch (error) {
            console.log("Could not remove temp upload:", error.message);
        }
    }
};

export const sanitizeFileName = (name = "") => {
    const base = path.basename(String(name)).replace(/[\u0000-\u001f\u007f"\\]/g, "").trim();
    return (base || "resume.pdf").slice(0, 200);
};

const cacheResume = async (userId, resume) => {
    try {
        await redis.set(cacheKey(userId), JSON.stringify(resume), "EX", 60 * 60);
    } catch (error) {
        console.log("Redis cache write failed:", error.message);
    }
};

const clearResumeCache = async (userId) => {
    try {
        await redis.del(cacheKey(userId));
    } catch (error) {
        console.log("Redis cache delete failed:", error.message);
    }
};

// Copy a version's analysis into the user's single "current" resume document,
// which the rest of the app (interviews, roadmaps, builder) already uses.
export const setActiveResume = async (userId, versionDoc) => {
    const version = typeof versionDoc.toObject === "function" ? versionDoc.toObject() : versionDoc;
    return Resume.findOneAndUpdate(
        { userId },
        {
            $set: {
                ...pickAnalysis(version),
                extractedText: version.extractedText || " ",
                activeVersionId: version._id,
            },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );
};

const toHistoryItem = (version, activeVersionId) => ({
    _id: version._id,
    fileName: version.fileName || (version.isLegacy ? "Earlier upload" : "resume.pdf"),
    fileSize: version.fileSize || 0,
    hasFile: Boolean(version.fileId),
    isLegacy: Boolean(version.isLegacy),
    score: version.score ?? 0,
    suggestedRole: version.suggestedRole || "",
    name: version.name || "",
    skillsCount: version.skills?.length || 0,
    createdAt: version.createdAt,
    isActive: activeVersionId ? String(activeVersionId) === String(version._id) : false,
});

export const uploadResume = async (req, res) => {
    const file = req.file;
    const userId = req.userId;

    try {
        if (!file) {
            return res.status(400).json({
                success: false,
                message: "Resume PDF is required"
            });
        }

        if (!isPdfFile(file.path)) {
            return res.status(400).json({
                success: false,
                message: "The uploaded file is not a valid PDF"
            });
        }

        let resumeText = "";
        try {
            resumeText = await extractText(file.path);
        } catch (error) {
            console.log("PDF parse error:", error.message);
            return res.status(422).json({
                success: false,
                message: "Could not read this PDF. Please upload a different file."
            });
        }

        if (resumeText.replace(/\s+/g, " ").trim().length < MIN_TEXT_LENGTH) {
            return res.status(422).json({
                success: false,
                message: "No readable text was found in this PDF. Scanned image PDFs are not supported — please upload a text-based PDF."
            });
        }

        const sessionId = getSessionIdFromCookie(req.headers.cookie);
        let charge;
        try {
            charge = await chargeCoins({ userId, coins: COIN_COSTS.resumeAnalysis, sessionId, action: "resume-scorer" });
        } catch (error) {
            if (error instanceof CoinError) return sendCoinError(res, error);
            throw error;
        }

        let fileId = null;
        try {
            const analysis = await resumeAgent(resumeText);

            fileId = await saveResumeFile(file.path, {
                fileName: sanitizeFileName(file.originalname),
                userId,
            });

            const version = await ResumeVersion.create({
                userId,
                fileId,
                fileName: sanitizeFileName(file.originalname),
                fileSize: file.size || 0,
                extractedText: resumeText,
                ...analysis,
            });

            const resume = await setActiveResume(userId, version);
            await cacheResume(userId, resume);

            return res.status(200).json({
                success: true,
                message: "Resume analyzed successfully",
                data: resume,
                versionId: version._id,
                interviewCoin: charge.interviewCoin,
            });
        } catch (error) {
            console.log(error);
            if (fileId) await deleteResumeFile(fileId).catch(() => {});
            const refund = await refundCoins({ userId, coins: COIN_COSTS.resumeAnalysis, sessionId, action: "resume-scorer" });
            return res.status(500).json({
                success: false,
                message: "Resume analysis failed. Your coins were refunded — please try again.",
                interviewCoin: refund?.interviewCoin,
            });
        }

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    } finally {
        removeTempFile(file);
    }
};

export const getResume = async (req, res) => {
    try {
        const userId = req.userId;

        const cache = await redis.get(cacheKey(userId));

        if (cache) {
            return res.status(200).json({
                success: true,
                source: "redis",
                data: JSON.parse(cache)
            });
        }

        const resume = await Resume.findOne({ userId });

        if (!resume) {
            return res.status(404).json({
                success: false,
                message: "resume not found"
            });
        }

        await cacheResume(userId, resume);

        return res.status(200).json({
            success: true,
            source: "mongoDb",
            data: resume
        });

    } catch (error) {
        console.log(error);

        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Resumes uploaded before history existed become a "legacy" history entry.
const ensureLegacyVersion = async (userId) => {
    const current = await Resume.findOne({ userId });
    if (!current || current.activeVersionId) return null;

    const version = await ResumeVersion.create({
        userId,
        isLegacy: true,
        extractedText: current.extractedText || "",
        ...pickAnalysis(current),
        createdAt: current.updatedAt || current.createdAt,
    });
    current.activeVersionId = version._id;
    await current.save();
    await clearResumeCache(userId);
    return version;
};

export const getResumeHistory = async (req, res) => {
    try {
        const userId = req.userId;

        let versions = await ResumeVersion.find({ userId })
            .sort({ createdAt: -1 })
            .limit(HISTORY_LIMIT)
            .select("-extractedText")
            .lean();

        if (versions.length === 0) {
            const legacy = await ensureLegacyVersion(userId);
            if (legacy) versions = [legacy.toObject()];
        }

        const current = await Resume.findOne({ userId }).select("activeVersionId").lean();

        return res.status(200).json({
            success: true,
            data: versions.map((v) => toHistoryItem(v, current?.activeVersionId)),
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

const findOwnedVersion = async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        res.status(404).json({ success: false, message: "Resume not found" });
        return null;
    }
    const version = await ResumeVersion.findOne({ _id: id, userId: req.userId });
    if (!version) {
        res.status(404).json({ success: false, message: "Resume not found" });
        return null;
    }
    return version;
};

export const getResumeVersion = async (req, res) => {
    try {
        const version = await findOwnedVersion(req, res);
        if (!version) return;

        const current = await Resume.findOne({ userId: req.userId }).select("activeVersionId").lean();
        const data = version.toObject();
        delete data.extractedText;

        return res.status(200).json({
            success: true,
            data: {
                ...data,
                hasFile: Boolean(version.fileId),
                isActive: String(current?.activeVersionId || "") === String(version._id),
            },
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const downloadResumeFile = async (req, res) => {
    try {
        const version = await findOwnedVersion(req, res);
        if (!version) return;

        if (!version.fileId) {
            return res.status(404).json({
                success: false,
                message: "The original PDF is not available for this resume (it was uploaded before resume history was enabled).",
            });
        }

        const fileName = sanitizeFileName(version.fileName).replace(/[^\x20-\x7e]/g, "_");
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");

        openResumeFile(version.fileId)
            .on("error", (error) => {
                console.log("Resume file stream error:", error.message);
                if (!res.headersSent) {
                    res.status(404).json({ success: false, message: "Resume file not found" });
                } else {
                    res.end();
                }
            })
            .pipe(res);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const activateResumeVersion = async (req, res) => {
    try {
        const version = await findOwnedVersion(req, res);
        if (!version) return;

        const resume = await setActiveResume(req.userId, version);
        await cacheResume(req.userId, resume);

        return res.status(200).json({
            success: true,
            message: "Resume set as current",
            data: resume,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteResumeVersion = async (req, res) => {
    try {
        const userId = req.userId;
        const version = await findOwnedVersion(req, res);
        if (!version) return;

        const current = await Resume.findOne({ userId });
        const wasActive = current && String(current.activeVersionId || "") === String(version._id);

        await deleteResumeFile(version.fileId);
        await ResumeVersion.deleteOne({ _id: version._id, userId });

        let activeResume = current;
        if (wasActive) {
            const next = await ResumeVersion.findOne({ userId }).sort({ createdAt: -1 });
            if (next) {
                activeResume = await setActiveResume(userId, next);
            } else {
                await Resume.deleteOne({ userId });
                activeResume = null;
            }
        }

        await clearResumeCache(userId);

        return res.status(200).json({
            success: true,
            message: "Resume deleted",
            activeResume,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: error.message });
    }
};
