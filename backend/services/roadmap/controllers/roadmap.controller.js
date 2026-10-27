import redis from "../../../shared/redis/redis.js";
import graph from "../graph/roadmap.graph.js";
import Roadmap from "../models/roadmap.model.js";
import {
    assessFeasibility,
    buildMilestones,
    computeProgress,
    DurationError,
    MAX_WEEKS,
    MIN_WEEKS,
    refreshMilestoneTargets,
    rescheduleRemaining,
    resolveDuration,
    resolveHoursPerWeek,
    resolveStartDate,
    scheduleModules,
} from "../engine/schedule.js";
import { fetchInterviewInsights, InsightsError } from "../configs/interviewInsights.js";
import { chargeCoins, CoinError, refundCoins, sendCoinError } from "../../../shared/utils/coins.js";
import { COIN_COSTS } from "../../../shared/config/pricing.js";
import { getSessionIdFromCookie, isValidObjectId } from "../../../shared/middleware/serviceAuth.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MODULE_STATUSES = ["not-started", "in-progress", "completed"];

const listKey = (userId) => `userRoadmaps:${userId}`;
// Cache keys include the user id so a cached roadmap is never served to another user.
const itemKey = (userId, id) => `roadmap:${userId}:${id}`;

const safeRedis = async (fn) => {
    try {
        return await fn();
    } catch (error) {
        console.log("Redis error:", error.message);
        return null;
    }
};

const invalidate = (userId, id) =>
    safeRedis(() => (id ? redis.del(listKey(userId), itemKey(userId, id)) : redis.del(listKey(userId))));

export const withProgress = (roadmap) => {
    const plain = typeof roadmap.toObject === "function" ? roadmap.toObject() : roadmap;
    return { ...plain, progress: computeProgress(plain) };
};

const handleError = (res, error) => {
    if (error instanceof DurationError || error?.name === "ValidationError") {
        return res.status(400).json({ success: false, message: error.message });
    }
    console.log(error);
    return res.status(500).json({ success: false, message: error.message });
};

const normalizeTitle = (title = "") => String(title).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Keep progress for modules that survive a roadmap update.
export const carryOverProgress = (newModules, oldModules = []) => {
    const previous = new Map(oldModules.map((m) => [normalizeTitle(m.title), m]));
    return newModules.map((m) => {
        const old = previous.get(normalizeTitle(m.title));
        return old && old.status && old.status !== "not-started"
            ? { ...m, status: old.status, completedAt: old.completedAt || null }
            : m;
    });
};

