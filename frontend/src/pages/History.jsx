import { useCallback, useEffect, useState } from 'react'
import { motion } from "motion/react"
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { FiChevronDown, FiChevronUp, FiExternalLink, FiFileText, FiMap, FiMic, FiPlay, FiStar, FiTrash2 } from 'react-icons/fi'
import { deleteInterview, getInterviewHistory } from '../apis/interview.api'
import {
    activateResumeVersion,
    deleteResumeVersion,
    getResumeFileUrl,
    getResumeHistory,
    getResumeVersion,
} from '../apis/resume.api'
import { getAllRoadmaps } from '../apis/roadmap.api'
import { setResume } from '../redux/resumeSlice'

const TABS = [
    { id: "interviews", label: "Interviews", icon: FiMic },
    { id: "resumes", label: "Resumes", icon: FiFileText },
    { id: "roadmaps", label: "Roadmaps", icon: FiMap },
]

const formatDate = (d) => (d ? new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "")
const scoreTone = (s) => (s >= 75 ? "text-emerald-600" : s >= 50 ? "text-amber-600" : "text-red-600")

const Empty = ({ children }) => <p className='rounded-xl border border-dashed border-black/15 p-8 text-center text-sm text-black/45'>{children}</p>
const ErrorNote = ({ message }) => message ? <p role="alert" className='mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700'>{message}</p> : null

function InterviewsTab() {
    const navigate = useNavigate()
    const [items, setItems] = useState([])
    const [page, setPage] = useState(1)
    const [pages, setPages] = useState(1)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")

    const load = useCallback(async (p) => {
        setLoading(true)
        const res = await getInterviewHistory({ page: p, limit: 15 })
        if (res?.success) {
            setItems((prev) => (p === 1 ? res.data : [...prev, ...res.data]))
            setPages(res.pagination?.pages || 1)
            setPage(p)
        } else {
            setError(res?.message || "Could not load interviews.")
        }
        setLoading(false)
    }, [])

    useEffect(() => {
        let cancelled = false
        getInterviewHistory({ page: 1, limit: 15 }).then((res) => {
            if (cancelled) return
            if (res?.success) {
                setItems(res.data)
                setPages(res.pagination?.pages || 1)
            } else {
                setError(res?.message || "Could not load interviews.")
            }
            setLoading(false)
        })
        return () => { cancelled = true }
    }, [])

    const remove = async (id) => {
        if (!window.confirm("Delete this interview and its report permanently?")) return
        const res = await deleteInterview(id)
        if (res?.success) setItems((list) => list.filter((i) => i._id !== id))
        else setError(res?.message || "Could not delete the interview.")
    }

    if (!loading && items.length === 0 && !error) {
        return <Empty>No interviews yet. <button onClick={() => navigate("/interview")} className='underline'>Start one</button>.</Empty>
    }

    return (
        <div>
            <ErrorNote message={error} />
            <div className='space-y-2.5'>
                {items.map((item) => {
                    const done = item.status === "completed"
                    return (
                        <div key={item._id} className='flex flex-wrap items-center gap-3 rounded-xl border border-black/10 bg-white p-4 shadow-sm'>
                            <div className='min-w-0 flex-1'>
                                <div className='flex flex-wrap items-center gap-2'>
                                    <p className='font-semibold text-sm text-[#0A0A0A]'>{item.role}</p>
                                    <span className='rounded-full bg-black/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-black/60'>{item.type === "hr" ? "HR" : "Technical"}</span>
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{done ? "Completed" : "In progress"}</span>
                                    {item.adaptive && <span className='rounded-full bg-violet-50 px-2 py-0.5 text-[10px] text-violet-700'>Adaptive</span>}
                                </div>
                                <p className='mt-1 text-xs text-black/45'>
                                    {formatDate(item.createdAt)} Â· {item.answeredQuestions}/{item.totalQuestions} answered
                                    {item.followUps ? ` Â· ${item.followUps} follow-up${item.followUps > 1 ? "s" : ""}` : ""}
                                    {" Â· "}{["verbal", "written", "coding"].filter((t) => item.questionTypes?.[t]).map((t) => `${item.questionTypes[t]} ${t}`).join(", ")}
                                </p>
                            </div>
                            {done && <p className={`text-xl font-bold ${scoreTone(item.overallScore)}`}>{item.overallScore}<span className='text-xs text-black/35'>/100</span></p>}
                            <div className='flex items-center gap-2'>
                                {done ? (
                                    <button onClick={() => navigate(`/interview/${item._id}/report`)} className='rounded-lg bg-black px-3 py-1.5 text-xs text-white'>View report</button>
                                ) : (
                                    <button onClick={() => navigate(`/interview/${item._id}`)} className='inline-flex items-center gap-1 rounded-lg bg-black px-3 py-1.5 text-xs text-white'><FiPlay size={11} /> Continue</button>
                                )}
                                <button onClick={() => remove(item._id)} aria-label="Delete interview" className='rounded-lg border border-black/10 p-1.5 text-black/40 hover:text-red-600'><FiTrash2 size={13} /></button>
                            </div>
                        </div>
                    )
                })}
            </div>
            {loading && <p className='py-4 text-center text-xs text-black/40'>Loadingâ€¦</p>}
            {!loading && page < pages && (
                <button onClick={() => load(page + 1)} className='mt-4 w-full rounded-lg border border-black/15 py-2 text-xs text-black/70'>Load more</button>
            )}
        </div>
    )
}

