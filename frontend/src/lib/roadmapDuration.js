// Roadmap duration options and client-side validation (mirrors the server rules).

export const DURATIONS = [
    { id: "3m", label: "3 months" },
    { id: "6m", label: "6 months" },
    { id: "1y", label: "1 year" },
    { id: "custom", label: "Custom" },
]

export const describeDuration = (preset, value, unit) => {
    if (preset !== "custom") return DURATIONS.find((d) => d.id === preset)?.label || ""
    return `${value} ${unit}`
}

export const customDurationWeeks = (value, unit) => {
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) return null
    return unit === "weeks" ? Math.round(n) : Math.round(n * 4.345)
}

/** Returns an error message, or "" when the custom duration is valid (2 weeks – 24 months). */
export const customDurationError = (value, unit) => {
    const weeks = customDurationWeeks(value, unit)
    if (weeks === null) return "Enter a duration"
    if (weeks < 2) return "At least 2 weeks"
    if (weeks > 104) return "At most 24 months"
    return ""
}