export const generateRoadmap = async (req, res) => {
    let input;
    try {
        const {
            role,
            targetPackage,
            useResume = false,
            resume,
            duration,
            hoursPerWeek,
            startDate,
            interviewId,
            updateRoadmapId,
        } = req.body || {};

        if (typeof role !== "string" || !role.trim() || typeof targetPackage !== "string" || !targetPackage.trim()) {
            return res.status(400).json({
                success: false,
                message: "Role and Target Package are required.",
            });
        }
        if (role.trim().length > 100 || targetPackage.trim().length > 50) {
            return res.status(400).json({ success: false, message: "Role or target package is too long." });
        }

        if (useResume && !resume) {
            return res.status(400).json({
                success: false,
                message: "Resume data is required.",
            });
        }
        if (interviewId && !isValidObjectId(interviewId)) {
            return res.status(400).json({ success: false, message: "Invalid interview id." });
        }
        if (updateRoadmapId && !isValidObjectId(updateRoadmapId)) {
            return res.status(400).json({ success: false, message: "Invalid roadmap id." });
        }

        input = {
            role: role.trim(),
            targetPackage: targetPackage.trim(),
            useResume: Boolean(useResume),
            resume: useResume ? resume : null,
            duration: resolveDuration(duration),
            hoursPerWeek: resolveHoursPerWeek(hoursPerWeek),
            startDate: resolveStartDate(startDate),
            interviewId: interviewId || null,
            updateRoadmapId: updateRoadmapId || null,
        };
    } catch (error) {
        return handleError(res, error);
    }

    const userId = req.userId;
    const sessionId = getSessionIdFromCookie(req.headers.cookie);

    let existing = null;
    let insights = null;
    try {
        if (input.updateRoadmapId) {
            existing = await Roadmap.findOne({ _id: input.updateRoadmapId, userId });
            if (!existing) return res.status(404).json({ success: false, message: "Roadmap not found" });
            // An update keeps using the interview the roadmap was built from.
            if (!input.interviewId && existing.personalization?.interviewId) {
                input.interviewId = String(existing.personalization.interviewId);
            }
        }
        if (input.interviewId) {
            insights = await fetchInterviewInsights({ interviewId: input.interviewId, userId });
        }
    } catch (error) {
        if (error instanceof InsightsError) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        return handleError(res, error);
    }

    let charge;
    try {
        charge = await chargeCoins({ userId, coins: COIN_COSTS.roadmap, sessionId, action: "roadmap-builder" });
    } catch (error) {
        if (error instanceof CoinError) return sendCoinError(res, error);
        return handleError(res, error);
    }

    try {
        const result = await graph.invoke({
            role: input.role,
            targetPackage: input.targetPackage,
            useResume: input.useResume,
            resume: input.resume,
            durationWeeks: input.duration.weeks,
            hoursPerWeek: input.hoursPerWeek,
            insights,
        });

        const generated = result.roadmap;

        // "Let AI decide": use the model's total, or derive it from the hours.
        let weeks = input.duration.weeks;
        if (!weeks) {
            const estimated = generated.modules.reduce((sum, m) => sum + (m.estimatedHours || 0), 0);
            weeks = generated.totalWeeks || (estimated ? Math.ceil(estimated / input.hoursPerWeek) : 12);
            weeks = Math.max(MIN_WEEKS, Math.min(MAX_WEEKS, weeks));
        }

        const { modules, totalHours } = scheduleModules(generated.modules, {
            durationWeeks: weeks,
            hoursPerWeek: input.hoursPerWeek,
            startDate: input.startDate,
        });

        const fields = {
            title: generated.title,
            targetPackage: generated.targetPackage || input.targetPackage,
            duration: input.duration.label || `${weeks} weeks`,
            level: generated.level,
            modules: existing ? carryOverProgress(modules, existing.modules) : modules,
            role: input.role,
            summary: generated.summary,
            durationPreset: input.duration.preset,
            durationWeeks: weeks,
            hoursPerWeek: input.hoursPerWeek,
            startDate: input.startDate,
            endDate: new Date(input.startDate.getTime() + weeks * WEEK_MS),
            milestones: buildMilestones(generated.milestones, modules),
            feasibility: assessFeasibility({ totalHours, durationWeeks: weeks, hoursPerWeek: input.hoursPerWeek }),
            personalization: {
                usedResume: input.useResume,
                usedInterview: Boolean(insights),
                interviewId: insights ? input.interviewId : null,
                interviewScore: insights?.overallScore ?? null,
                focusAreas: [
                    ...(insights?.improvementAreas || []),
                    ...(insights?.weaknesses || []),
                    ...((input.useResume && Array.isArray(input.resume?.missingSkills)) ? input.resume.missingSkills : []),
                ].filter((v) => typeof v === "string" && v.trim()).slice(0, 6),
            },
        };

        let roadmap;
        if (existing) {
            existing.set(fields);
            existing.revision = (existing.revision || 1) + 1;
            roadmap = await existing.save();
        } else {
            roadmap = await Roadmap.create({ userId, ...fields });
        }

        await invalidate(userId, roadmap._id);

        return res.status(existing ? 200 : 201).json({
            success: true,
            message: existing ? "Roadmap updated successfully." : "Roadmap generated successfully.",
            data: withProgress(roadmap),
            interviewCoin: charge.interviewCoin,
        });

    } catch (error) {
        console.log(error);
        const refund = await refundCoins({ userId, coins: COIN_COSTS.roadmap, sessionId, action: "roadmap-builder" });
        return res.status(502).json({
            success: false,
            message: "Could not generate the roadmap right now. Your coins were refunded — please try again.",
            interviewCoin: refund?.interviewCoin,
        });
    }
}


export const getAllRoadmap = async (req, res) => {
    try {
        const userId = req.userId
        const cache = await safeRedis(() => redis.get(listKey(userId)))

        if (cache) {
            return res.status(200).json({
                success: true,
                data: JSON.parse(cache),
            })
        }

        const roadmaps = await Roadmap.find({ userId }).sort({ createdAt: -1 }).lean()
        const data = roadmaps.map(withProgress)

        await safeRedis(() => redis.set(listKey(userId), JSON.stringify(data), "EX", 60 * 60))

        return res.json({
            success: true,
            data,
        });
    } catch (error) {
        return handleError(res, error);
    }
}

