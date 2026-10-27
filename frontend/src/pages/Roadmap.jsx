import { AnimatePresence, motion } from "motion/react"
import { FiCheck, FiChevronDown, FiClock, FiFileText, FiMic, FiSend, FiTrash2, FiX, FiZap } from 'react-icons/fi'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import { BsRocketTakeoff } from "react-icons/bs";
import { useSelector } from 'react-redux'
import RoadmapResult from '../components/roadmap/RoadmapResult'
import {
    deleteRoadmap,
    generateRoadmap,
    getAllRoadmaps,
    getRoadmap,
    rescheduleRoadmap,
    updateModuleStatus,
} from '../apis/roadmap.api'
import { getInterview } from '../apis/interview.api'
import { customDurationError, describeDuration, DURATIONS } from '../lib/roadmapDuration'

const PACKAGE_OPTIONS = ["10 LPA", "15 LPA", "20 LPA", "30 LPA", "40 LPA"];
const HOURS = [5, 10, 15, 20, 30]

function Roadmap({ setUser }) {
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const fromInterview = searchParams.get("fromInterview")
    const updateId = searchParams.get("update")
    const openId = searchParams.get("id")

    const [historyOpen, setHistoryOpen] = useState(false);
    const [roadmap, setRoadmap] = useState(null);
    const [role, setRole] = useState("");
    const [targetPackage, setTargetPackage] = useState(PACKAGE_OPTIONS[2]); // default "20 LPA"
    const [packageOpen, setPackageOpen] = useState(false);
    const [useResume, setUseResume] = useState(false);
    const [durationPreset, setDurationPreset] = useState("6m")
    const [customValue, setCustomValue] = useState(10)
    const [customUnit, setCustomUnit] = useState("weeks")
    const [hoursPerWeek, setHoursPerWeek] = useState(10)
    const [interviewSource, setInterviewSource] = useState(null)
    const [loading, setLoading] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [history, setHistory] = useState([]);
    const [error, setError] = useState("");
    const [updatingIndex, setUpdatingIndex] = useState(null)

    const { resume } = useSelector((state) => state.resume)

    const loadHistory = useCallback(async () => {
        const response = await getAllRoadmaps()
        setHistory(response?.success ? response.data : [])
        setHistoryLoading(false)
    }, [])

    useEffect(() => {
        let cancelled = false
        getAllRoadmaps().then((response) => {
            if (cancelled) return
            setHistory(response?.success ? response.data : [])
            setHistoryLoading(false)
        })
        return () => { cancelled = true }
    }, [])

    // Open a roadmap from a link (?id=...), e.g. from history or a report.
    useEffect(() => {
        if (!openId) return undefined
        let cancelled = false
        getRoadmap(openId).then((res) => {
            if (cancelled) return
            if (res?.success) setRoadmap(res.data)
            else setError(res?.message || "Roadmap not found.")
        })
        return () => { cancelled = true }
    }, [openId])

    // Coming from an interview report: prefill the role and use its results.
    useEffect(() => {
        if (!fromInterview) return undefined
        let cancelled = false
        getInterview(fromInterview).then((res) => {
            if (cancelled) return
            const interview = res?.interview
            if (res?.success && interview?.status === "completed") {
                setInterviewSource({ id: interview._id, role: interview.role, score: interview.overallScore, type: interview.type })
                setRole((prev) => prev || interview.role)
                if (resume) setUseResume(true)
            } else {
                setError(res?.message || "That interview is not available for a roadmap.")
            }
        })
        return () => { cancelled = true }
    }, [fromInterview, resume])

    const getRoadmapById = async (id) => {
        const response = await getRoadmap(id)
        if (response?.success) {
            setRoadmap(response.data)
            setSearchParams({ id }, { replace: true })
        } else {
            setError(response?.message || "Could not load the roadmap.")
        }
    }

    const customError = durationPreset === "custom" ? customDurationError(customValue, customUnit) : ""

    // Coins (20) are charged by the server and refunded if generation fails.
    const handleGenerate = async () => {
        if (!role.trim() || loading || customError) return;
        setLoading(true);
        setError("");

        const response = await generateRoadmap({
            role: role.trim(),
            targetPackage,
            useResume: useResume && Boolean(resume),
            resume: useResume ? resume : undefined,
            duration: durationPreset === "custom"
                ? { preset: "custom", value: Number(customValue), unit: customUnit }
                : { preset: durationPreset },
            hoursPerWeek,
            interviewId: interviewSource?.id,
            updateRoadmapId: updateId || undefined,
        })

        if (typeof response?.interviewCoin === "number") {
            setUser((prev) => ({ ...prev, interviewCoin: response.interviewCoin }))
        }

        if (response?.success) {
            setRoadmap(response.data)
            setSearchParams({ id: response.data._id }, { replace: true })
            setInterviewSource(null)
            loadHistory()
        } else {
            setError(response?.message || "Something went wrong while generating your roadmap. Please try again.")
        }
        setLoading(false)
    }

    const handleStatusChange = async (index, status) => {
        if (!roadmap) return
        setUpdatingIndex(index)
        const res = await updateModuleStatus(roadmap._id, index, status)
        if (res?.success) {
            setRoadmap(res.data)
            setHistory((h) => h.map((r) => (r._id === res.data._id ? res.data : r)))
        } else {
            setError(res?.message || "Could not update progress.")
        }
        setUpdatingIndex(null)
    }

    const handleReschedule = async (data) => {
        const res = await rescheduleRoadmap(roadmap._id, data)
        if (res?.success) {
            setRoadmap(res.data)
            loadHistory()
        }
        return res
    }

    const handleDelete = async (id) => {
        if (!window.confirm("Delete this roadmap? Your progress on it will be lost.")) return
        const res = await deleteRoadmap(id)
        if (res?.success) {
            setHistory((h) => h.filter((r) => r._id !== id))
            if (roadmap?._id === id) {
                setRoadmap(null)
                setSearchParams({}, { replace: true })
            }
        } else {
            setError(res?.message || "Could not delete the roadmap.")
        }
    }

    const clearRoadmap = () => {
        setRoadmap(null)
        setSearchParams({}, { replace: true })
    }

    return (
        <div className='min-h-screen bg-white text-[#0A0A0A] flex flex-col'>
            <motion.nav
                initial={{ y: -60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className='sticky top-0 z-20 border-b border-black/8 bg-white/80 backdrop-blur-xl'>
                <div className='mx-auto flex h-12 max-w-7xl items-center justify-between px-3 sm:px-5'>
                    <div onClick={() => navigate("/dashboard")}
                        className='flex cursor-pointer items-center gap-1.5'>
                        <span className='text-sm font-extrabold sm:text-base text-[#0A0A0A]'>PlaceView</span>
                        <span className='hidden rounded bg-black/5 px-1.5 py-0.5 text-[10px] text-black/50 sm:block'>Roadmap Builder</span>
                    </div>

                    <button onClick={() => setHistoryOpen(!historyOpen)} className='flex h-8 items-center justify-center gap-1  rounded-lg border border-black/15 text-black/60 transition px-2 hover:border-[#0A0A0A] hover:text-[#0A0A0A] text-[10px]'>
                        <FiClock />
                        <span className="hidden sm:inline">History</span>
                    </button>
                </div>
            </motion.nav>

            <main className='flex-1 overflow-y-auto pb-56 sm:pb-52 pt-6 sm:pt-8'>
                <div className='max-w-3xl mx-auto px-3 sm:px-4'>
                    {error && (
                        <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            <span>{error}{/coins/i.test(error) && <button onClick={() => navigate("/billing")} className='ml-2 underline'>Buy coins</button>}</span>
                            <button onClick={() => setError("")} aria-label="Dismiss"><FiX /></button>
                        </div>
                    )}
                    <AnimatePresence mode='wait'>
                        {!roadmap ? (
                            <motion.div
                                key="empty"
                                initial={{ opacity: 0, scale: 0.97 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.97 }}
                                transition={{ duration: 0.4 }}
                                className='flex flex-col items-center justify-center min-h-[50vh] text-center px-2 sm:px-4'>
                                <div className='text-4xl sm:text-5xl mb-4 sm:mb-5'>
                                    <BsRocketTakeoff className='text-gray-700' />
                                </div>

                                <h3 className='text-xl sm:text-2xl font-bold text-[#0A0A0A] mb-2'>
                                    {updateId ? "Update your roadmap" : "AI Roadmap Generator"}
                                </h3>

                                <p className='text-black/45 text-sm max-w-xs sm:max-w-md mb-1'>
                                    Pick a role, how long you have, and how many hours a week you can study.
                                </p>
                                <p className='text-black/35 text-xs sm:text-sm max-w-xs sm:max-w-md'>
                                    We'll schedule modules and milestones to fit, and track your progress.
                                </p>

                                {interviewSource && (
                                    <div className='mt-5 inline-flex items-center gap-2 rounded-full border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs text-violet-800'>
                                        <FiMic size={12} />
                                        Using your {interviewSource.type === "hr" ? "HR" : "technical"} interview for {interviewSource.role} ({interviewSource.score}/100)
                                        <button onClick={() => { setInterviewSource(null); setSearchParams({}, { replace: true }) }} aria-label="Don't use the interview" className='ml-1 text-violet-500 hover:text-violet-900'><FiX size={12} /></button>
                                    </div>
                                )}

                                <div className='mt-6 sm:mt-8 grid grid-cols-3 gap-2 sm:gap-3 w-full max-w-xs sm:max-w-sm'>
                                    {["Frontend Dev", "Backend Eng", "ML Engineer"].map((r) => (
                                        <motion.button
                                            key={r}
                                            onClick={() => setRole(r)}
                                            whileHover={{ y: -2 }}
                                            whileTap={{ scale: 0.97 }}
                                            className='relative overflow-hidden text-xs py-2 sm:py-2.5 px-2 sm:px-3 rounded-xl bg-[#000000]/90 backdrop-blur-2xl border border-white/10 text-white/55 hover:text-white hover:border-white/25 shadow-[0_4px_14px_rgba(0,0,0,0.18)] transition-all'>
                                            <span className='relative'>{r}</span>
                                        </motion.button>
                                    ))}
                                </div>
                            </motion.div>
                        ) : (
                            <RoadmapResult
                                key={roadmap._id}
                                roadmap={roadmap}
                                onClear={clearRoadmap}
                                onStatusChange={handleStatusChange}
                                onReschedule={handleReschedule}
                                updatingIndex={updatingIndex}
                            />
                        )}
                    </AnimatePresence>
                </div>
            </main>

            {/* Generator controls */}
            <div className='fixed bottom-0 left-0 right-0 z-30 pb-3 sm:pb-4 pt-3 px-3 sm:px-4 bg-gradient-to-t from-white via-white/95 to-transparent'>
                <div className='max-w-3xl mx-auto'>
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className='rounded-xl sm:rounded-2xl bg-[#000000]/90 backdrop-blur-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-1.5 sm:p-2'>

                        {/* Duration and study time */}
                        <div className='flex flex-wrap items-center gap-1.5 px-1 pb-2 border-b border-white/10'>
                            <span className='text-[10px] uppercase tracking-widest text-white/35 mr-1'>Duration</span>
                            <div role="radiogroup" aria-label="Roadmap duration" className='flex flex-wrap gap-1'>
                                {DURATIONS.map((d) => (
                                    <button key={d.id}
                                        role="radio"
                                        aria-checked={durationPreset === d.id}
                                        onClick={() => setDurationPreset(d.id)}
                                        className={`rounded-lg px-2.5 py-1 text-xs transition ${durationPreset === d.id ? "bg-white text-black font-semibold" : "text-white/55 hover:text-white bg-white/5"}`}>
                                        {d.label}
                                    </button>
                                ))}
                            </div>
                            {durationPreset === "custom" && (
                                <div className='flex items-center gap-1'>
                                    <label htmlFor="custom-duration" className='sr-only'>Custom duration</label>
                                    <input id="custom-duration" type="number" min={1} max={104} value={customValue}
                                        onChange={(e) => setCustomValue(e.target.value)}
                                        className='w-14 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs text-white outline-none' />
                                    <select value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} aria-label="Custom duration unit"
                                        className='rounded-lg border border-white/15 bg-[#111] px-1.5 py-1 text-xs text-white outline-none'>
                                        <option value="weeks">weeks</option>
                                        <option value="months">months</option>
                                    </select>
                                    {customError && <span className='text-[10px] text-red-300'>{customError}</span>}
                                </div>
                            )}
                            <div className='ml-auto flex items-center gap-1'>
                                <label htmlFor="hours" className='text-[10px] uppercase tracking-widest text-white/35'>Hrs/week</label>
                                <select id="hours" value={hoursPerWeek} onChange={(e) => setHoursPerWeek(Number(e.target.value))}
                                    className='rounded-lg border border-white/15 bg-[#111] px-1.5 py-1 text-xs text-white outline-none'>
                                    {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className='relative overflow-visible flex items-center gap-1.5 sm:gap-2 pt-2'>
                            <input
                                type='text'
                                placeholder='Backend Developer'
                                aria-label="Target role"
                                onChange={(e) => setRole(e.target.value)}
                                value={role}
                                className='relative flex-1 min-w-0 bg-transparent text-xs sm:text-sm text-white placeholder-white/30 outline-none px-2 py-1.5' />

                            <div className='relative'>
                                <motion.button
                                    type='button'
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => setPackageOpen(!packageOpen)}
                                    aria-label="Target package"
                                    className='relative flex items-center gap-1 text-xs px-2.5 py-2 rounded-xl border border-white/10 text-white/60 hover:text-white/90 hover:border-white/20 transition-all whitespace-nowrap bg-white/5'>
                                    {targetPackage}
                                    <FiChevronDown size={11} className={`transition-transform ${packageOpen ? "rotate-180" : ""}`} />
                                </motion.button>

                                <AnimatePresence>
                                    {packageOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 6, scale: 0.97 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 6, scale: 0.97 }}
                                            transition={{ duration: 0.15 }}
                                            className='absolute bottom-full mb-4 right-0 w-28 rounded-xl overflow-hidden border border-white/10 bg-[#0A0A0A] shadow-[0_8px_24px_rgba(0,0,0,0.35)] z-10 '>
                                            {PACKAGE_OPTIONS.map((pkg) => (
                                                <button key={pkg}
                                                    onClick={() => {
                                                        setTargetPackage(pkg);
                                                        setPackageOpen(false)
                                                    }}
                                                    className={`w-full text-left text-xs px-3 py-2 transition-colors ${pkg === targetPackage
                                                        ? "bg-white/10 text-white"
                                                        : "text-white/55 hover:bg-white/5 hover:text-white/90"
                                                        }`}>
                                                    {pkg}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                type='button'
                                disabled={!resume}
                                title={resume ? "Personalise with your uploaded resume" : "Upload a resume in Resume Scorer to use it here"}
                                onClick={() => setUseResume(!useResume)}
                                className={`flex items-center text-xs gap-1 px-2 py-2 rounded-xl disabled:opacity-40 ${useResume && resume
                                    ? "bg-emerald-500/10 text-emerald-400"
                                    : "bg-white/5 text-white/60"
                                    }`}>
                                {useResume && resume ? <><FiCheck size={12} /> Resume</> : <><FiFileText size={12} /> Resume</>}
                            </motion.button>

                            <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                disabled={loading || !role.trim() || Boolean(customError)}
                                onClick={handleGenerate}
                                title={`${updateId ? "Update" : "Generate"} a ${describeDuration(durationPreset, customValue, customUnit)} roadmap (20 coins)`}
                                className='relative flex items-center gap-1.5 text-xs px-3 sm:px-4 py-2 rounded-xl font-semibold text-[#0A0A0A] bg-white hover:bg-white/90 shadow-[0_2px_10px_rgba(255,255,255,0.12)] transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap'>
                                {loading ? (
                                    <>
                                        <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="inline-block">
                                            <FiZap size={12} />
                                        </motion.span>
                                        <span className="hidden sm:inline">Generatingâ€¦</span>
                                    </>
                                ) : (
                                    <>
                                        <FiSend size={12} />
                                        <span className="hidden sm:inline">{updateId ? "Update" : "Generate"} Â· 20</span>
                                    </>
                                )}
                            </motion.button>
                        </div>
                    </motion.div>
                </div>
            </div>

            <AnimatePresence>
                {historyOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setHistoryOpen(false)}
                            className='fixed inset-0 z-40 bg-black/20 backdrop-blur-sm' />

                        <motion.aside
                            initial={{ x: 320 }}
                            animate={{ x: 0 }}
                            exit={{ x: 320 }}
                            transition={{ type: "spring", stiffness: 320, damping: 32 }}
                            className='fixed right-0 top-0 bottom-0 z-50 w-[280px] sm:w-[300px] max-w-[85vw] bg-white border-l border-black/8 flex flex-col overflow-y-auto shadow-[0_0_40px_rgba(0,0,0,0.1)]'>
                            <div className='flex items-center justify-between px-4 py-3 sm:py-4 border-b border-black/8 sticky top-0 bg-white/90 backdrop-blur-xl'>
                                <span className='text-sm font-semibold text-[#0A0A0A]'>Previous Roadmaps</span>
                                <button onClick={() => setHistoryOpen(false)} aria-label="Close history" className='text-black/35 hover:text-[#0A0A0A] transition-colors'><FiX size={16} /></button>
                            </div>

                            <div className='flex flex-col gap-2 p-3'>
                                {historyLoading ? (
                                    <p className="text-xs text-black/35 text-center py-6">Loadingâ€¦</p>
                                ) : history.length === 0 ? (
                                    <p className="text-xs text-black/35 text-center py-6">No roadmaps yet.</p>
                                ) : (
                                    history.map((h) => (
                                        <div key={h._id} className='relative overflow-hidden rounded-xl bg-[#000]/90 border border-white/10'>
                                            <button onClick={() => {
                                                getRoadmapById(h._id);
                                                setHistoryOpen(false)
                                            }} className='w-full text-left p-4 pr-10'>
                                                <h3 className='text-white font-semibold text-sm'>{h.title}</h3>
                                                <div className='flex justify-between items-center my-1'>
                                                    <span className='text-violet-400 text-xs'>{h.targetPackage}</span>
                                                    <p className='text-xs text-white/40'>{h.duration}</p>
                                                </div>
                                                {h.progress && (
                                                    <div className='mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10'>
                                                        <div className='h-full bg-emerald-400' style={{ width: `${h.progress.percent}%` }} />
                                                    </div>
                                                )}
                                                <p className='text-xs text-white/30 mt-1.5'>
                                                    {new Date(h.createdAt).toLocaleDateString()}{h.progress ? ` Â· ${h.progress.percent}% done` : ""}
                                                </p>
                                            </button>
                                            <button onClick={() => handleDelete(h._id)} aria-label={`Delete ${h.title}`}
                                                className='absolute top-3 right-3 text-white/30 hover:text-red-400'>
                                                <FiTrash2 size={13} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </div>
    )
}

export default Roadmap
