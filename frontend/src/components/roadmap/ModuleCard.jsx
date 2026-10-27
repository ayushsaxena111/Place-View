import { useState } from 'react';
import { AnimatePresence, motion } from "motion/react";
import { FiBookOpen, FiCheck, FiChevronDown, FiChevronUp, FiClock, FiTarget, FiYoutube } from 'react-icons/fi';

const difficultyColor = { Easy: "#34d399", Medium: "#a78bfa", Hard: "#f87171" };

const STATUS_NEXT = { "not-started": "in-progress", "in-progress": "completed", completed: "not-started" }
const STATUS_LABEL = { "not-started": "Not started", "in-progress": "In progress", completed: "Completed" }

const formatDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "")

function ModuleCard({ mod, index, onStatusChange, updating }) {
    const [open, setOpen] = useState(false);
    const status = mod.status || "not-started"
    const done = status === "completed"

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index, 10) * 0.04, duration: 0.3 }}
            className={`relative overflow-hidden bg-[#000000]/90 backdrop-blur-2xl border rounded-xl select-none shadow-[0_4px_18px_rgba(0,0,0,0.2)] transition-all ${done ? "border-emerald-400/30" : "border-white/10 hover:border-white/20"}`}>
            <div className='absolute inset-0 bg-gradient-to-br from-white/[0.07] via-transparent to-transparent pointer-events-none' />

            <div className='relative flex items-center gap-3 p-4'>
                {onStatusChange ? (
                    <button
                        onClick={() => onStatusChange(index, STATUS_NEXT[status])}
                        disabled={updating}
                        aria-label={`${mod.title}: ${STATUS_LABEL[status]}. Click to mark ${STATUS_LABEL[STATUS_NEXT[status]]}.`}
                        title={`${STATUS_LABEL[status]} — click to change`}
                        className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-sm font-bold border transition disabled:opacity-50 ${done
                            ? "bg-emerald-500 border-emerald-400 text-black"
                            : status === "in-progress"
                                ? "bg-amber-500/15 border-amber-400/50 text-amber-300"
                                : "bg-white/5 border-white/10"
                            }`}
                        style={!done && status !== "in-progress" ? { color: difficultyColor[mod.difficulty] } : undefined}>
                        {done ? <FiCheck size={15} /> : index + 1}
                    </button>
                ) : (
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold bg-white/5 border border-white/10"
                        style={{ color: difficultyColor[mod.difficulty] }}>{index + 1}</div>
                )}

                <button onClick={() => setOpen(!open)} className='flex-1 min-w-0 text-left' aria-expanded={open}>
                    <p className={`text-sm font-medium truncate ${done ? "text-white/60 line-through" : "text-white"}`}>{mod.title}</p>
                    <div className='flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5'>
                        <span className='inline-flex items-center gap-1 text-xs text-white/35'><FiClock size={10} />{mod.duration}</span>
                        {mod.startDate && <span className='text-xs text-white/30'>{formatDate(mod.startDate)} – {formatDate(mod.endDate)}</span>}
                        {status === "in-progress" && <span className='text-[10px] text-amber-300'>In progress</span>}
                    </div>
                </button>

                <button onClick={() => setOpen(!open)} className='flex items-center gap-2' aria-label={open ? "Collapse" : "Expand"}>
                    <span className="text-xs font-medium hidden sm:block" style={{ color: difficultyColor[mod.difficulty] }}>
                        {mod.difficulty}
                    </span>
                    {open ? <FiChevronUp size={14} className="text-white/30" /> : <FiChevronDown size={14} className="text-white/30" />}
                </button>
            </div>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        className='overflow-hidden'>
                        <div className='relative px-4 pb-4 pt-0 border-t border-white/8'>
                            <p className='text-xs text-white/55 mt-3 leading-relaxed'>{mod.description}</p>

                            {mod.whyIncluded && (
                                <p className='mt-2 text-xs text-violet-300/90'><span className='text-white/40'>Why: </span>{mod.whyIncluded}</p>
                            )}
                            {mod.practiceTask && (
                                <p className='mt-2 flex gap-1.5 text-xs text-white/70'><FiTarget size={12} className='mt-0.5 shrink-0 text-emerald-300' /> {mod.practiceTask}</p>
                            )}
                            {mod.skills?.length > 0 && (
                                <div className='mt-2.5 flex flex-wrap gap-1.5'>
                                    {mod.skills.map((s) => <span key={s} className='rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] text-white/60'>{s}</span>)}
                                </div>
                            )}

                            {(mod.youtube || mod.article) && (
                                <div className='flex gap-2 flex-wrap mt-3'>
                                    {mod.youtube && (
                                        <a href={mod.youtube} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-500/25 text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors">
                                            <FiYoutube size={12} /> Watch Tutorial
                                        </a>
                                    )}
                                    {mod.article && (
                                        <a href={mod.article} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/10 text-white/45 bg-white/5 hover:bg-white/10 transition-colors">
                                            <FiBookOpen size={12} /> Read Article
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}

export default ModuleCard