export const getRoadmapbyId = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId;

        if (!isValidObjectId(id)) {
            return res.status(404).json({ success: false, message: "Roadmap not found" });
        }

        const cache = await safeRedis(() => redis.get(itemKey(userId, id)))
        if (cache) {
            return res.json({
                success: true,
                fromCache: true,
                data: withProgress(JSON.parse(cache))
            });
        }

        const roadmap = await Roadmap.findOne({
            _id: id,
            userId: userId
        }).lean()

        if (!roadmap) {
            return res.status(404).json({
                success: false,
                message: "Roadmap not found"
            });
        }

        await safeRedis(() => redis.set(itemKey(userId, id), JSON.stringify(roadmap), "EX", 60 * 60))

        return res.json({
            success: true,
            fromCache: false,
            data: withProgress(roadmap)
        });
    } catch (error) {
        return handleError(res, error);
    }
}

export const getRoadmapByInterview = async (req, res) => {
    try {
        const { interviewId } = req.params;
        if (!isValidObjectId(interviewId)) {
            return res.status(404).json({ success: false, message: "Roadmap not found" });
        }
        const roadmap = await Roadmap.findOne({ userId: req.userId, "personalization.interviewId": interviewId })
            .sort({ updatedAt: -1 })
            .lean();
        return res.json({ success: true, data: roadmap ? withProgress(roadmap) : null });
    } catch (error) {
        return handleError(res, error);
    }
}

const findOwned = async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        res.status(404).json({ success: false, message: "Roadmap not found" });
        return null;
    }
    const roadmap = await Roadmap.findOne({ _id: id, userId: req.userId });
    if (!roadmap) {
        res.status(404).json({ success: false, message: "Roadmap not found" });
        return null;
    }
    return roadmap;
};

export const updateModuleStatus = async (req, res) => {
    try {
        const { status } = req.body || {};
        const index = Number(req.params.index);

        if (!MODULE_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, message: "Status must be not-started, in-progress or completed" });
        }

        const roadmap = await findOwned(req, res);
        if (!roadmap) return;

        if (!Number.isInteger(index) || index < 0 || index >= roadmap.modules.length) {
            return res.status(400).json({ success: false, message: "Invalid module" });
        }

        const module = roadmap.modules[index];
        module.status = status;
        module.completedAt = status === "completed" ? (module.completedAt || new Date()) : null;
        roadmap.markModified("modules");
        await roadmap.save();
        await invalidate(req.userId, roadmap._id);

        return res.json({ success: true, data: withProgress(roadmap) });
    } catch (error) {
        return handleError(res, error);
    }
}

export const rescheduleRoadmap = async (req, res) => {
    try {
        const { hoursPerWeek, endDate } = req.body || {};
        const roadmap = await findOwned(req, res);
        if (!roadmap) return;

        const plain = roadmap.toObject();
        const pace = hoursPerWeek === undefined || hoursPerWeek === null || hoursPerWeek === ""
            ? undefined
            : resolveHoursPerWeek(hoursPerWeek);
        let end;
        if (endDate) {
            end = new Date(endDate);
            if (Number.isNaN(end.getTime())) throw new DurationError("End date is invalid");
        }

        const result = rescheduleRemaining(plain, { hoursPerWeek: pace, endDate: end });

        roadmap.modules = result.modules;
        roadmap.hoursPerWeek = result.hoursPerWeek;
        roadmap.endDate = result.endDate;
        roadmap.startDate = result.startDate;
        roadmap.durationWeeks = result.durationWeeks;
        roadmap.duration = `${result.durationWeeks} weeks (rescheduled)`;
        roadmap.feasibility = result.feasibility;
        roadmap.milestones = refreshMilestoneTargets(plain.milestones, result.modules);
        await roadmap.save();
        await invalidate(req.userId, roadmap._id);

        return res.json({ success: true, data: withProgress(roadmap) });
    } catch (error) {
        return handleError(res, error);
    }
}

export const deleteRoadmap = async (req, res) => {
    try {
        const roadmap = await findOwned(req, res);
        if (!roadmap) return;
        await Roadmap.deleteOne({ _id: roadmap._id, userId: req.userId });
        await invalidate(req.userId, roadmap._id);
        return res.json({ success: true, message: "Roadmap deleted" });
    } catch (error) {
        return handleError(res, error);
    }
}
