// Deterministic roadmap scheduling, milestones and progress tracking.

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

export const DURATION_PRESETS = Object.freeze({
    "3m": { weeks: 13, label: "3 months" },
    "6m": { weeks: 26, label: "6 months" },
    "1y": { weeks: 52, label: "1 year" },
})

export const MIN_WEEKS = 2
export const MAX_WEEKS = 104
export const MIN_HOURS_PER_WEEK = 2
export const MAX_HOURS_PER_WEEK = 60
export const DEFAULT_HOURS_PER_WEEK = 10

export class DurationError extends Error {
    constructor(message) {
        super(message)
        this.name = "DurationError"
        this.status = 400
    }
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`

/**
 * Resolve the duration requested by the user into weeks.
 * duration: { preset: "3m"|"6m"|"1y"|"custom"|"auto", value, unit: "weeks"|"months" }
 * Returns { preset, weeks|null, label }.
 */
export const resolveDuration = (duration) => {
    if (!duration || typeof duration !== "object" || !duration.preset || duration.preset === "auto") {
        return { preset: "auto", weeks: null, label: "" }
    }

    const preset = String(duration.preset)
    if (DURATION_PRESETS[preset]) {
        const { weeks, label } = DURATION_PRESETS[preset]
        return { preset, weeks, label: `${label} (${weeks} weeks)` }
    }

    if (preset !== "custom") throw new DurationError("Unknown roadmap duration")

    const value = Number(duration.value)
    const unit = duration.unit === "weeks" ? "weeks" : duration.unit === "months" ? "months" : null
    if (!unit) throw new DurationError("Custom duration unit must be 'weeks' or 'months'")
    if (!Number.isFinite(value) || value <= 0) throw new DurationError("Custom duration must be a positive number")

    const weeks = unit === "weeks" ? Math.round(value) : Math.round(value * 4.345)
    if (weeks < MIN_WEEKS || weeks > MAX_WEEKS) {
        throw new DurationError(`Custom duration must be between ${MIN_WEEKS} weeks and 24 months`)
    }
    const label = unit === "weeks"
        ? plural(Math.round(value), "week")
        : `${plural(Number(value.toFixed(1)), "month")} (${weeks} weeks)`
    return { preset: "custom", weeks, label }
}

export const resolveHoursPerWeek = (value) => {
    if (value === undefined || value === null || value === "") return DEFAULT_HOURS_PER_WEEK
    const n = Number(value)
    if (!Number.isFinite(n) || n < MIN_HOURS_PER_WEEK || n > MAX_HOURS_PER_WEEK) {
        throw new DurationError(`Study hours per week must be between ${MIN_HOURS_PER_WEEK} and ${MAX_HOURS_PER_WEEK}`)
    }
    return Math.round(n)
}

export const startOfDay = (date) => {
    const d = new Date(date)
    d.setUTCHours(0, 0, 0, 0)
    return d
}

export const resolveStartDate = (value, now = new Date()) => {
    const today = startOfDay(now)
    if (!value) return today
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) throw new DurationError("Start date is invalid")
    const day = startOfDay(d)
    if (day < new Date(today.getTime() - 30 * DAY_MS) || day > new Date(today.getTime() + 365 * DAY_MS)) {
        throw new DurationError("Start date must be within the past 30 days or the next year")
    }
    return day
}

const roundWeek = (n) => Math.round(n * 10) / 10

const weekLabel = (startWeek, endWeek) => {
    const from = Math.floor(startWeek) + 1
    const to = Math.max(from, Math.ceil(endWeek))
    return from === to ? `Week ${from}` : `Weeks ${from}–${to}`
}

/** Parse a duration string like "2 weeks" / "10 days" / "1 month" into hours at a given pace. */
export const hoursFromDurationText = (text, hoursPerWeek) => {
    const m = String(text || "").toLowerCase().match(/(\d+(?:\.\d+)?)\s*(hour|hr|day|week|month)/)
    if (!m) return 0
    const n = Number(m[1])
    switch (m[2]) {
        case "hour":
        case "hr":
            return n
        case "day":
            return (n / 7) * hoursPerWeek
        case "week":
            return n * hoursPerWeek
        case "month":
            return n * 4.345 * hoursPerWeek
        default:
            return 0
    }
}

/**
 * Lay modules out over the timeline in order, giving each a share of the
 * weeks proportional to its estimated hours.
 */
export const scheduleModules = (modules, { durationWeeks, hoursPerWeek, startDate, offsetWeeks = 0 }) => {
    const hours = modules.map((m) => {
        const h = Number(m.estimatedHours)
        if (Number.isFinite(h) && h > 0) return Math.min(400, Math.max(1, h))
        const parsed = hoursFromDurationText(m.duration, hoursPerWeek)
        return parsed > 0 ? parsed : 0
    })
    const known = hours.filter((h) => h > 0)
    const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : hoursPerWeek
    const filled = hours.map((h) => (h > 0 ? h : fallback))
    const totalHours = filled.reduce((a, b) => a + b, 0)

    let cursor = offsetWeeks
    const scheduled = modules.map((m, i) => {
        const weeks = (filled[i] / totalHours) * durationWeeks
        const startWeek = cursor
        const endWeek = cursor + weeks
        cursor = endWeek
        return {
            ...m,
            estimatedHours: Math.round(filled[i]),
            startWeek: roundWeek(startWeek),
            endWeek: roundWeek(endWeek),
            startDate: new Date(startDate.getTime() + (startWeek - offsetWeeks) * WEEK_MS),
            endDate: new Date(startDate.getTime() + (endWeek - offsetWeeks) * WEEK_MS),
            duration: `${weekLabel(startWeek, endWeek)} · ~${Math.round(filled[i])} hrs`,
        }
    })

    return { modules: scheduled, totalHours: Math.round(totalHours) }
}

export const assessFeasibility = ({ totalHours, durationWeeks, hoursPerWeek }) => {
    const required = durationWeeks > 0 ? Math.round((totalHours / durationWeeks) * 10) / 10 : 0
    const ratio = hoursPerWeek > 0 ? required / hoursPerWeek : 0
    let status = "realistic"
    let note = `About ${required} hours per week, which matches your ${hoursPerWeek} hours/week.`
    if (ratio <= 0.85) {
        status = "comfortable"
        note = `About ${required} hours per week — comfortably within your ${hoursPerWeek} hours/week, leaving room for revision and projects.`
    } else if (ratio > 1.15) {
        status = "intensive"
        const weeksNeeded = Math.ceil(totalHours / hoursPerWeek)
        note = `This plan needs about ${required} hours per week, more than your ${hoursPerWeek} hours/week. ` +
            `Consider about ${weeksNeeded} weeks, or more study time each week.`
    }
    return { status, requiredHoursPerWeek: required, totalHours, note }
}

/**
 * Validate LLM milestones; fall back to contiguous groups of real modules.
 */
export const buildMilestones = (rawMilestones, modules) => {
    const n = modules.length
    const valid = []
    const covered = new Set()

    if (Array.isArray(rawMilestones)) {
        for (const m of rawMilestones) {
            const title = String(m?.title || "").trim().slice(0, 150)
            const indexes = Array.isArray(m?.moduleIndexes)
                ? [...new Set(m.moduleIndexes.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < n))].sort((a, b) => a - b)
                : []
            if (!title || indexes.length === 0) continue
            indexes.forEach((i) => covered.add(i))
            valid.push({ title, goal: String(m?.goal || "").trim().slice(0, 400), moduleIndexes: indexes })
        }
    }

    let milestones = valid
    if (valid.length < 2 || covered.size !== n) {
        const groups = Math.min(4, Math.max(1, Math.ceil(n / 3)))
        const size = Math.ceil(n / groups)
        milestones = []
        for (let g = 0; g < groups; g++) {
            const indexes = []
            for (let i = g * size; i < Math.min(n, (g + 1) * size); i++) indexes.push(i)
            if (!indexes.length) continue
            const first = modules[indexes[0]].title
            const last = modules[indexes.at(-1)].title
            milestones.push({
                title: indexes.length === 1 ? first : `${first} → ${last}`,
                goal: `Complete: ${indexes.map((i) => modules[i].title).join(", ")}`.slice(0, 400),
                moduleIndexes: indexes,
            })
        }
    }

    return milestones
        .map((m) => {
            const lastIndex = m.moduleIndexes.at(-1)
            const lastModule = modules[lastIndex]
            return {
                ...m,
                targetWeek: lastModule?.endWeek ?? null,
                targetDate: lastModule?.endDate ?? null,
            }
        })
        .sort((a, b) => a.moduleIndexes.at(-1) - b.moduleIndexes.at(-1))
}

export const refreshMilestoneTargets = (milestones = [], modules = []) =>
    milestones.map((m) => {
        const lastModule = modules[m.moduleIndexes?.at(-1)]
        return {
            ...m,
            targetWeek: lastModule?.endWeek ?? m.targetWeek ?? null,
            targetDate: lastModule?.endDate ?? m.targetDate ?? null,
        }
    })

/** Progress by hours completed, compared with where the schedule expects you to be. */
export const computeProgress = (roadmap, now = new Date()) => {
    const modules = roadmap.modules || []
    const total = modules.length
    const completedModules = modules.filter((m) => m.status === "completed").length
    const weights = modules.map((m) => (Number(m.estimatedHours) > 0 ? Number(m.estimatedHours) : 1))
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1
    const doneWeight = modules.reduce((sum, m, i) => sum + (m.status === "completed" ? weights[i] : 0), 0)
    const percent = total ? Math.round((doneWeight / totalWeight) * 100) : 0

    let expectedPercent = null
    let status = completedModules === total && total > 0 ? "completed" : completedModules === 0 && !modules.some((m) => m.status === "in-progress") ? "not-started" : "in-progress"

    if (roadmap.startDate && roadmap.endDate && status !== "completed") {
        const start = new Date(roadmap.startDate).getTime()
        const end = new Date(roadmap.endDate).getTime()
        const t = now.getTime()
        if (end > start) {
            const expectedWeight = modules.reduce((sum, m, i) => {
                if (!m.startDate || !m.endDate) return sum
                const s = new Date(m.startDate).getTime()
                const e = new Date(m.endDate).getTime()
                if (t >= e) return sum + weights[i]
                if (t <= s) return sum
                return sum + weights[i] * ((t - s) / (e - s))
            }, 0)
            expectedPercent = Math.round((expectedWeight / totalWeight) * 100)
            if (t >= start) {
                if (percent >= expectedPercent + 10) status = "ahead"
                else if (percent + 10 < expectedPercent) status = "behind"
                else status = "on-track"
            }
        }
    }

    return { completedModules, totalModules: total, percent, expectedPercent, status }
}

/**
 * Re-plan the incomplete modules from today until the end date (or a new
 * length), keeping completed modules untouched.
 */
export const rescheduleRemaining = (roadmap, { hoursPerWeek, endDate, now = new Date() }) => {
    const today = startOfDay(now)
    const end = endDate ? startOfDay(endDate) : roadmap.endDate ? startOfDay(roadmap.endDate) : null
    if (!end) throw new DurationError("An end date is required to reschedule this roadmap")
    const remainingWeeks = (end.getTime() - today.getTime()) / WEEK_MS
    if (remainingWeeks < 1) throw new DurationError("The end date must be at least one week from today")
    if (remainingWeeks > MAX_WEEKS) throw new DurationError("The end date is too far in the future")

    const pace = hoursPerWeek ?? roadmap.hoursPerWeek ?? DEFAULT_HOURS_PER_WEEK
    const start = roadmap.startDate ? startOfDay(roadmap.startDate) : today
    const offsetWeeks = Math.max(0, (today.getTime() - start.getTime()) / WEEK_MS)

    const modules = roadmap.modules.map((m) => ({ ...m }))
    const pendingIdx = modules.map((m, i) => (m.status === "completed" ? -1 : i)).filter((i) => i >= 0)
    if (pendingIdx.length === 0) throw new DurationError("All modules are already completed")

    const { modules: replanned } = scheduleModules(pendingIdx.map((i) => modules[i]), {
        durationWeeks: remainingWeeks,
        hoursPerWeek: pace,
        startDate: today,
        offsetWeeks,
    })
    pendingIdx.forEach((moduleIndex, j) => {
        modules[moduleIndex] = replanned[j]
    })

    const remainingHours = pendingIdx.reduce((sum, i) => sum + (modules[i].estimatedHours || 0), 0)
    const totalWeeks = roadmap.startDate ? (end.getTime() - start.getTime()) / WEEK_MS : remainingWeeks

    return {
        modules,
        hoursPerWeek: pace,
        endDate: end,
        startDate: roadmap.startDate ? start : today,
        durationWeeks: Math.round(totalWeeks),
        feasibility: assessFeasibility({ totalHours: remainingHours, durationWeeks: remainingWeeks, hoursPerWeek: pace }),
    }
}
