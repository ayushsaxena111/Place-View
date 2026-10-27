import { useState } from 'react'
import { motion } from "motion/react";
import { FiAlertTriangle, FiCalendar, FiCheckCircle, FiClock, FiFlag, FiMap, FiTarget, FiX } from 'react-icons/fi';
import ModuleCard from './ModuleCard';

const STATUS_TEXT = {
    "not-started": { label: "Not started", tone: "text-white/60" },
    "in-progress": { label: "In progress", tone: "text-sky-300" },
    "on-track": { label: "On track", tone: "text-emerald-300" },
    ahead: { label: "Ahead of schedule", tone: "text-emerald-300" },
    behind: { label: "Behind schedule", tone: "text-amber-300" },
    completed: { label: "Completed", tone: "text-emerald-300" },
}

const FEASIBILITY_TONE = {
    comfortable: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
    realistic: "border-white/10 bg-white/5 text-white/70",
    intensive: "border-amber-400/25 bg-amber-500/10 text-amber-200",
}

const formatDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "")

function RescheduleForm({ roadmap, onReschedule, onCancel }) {
    const defaultEnd = roadmap.endDate ? new Date(roadmap.endDate).toISOString().slice(0, 10) : ""
    const [endDate, setEndDate] = useState(defaultEnd)
    const [hours, setHours] = useState(roadmap.hoursPerWeek || 10)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    const [minDate] = useState(() => new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10))

    const submit = async () => {
        setBusy(true)
        setError("")
        const res = await onReschedule({ endDate, hoursPerWeek: Number(hours) })
        if (!res?.success) setError(res?.message || "Could not reschedule.")
        else onCancel()
        setBusy(false)
    }

    return (
        <div className='relative mt-4 rounded-xl border border-white/10 bg-white/5 p-3'>
            <p className='text-xs text-white/60'>Re-plan your unfinished modules from today. Completed modules stay as they are.</p>
            <div className='mt-3 flex flex-wrap items-end gap-3'>
                <label className='text-[11px] text-white/45'>
                    Finish by
                    <input type="date" value={endDate} min={minDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className='mt-1 block rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white' />
                </label>
                <label className='text-[11px] text-white/45'>
                    Hours / week
                    <input type="number" min={2} max={60} value={hours} onChange={(e) => setHours(e.target.value)}
                        className='mt-1 block w-24 rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white' />
                </label>
                <button onClick={submit} disabled={busy || !endDate} className='rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50'>
                    {busy ? "Saving…" : "Reschedule"}
                </button>
                <button onClick={onCancel} className='text-xs text-white/50 underline'>Cancel</button>
            </div>
            {error && <p className='mt-2 text-xs text-red-300'>{error}</p>}
        </div>
    )
}

