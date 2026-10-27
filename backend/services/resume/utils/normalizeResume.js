// Normalise the resume analysis returned by the LLM so it always matches the
// Mongo schema, whatever shape the model actually produced.

const MAX_TEXT = 2000

export const str = (value, max = MAX_TEXT) => {
    if (value === null || value === undefined) return ""
    if (typeof value === "string") return value.trim().slice(0, max)
    if (typeof value === "number" || typeof value === "boolean") return String(value)
    return ""
}

export const strArray = (value, { maxItems = 40, maxLength = 300 } = {}) => {
    if (!Array.isArray(value)) {
        if (typeof value === "string" && value.trim()) {
            return strArray(value.split(/[,;\n]/), { maxItems, maxLength })
        }
        return []
    }
    const seen = new Set()
    const out = []
    for (const item of value) {
        const text = typeof item === "string"
            ? item.trim()
            : str(item?.name || item?.title || item?.skill || "")
        if (!text) continue
        const key = text.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(text.slice(0, maxLength))
        if (out.length >= maxItems) break
    }
    return out
}

const objArray = (value, mapper, maxItems = 20) => {
    if (!Array.isArray(value)) return []
    return value.map(mapper).filter(Boolean).slice(0, maxItems)
}

const educationItem = (item) => {
    if (typeof item === "string") return item.trim() ? { institution: "", degree: "", field: "", years: "", details: str(item) } : null
    if (!item || typeof item !== "object") return null
    return {
        institution: str(item.institution || item.school || item.college, 300),
        degree: str(item.degree, 300),
        field: str(item.field || item.major, 300),
        years: str(item.years || item.duration || item.year, 100),
        details: str(item.details || item.description || item.grade || item.cgpa),
    }
}

const projectItem = (item) => {
    if (typeof item === "string") return item.trim() ? { title: "", duration: "", description: str(item), technologies: [] } : null
    if (!item || typeof item !== "object") return null
    return {
        title: str(item.title || item.name, 300),
        duration: str(item.duration, 100),
        description: str(item.description || item.details),
        technologies: strArray(item.technologies || item.techStack || item.tech, { maxItems: 20, maxLength: 80 }),
    }
}

const experienceItem = (item) => {
    if (typeof item === "string") return item.trim() ? { company: "", role: "", duration: "", description: str(item), technologies: [] } : null
    if (!item || typeof item !== "object") return null
    return {
        company: str(item.company || item.organization, 300),
        role: str(item.role || item.title || item.position, 300),
        duration: str(item.duration || item.years, 100),
        description: str(item.description || item.details),
        technologies: strArray(item.technologies || item.techStack || item.tech, { maxItems: 20, maxLength: 80 }),
    }
}

export const clampScore = (value) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return 0
    return Math.max(0, Math.min(100, Math.round(n)))
}

export const normalizeResumeAnalysis = (raw = {}) => ({
    name: str(raw.name, 200),
    email: str(raw.email, 200),
    phone: str(raw.phone, 50),
    summary: str(raw.summary),
    skills: strArray(raw.skills, { maxItems: 60, maxLength: 80 }),
    projects: objArray(raw.projects, projectItem),
    education: objArray(raw.education, educationItem),
    experience: objArray(raw.experience, experienceItem),
    strengths: strArray(raw.strengths),
    weaknesses: strArray(raw.weaknesses),
    missingSkills: strArray(raw.missingSkills),
    suggestedRole: str(raw.suggestedRole, 200),
    score: clampScore(raw.score),
    recommendations: strArray(raw.recommendations),
})

export const ANALYSIS_FIELDS = [
    "name", "email", "phone", "summary", "skills", "projects", "education",
    "experience", "strengths", "weaknesses", "missingSkills", "suggestedRole",
    "score", "recommendations",
]

export const pickAnalysis = (doc = {}) => {
    const out = {}
    for (const field of ANALYSIS_FIELDS) out[field] = doc[field]
    return out
}