const Section = ({ title, items }) => items?.length ? (
    <div>
        <p className='text-[11px] font-semibold uppercase tracking-wide text-black/40'>{title}</p>
        <ul className='mt-1 space-y-0.5 text-xs text-black/70'>{items.map((i) => <li key={i}>â€¢ {i}</li>)}</ul>
    </div>
) : null

function ResumeDetails({ id }) {
    const [data, setData] = useState(null)
    const [error, setError] = useState("")

    useEffect(() => {
        let cancelled = false
        getResumeVersion(id).then((res) => {
            if (cancelled) return
            if (res?.success) setData(res.data)
            else setError(res?.message || "Could not load this resume.")
        })
        return () => { cancelled = true }
    }, [id])

    if (error) return <p className='mt-3 text-xs text-red-600'>{error}</p>
    if (!data) return <p className='mt-3 text-xs text-black/40'>Loading analysisâ€¦</p>

    return (
        <div className='mt-3 grid gap-3 border-t border-black/8 pt-3 sm:grid-cols-2'>
            {data.summary && <p className='sm:col-span-2 text-xs text-black/70'>{data.summary}</p>}
            {data.skills?.length > 0 && (
                <div className='sm:col-span-2 flex flex-wrap gap-1.5'>
                    {data.skills.map((s) => <span key={s} className='rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-black/70'>{s}</span>)}
                </div>
            )}
            <Section title="Strengths" items={data.strengths} />
            <Section title="Weaknesses" items={data.weaknesses} />
            <Section title="Missing skills" items={data.missingSkills} />
            <Section title="Recommendations" items={data.recommendations} />
        </div>
    )
}