function RoadmapResult({ roadmap, onClear, onStatusChange, onReschedule, updatingIndex }) {
    const [rescheduling, setRescheduling] = useState(false)
    const progress = roadmap.progress
    const status = STATUS_TEXT[progress?.status] || STATUS_TEXT["not-started"]
    const p = roadmap.personalization || {}
    const scheduled = Boolean(roadmap.startDate && roadmap.endDate)

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}>

            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className='relative overflow-hidden bg-[#000000]/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-5 mb-5 shadow-[0_8px_32px_rgba(0,0,0,0.22)]'>
                <div className='absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-transparent pointer-events-none' />

                <div className='relative flex items-start justify-between mb-4 gap-3'>
                    <div className='min-w-0'>
                        <p className='text-xs text-white/35 tracking-widest uppercase mb-1'>Your Roadmap{roadmap.revision > 1 ? ` · v${roadmap.revision}` : ""}</p>
                        <h2 className='text-xl font-bold text-white'>{roadmap.title}</h2>
                        <p className='text-sm text-white/45 mt-0.5'>
                            Target: <span className="text-violet-400 font-medium">{roadmap.targetPackage}</span>
                            {roadmap.role && <> · {roadmap.role}</>}
                        </p>
                        {roadmap.summary && <p className='mt-2 text-xs leading-5 text-white/55'>{roadmap.summary}</p>}
                    </div>
                    <button onClick={onClear} aria-label="Close roadmap" className='text-white/30 hover:text-white/70 transition-colors mt-0.5'>
                        <FiX size={16} /></button>
                </div>

                {(p.usedInterview || p.usedResume) && (
                    <div className='relative mb-4 flex flex-wrap gap-2'>
                        {p.usedInterview && <span className='rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-200'>Based on interview{p.interviewScore !== null && p.interviewScore !== undefined ? ` (${p.interviewScore}/100)` : ""}</span>}
                        {p.usedResume && <span className='rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200'>Uses your resume</span>}
                        {p.focusAreas?.map((f) => <span key={f} className='rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/60'>{f}</span>)}
                    </div>
                )}

                <div className='relative grid grid-cols-2 md:grid-cols-4 gap-3'>
                    {[
                        { icon: FiTarget, label: "Level", value: roadmap.level },
                        { icon: FiClock, label: "Duration", value: roadmap.duration },
                        { icon: FiCheckCircle, label: "Modules", value: `${roadmap.modules.length} topics` },
                        { icon: FiCalendar, label: "Study time", value: roadmap.hoursPerWeek ? `${roadmap.hoursPerWeek} hrs/week` : "—" },
                    ].map(({ icon: Icon, label, value }) => (
                        <div key={label} className='rounded-xl p-3 bg-white/5 border border-white/8'>
                            <div className='flex items-center gap-1.5 mb-1'>
                                <Icon size={11} className="text-white/30" />
                                <span className='text-xs text-white/30'>{label}</span>
                            </div>
                            <p className='text-sm font-semibold text-white'>{value}</p>
                        </div>
                    ))}
                </div>

                {progress && (
                    <div className='relative mt-4'>
                        <div className='flex flex-wrap items-center justify-between gap-2 text-xs'>
                            <span className='text-white/60'>{progress.completedModules}/{progress.totalModules} modules · <span className='font-semibold text-white'>{progress.percent}%</span></span>
                            <span className={status.tone}>
                                {status.label}{progress.expectedPercent !== null && progress.expectedPercent !== undefined && progress.status !== "completed" ? ` · expected ${progress.expectedPercent}% by today` : ""}
                            </span>
                        </div>
                        <div className='relative mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/10'>
                            <div className='h-full rounded-full bg-emerald-400 transition-all duration-500' style={{ width: `${progress.percent}%` }} />
                            {progress.expectedPercent !== null && progress.expectedPercent !== undefined && (
                                <div className='absolute top-0 h-full w-0.5 bg-white/70' style={{ left: `${progress.expectedPercent}%` }} title="Where the schedule expects you to be" />
                            )}
                        </div>
                        {scheduled && <p className='mt-1.5 text-[11px] text-white/35'>{formatDate(roadmap.startDate)} → {formatDate(roadmap.endDate)}</p>}
                    </div>
                )}

                {roadmap.feasibility?.note && (
                    <div className={`relative mt-4 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${FEASIBILITY_TONE[roadmap.feasibility.status] || FEASIBILITY_TONE.realistic}`}>
                        {roadmap.feasibility.status === "intensive" && <FiAlertTriangle className='mt-0.5 shrink-0' />}
                        <span>{roadmap.feasibility.note}</span>
                    </div>
                )}

                {onReschedule && (rescheduling
                    ? <RescheduleForm roadmap={roadmap} onReschedule={onReschedule} onCancel={() => setRescheduling(false)} />
                    : progress?.status !== "completed" && (
                        <button onClick={() => setRescheduling(true)} className='relative mt-4 text-xs text-white/60 underline hover:text-white'>
                            {progress?.status === "behind" ? "Behind? Reschedule the remaining modules" : "Reschedule remaining modules"}
                        </button>
                    ))}
            </motion.div>

            {roadmap.milestones?.length > 0 && (
                <div className='mb-5'>
                    <p className='text-xs text-black/40 font-semibold uppercase tracking-widest mb-3 flex items-center gap-2'>
                        <FiFlag size={12} /> Milestones
                    </p>
                    <ol className='relative border-l border-black/10 ml-2 space-y-3'>
                        {roadmap.milestones.map((m, i) => {
                            const doneCount = m.moduleIndexes.filter((idx) => roadmap.modules[idx]?.status === "completed").length
                            const complete = doneCount === m.moduleIndexes.length
                            return (
                                <li key={`${m.title}-${i}`} className='ml-4'>
                                    <span className={`absolute -left-[7px] mt-1 h-3.5 w-3.5 rounded-full border-2 ${complete ? "border-emerald-500 bg-emerald-500" : "border-black/30 bg-white"}`} />
                                    <div className='flex flex-wrap items-baseline justify-between gap-2'>
                                        <p className='text-sm font-semibold text-[#0A0A0A]'>{m.title}</p>
                                        <span className='text-[11px] text-black/45'>
                                            {m.targetDate ? `by ${formatDate(m.targetDate)}` : ""} · {doneCount}/{m.moduleIndexes.length} modules
                                        </span>
                                    </div>
                                    {m.goal && <p className='text-xs text-black/55 mt-0.5'>{m.goal}</p>}
                                </li>
                            )
                        })}
                    </ol>
                </div>
            )}

            <div className='mb-4'>
                <p className='text-xs text-black/40 font-semibold uppercase tracking-widest mb-1 flex items-center gap-2'>
                    <FiMap size={12} /> Learning Modules </p>
                {onStatusChange && <p className='text-[11px] text-black/40 mb-3'>Click a module's number to mark it in progress, then completed.</p>}
                <div className='flex flex-col gap-2'>
                    {roadmap.modules.map((m, i) => (
                        <ModuleCard key={`${m.title}-${i}`} mod={m} index={i} onStatusChange={onStatusChange} updating={updatingIndex === i} />
                    ))}
                </div>
            </div>

        </motion.div>
    )
}

export default RoadmapResult