function ResumesTab() {
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [openId, setOpenId] = useState(null)
    const [busyId, setBusyId] = useState(null)

    const reload = useCallback(async () => {
        const res = await getResumeHistory()
        if (res?.success) setItems(res.data)
        else setError(res?.message || "Could not load resumes.")
        setLoading(false)
    }, [])

    useEffect(() => {
        let cancelled = false
        getResumeHistory().then((res) => {
            if (cancelled) return
            if (res?.success) setItems(res.data)
            else setError(res?.message || "Could not load resumes.")
            setLoading(false)
        })
        return () => { cancelled = true }
    }, [])

    const openPdf = async (id) => {
        // Open the tab synchronously so popup blockers allow it.
        const win = window.open("", "_blank")
        const res = await getResumeFileUrl(id)
        if (!res.success) {
            win?.close()
            setError(res.message)
            return
        }
        if (win) win.location.href = res.url
        else {
            const a = document.createElement("a")
            a.href = res.url
            a.download = "resume.pdf"
            a.click()
        }
        setTimeout(() => URL.revokeObjectURL(res.url), 60000)
    }

    const activate = async (id) => {
        setBusyId(id)
        const res = await activateResumeVersion(id)
        if (res?.success) {
            dispatch(setResume(res.data))
            setItems((list) => list.map((i) => ({ ...i, isActive: i._id === id })))
        } else {
            setError(res?.message || "Could not switch resume.")
        }
        setBusyId(null)
    }

    const remove = async (id) => {
        if (!window.confirm("Delete this resume and its analysis permanently?")) return
        setBusyId(id)
        const res = await deleteResumeVersion(id)
        if (res?.success) {
            dispatch(setResume(res.activeResume || null))
            await reload()
        } else {
            setError(res?.message || "Could not delete this resume.")
        }
        setBusyId(null)
    }

    if (!loading && items.length === 0 && !error) {
        return <Empty>No resumes uploaded yet. <button onClick={() => navigate("/scorer")} className='underline'>Upload one</button>.</Empty>
    }

    return (
        <div>
            <ErrorNote message={error} />
            {loading && <p className='py-4 text-center text-xs text-black/40'>Loadingâ€¦</p>}
            <div className='space-y-2.5'>
                {items.map((item) => (
                    <div key={item._id} className={`rounded-xl border bg-white p-4 shadow-sm ${item.isActive ? "border-emerald-300" : "border-black/10"}`}>
                        <div className='flex flex-wrap items-center gap-3'>
                            <FiFileText className='text-black/40' />
                            <div className='min-w-0 flex-1'>
                                <div className='flex flex-wrap items-center gap-2'>
                                    <p className='truncate font-semibold text-sm text-[#0A0A0A]'>{item.fileName}</p>
                                    {item.isActive && <span className='rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700'>Current</span>}
                                </div>
                                <p className='mt-0.5 text-xs text-black/45'>
                                    {formatDate(item.createdAt)}{item.suggestedRole ? ` Â· ${item.suggestedRole}` : ""}{item.fileSize ? ` Â· ${Math.round(item.fileSize / 1024)} KB` : ""}
                                </p>
                            </div>
                            <p className={`text-lg font-bold ${scoreTone(item.score)}`}>{item.score}<span className='text-xs text-black/35'>/100</span></p>
                            <div className='flex flex-wrap items-center gap-2'>
                                <button onClick={() => setOpenId(openId === item._id ? null : item._id)} className='inline-flex items-center gap-1 rounded-lg border border-black/15 px-2.5 py-1.5 text-xs'>
                                    {openId === item._id ? <FiChevronUp size={12} /> : <FiChevronDown size={12} />} Analysis
                                </button>
                                {item.hasFile && (
                                    <button onClick={() => openPdf(item._id)} className='inline-flex items-center gap-1 rounded-lg border border-black/15 px-2.5 py-1.5 text-xs'>
                                        <FiExternalLink size={12} /> PDF
                                    </button>
                                )}
                                {!item.isActive && (
                                    <button onClick={() => activate(item._id)} disabled={busyId === item._id} className='inline-flex items-center gap-1 rounded-lg bg-black px-2.5 py-1.5 text-xs text-white disabled:opacity-50'>
                                        <FiStar size={12} /> Use this resume
                                    </button>
                                )}
                                <button onClick={() => remove(item._id)} disabled={busyId === item._id} aria-label="Delete resume" className='rounded-lg border border-black/10 p-1.5 text-black/40 hover:text-red-600 disabled:opacity-50'><FiTrash2 size={13} /></button>
                            </div>
                        </div>
                        {!item.hasFile && <p className='mt-2 text-[11px] text-black/40'>Uploaded before resume history was added â€” the original PDF wasn't kept.</p>}
                        {openId === item._id && <ResumeDetails id={item._id} />}
                    </div>
                ))}
            </div>
        </div>
    )
}

function RoadmapsTab() {
    const navigate = useNavigate()
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")

    useEffect(() => {
        let cancelled = false
        getAllRoadmaps().then((res) => {
            if (cancelled) return
            if (res?.success) setItems(res.data)
            else setError(res?.message || "Could not load roadmaps.")
            setLoading(false)
        })
        return () => { cancelled = true }
    }, [])

    if (!loading && items.length === 0 && !error) {
        return <Empty>No roadmaps yet. <button onClick={() => navigate("/roadmap")} className='underline'>Create one</button>.</Empty>
    }

    return (
        <div>
            <ErrorNote message={error} />
            {loading && <p className='py-4 text-center text-xs text-black/40'>Loadingâ€¦</p>}
            <div className='space-y-2.5'>
                {items.map((r) => (
                    <button key={r._id} onClick={() => navigate(`/roadmap?id=${r._id}`)} className='w-full rounded-xl border border-black/10 bg-white p-4 text-left shadow-sm hover:border-black/30'>
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                            <p className='font-semibold text-sm text-[#0A0A0A]'>{r.title}</p>
                            <span className='text-xs text-black/45'>{r.duration} Â· {r.targetPackage}</span>
                        </div>
                        <div className='mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/10'>
                            <div className='h-full rounded-full bg-emerald-500' style={{ width: `${r.progress?.percent || 0}%` }} />
                        </div>
                        <p className='mt-1.5 text-[11px] text-black/45'>
                            {r.progress?.completedModules || 0}/{r.modules?.length || 0} modules Â· {r.progress?.percent || 0}% Â· created {formatDate(r.createdAt)}
                            {r.personalization?.usedInterview ? " Â· from interview" : ""}
                        </p>
                    </button>
                ))}
            </div>
        </div>
    )
}

function History() {
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const tab = TABS.some((t) => t.id === searchParams.get("tab")) ? searchParams.get("tab") : "interviews"

    return (
        <div className='min-h-screen bg-white text-[#0A0A0A]'>
            <motion.nav
                initial={{ y: -60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className='sticky top-0 z-20 border-b border-black/8 bg-white/80 backdrop-blur-xl'>
                <div className='mx-auto flex h-12 max-w-7xl items-center px-3 sm:px-5'>
                    <div onClick={() => navigate("/dashboard")} className='flex cursor-pointer items-center gap-1.5'>
                        <span className='text-sm font-extrabold sm:text-base text-[#0A0A0A]'>PlaceView</span>
                        <span className='hidden rounded bg-black/5 px-1.5 py-0.5 text-[10px] text-black/50 sm:block'>History</span>
                    </div>
                </div>
            </motion.nav>

            <div className='mx-auto max-w-4xl px-3 sm:px-4 py-6'>
                <h1 className='text-2xl font-bold'>Your history</h1>
                <p className='mt-1 text-sm text-black/45'>Revisit past interviews, resumes and roadmaps. Only you can see these.</p>

                <div role="tablist" aria-label="History sections" className='mt-5 mb-4 flex gap-1 rounded-xl bg-black/5 p-1'>
                    {TABS.map(({ id, label, icon: Icon }) => (
                        <button key={id}
                            role="tab"
                            aria-selected={tab === id}
                            onClick={() => setSearchParams({ tab: id })}
                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition ${tab === id ? "bg-black text-white" : "text-black/55 hover:text-black"}`}>
                            <Icon size={13} /> {label}
                        </button>
                    ))}
                </div>

                {tab === "interviews" && <InterviewsTab />}
                {tab === "resumes" && <ResumesTab />}
                {tab === "roadmaps" && <RoadmapsTab />}
            </div>
        </div>
    )
}

export default History
