import { useEffect, useRef, useState } from 'react'
import { motion } from "motion/react"
import {
  FiAlertTriangle, FiArrowLeft, FiAward, FiCheck, FiCornerDownRight, FiCpu, FiHash, FiMap, FiMic,
  FiRefreshCw, FiTarget, FiTrendingUp, FiX,
} from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import DownloadBtn from '../resume/DownloadBtn'
import QuestionTypeBadge from './QuestionTypeBadge'
import { regenerateSummary } from '../../apis/interview.api'
import { getRoadmapByInterview } from '../../apis/roadmap.api'

const card = 'rounded-2xl bg-[#17181E] border border-white/10 p-6'
const DIFF_COLOR = { easy: "bg-emerald-400", medium: "bg-amber-400", hard: "bg-red-400" }
const DIFF_HEIGHT = { easy: "h-3", medium: "h-6", hard: "h-9" }

const List = ({ items, empty, tone = "white", numbered = false }) => {
  if (!items?.length) return <p className="text-zinc-500 text-sm">{empty}</p>
  const tones = {
    green: "bg-green-500/5 border-green-500/10",
    red: "bg-red-500/5 border-red-500/10",
    white: "bg-white/[0.03] border-white/10",
  }
  return (
    <div className='space-y-2.5'>
      {items.map((text, i) => (
        <div key={`${i}-${text}`} className={`flex items-start gap-3 rounded-xl border p-3.5 ${tones[tone]}`}>
          {numbered && <div className='w-6 h-6 rounded-full bg-white text-black flex items-center justify-center font-semibold flex-shrink-0 text-xs'>{i + 1}</div>}
          {tone === "green" && <FiCheck className='mt-1 shrink-0 text-green-400' size={14} />}
          {tone === "red" && <span className='mt-0.5 shrink-0 text-red-400 font-bold'>!</span>}
          <p className='text-sm text-zinc-300 leading-6'>{text}</p>
        </div>
      ))}
    </div>
  )
}

const Chips = ({ items, empty }) =>
  items?.length ? (
    <div className='flex flex-wrap gap-2'>
      {items.map((k) => (
        <span key={k} className='rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200'>{k}</span>
      ))}
    </div>
  ) : <p className="text-zinc-500 text-sm">{empty}</p>

const Metric = ({ label, value, sub }) => (
  <div className='rounded-xl bg-black/25 p-3.5'>
    <p className='text-xs text-zinc-500'>{label}</p>
    <p className='mt-1.5 text-xl font-bold text-white'>{value}</p>
    {sub && <p className='mt-0.5 text-[11px] text-zinc-500'>{sub}</p>}
  </div>
)

const isCodeAnswer = (q) => q.questionType === "coding" || /--- Code/.test(q.userAnswer || "")

function QuestionCard({ item, index, questions }) {
  const f = item.feedback || {}
  const parentNumber = item.isFollowUp && typeof item.followUpOf === "number"
    ? questions.slice(0, item.followUpOf + 1).filter((q) => !q.isFollowUp).length
    : null
  const m = item.speechMetrics
  const fillers = m?.fillers ? Object.entries(m.fillers) : []

  return (
    <div className={card}>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-[11px] uppercase tracking-widest text-zinc-500'>
          {item.isFollowUp ? `Follow-up to Q${parentNumber}` : `Question ${questions.slice(0, index + 1).filter((q) => !q.isFollowUp).length}`}
        </span>
        <QuestionTypeBadge type={item.questionType} size="sm" />
        <span className='rounded-full border border-white/10 px-2 py-0.5 text-[10px] capitalize text-zinc-400'>{item.difficulty}</span>
        {item.isFollowUp && <FiCornerDownRight className='text-fuchsia-300' size={12} />}
        {item.topic && <span className='text-[11px] text-zinc-500'>{item.topic}</span>}
        {f.verdict && <span className='ml-auto text-[11px] font-semibold capitalize text-zinc-300'>{f.verdict.replace("-", " ")}</span>}
      </div>
      <h4 className='mt-2.5 text-base font-semibold text-white leading-7 whitespace-pre-wrap'>{item.question}</h4>
      {item.difficultyReason && <p className='mt-1 text-[11px] text-zinc-500'>{item.difficultyReason}</p>}

      <div className='mt-5'>
        <p className='text-[11px] uppercase tracking-widest text-zinc-500'>
          Your Answer{item.codeLanguage ? ` (${item.codeLanguage})` : ""}{item.answerMode === "voice" ? " — transcribed from speech" : ""}
        </p>
        {isCodeAnswer(item) ? (
          <pre className='mt-2.5 max-h-80 overflow-auto rounded-lg bg-black/40 p-3 text-xs leading-5 text-zinc-200 whitespace-pre-wrap'>{item.userAnswer || "No answer submitted"}</pre>
        ) : (
          <p className='mt-2.5 text-sm leading-6 text-zinc-300 whitespace-pre-wrap'>{item.userAnswer || "No answer submitted"}</p>
        )}
      </div>

      <div className='grid grid-cols-2 md:grid-cols-5 gap-3 mt-5'>
        <Metric label="Score" value={f.score ?? 0} />
        <Metric label="Correctness" value={f.correctness ?? 0} />
        <Metric label="Clarity" value={f.clarity ?? 0} />
        <Metric label="Relevance" value={f.relevance ?? 0} />
        <Metric label="Communication" value={f.communication ?? 0} />
      </div>

      <div className='mt-5 rounded-xl border border-green-500/20 bg-green-500/5 p-4'>
        <p className='text-[11px] uppercase tracking-widest text-green-400'>AI Feedback</p>
        <p className='mt-2 text-sm leading-6 text-zinc-300'>{f.feedback || "No feedback available."}</p>
      </div>

      {(f.whatWasCorrect?.length > 0 || f.whatWasMissing?.length > 0) && (
        <div className='mt-5 grid md:grid-cols-2 gap-4'>
          <div>
            <h5 className="text-sm font-semibold text-white">What you got right</h5>
            <div className='mt-2.5'><List items={f.whatWasCorrect} tone="green" empty="Nothing in this answer was correct yet." /></div>
          </div>
          <div>
            <h5 className="text-sm font-semibold text-white">What was missing</h5>
            <div className='mt-2.5'><List items={f.whatWasMissing} tone="red" empty="Nothing important was missing." /></div>
          </div>
        </div>
      )}

      {(f.howToImprove?.length > 0 || f.improvements?.length > 0) && (
        <div className='mt-5'>
          <h5 className="text-sm font-semibold text-white">How to improve</h5>
          <div className='mt-2.5'><List items={f.howToImprove?.length ? f.howToImprove : f.improvements} empty="" /></div>
        </div>
      )}

      {(f.keyConceptsCovered?.length > 0 || f.keyConceptsMissed?.length > 0) && (
        <div className='mt-5 grid md:grid-cols-2 gap-4 text-xs'>
          {f.keyConceptsCovered?.length > 0 && <div><p className='mb-2 text-zinc-500'>Concepts you used</p><Chips items={f.keyConceptsCovered} /></div>}
          {f.keyConceptsMissed?.length > 0 && <div><p className='mb-2 text-zinc-500'>Concepts to add</p><Chips items={f.keyConceptsMissed} /></div>}
        </div>
      )}

      {f.modelAnswer && (
        <details className='mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 group'>
          <summary className='cursor-pointer text-sm font-semibold text-white'>Model answer</summary>
          <pre className='mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-zinc-300'>{f.modelAnswer}</pre>
        </details>
      )}

      {m?.wordCount > 0 && (
        <p className='mt-4 text-[11px] text-zinc-500'>
          Spoken: {m.wordCount} words{m.wordsPerMinute ? ` · ${m.wordsPerMinute} wpm` : ""} · {m.fillerCount} filler word{m.fillerCount === 1 ? "" : "s"}
          {fillers.length > 0 && ` (${fillers.map(([k, v]) => `${k} ×${v}`).join(", ")})`}
          {m.vadAvailable && ` · ${m.longPauseCount} long pause${m.longPauseCount === 1 ? "" : "s"}`}
        </p>
      )}
    </div>
  )
}

function CommunicationCard({ communication }) {
  if (!communication) return null
  if (!communication.available) {
    return (
      <div className={card}>
        <div className='flex items-center gap-2.5'><FiMic className='text-white' /><h3 className="text-lg font-semibold text-white">Verbal Communication</h3></div>
        <p className='mt-3 text-sm text-zinc-400'>{communication.reason || "Not enough spoken answers to analyse."}</p>
        {communication.feedback && <p className='mt-2 text-sm text-zinc-400'>{communication.feedback}</p>}
      </div>
    )
  }
  const fillers = Object.entries(communication.fillers || {}).sort((a, b) => b[1] - a[1])
  return (
    <div className={card}>
      <div className='flex items-center gap-2.5'><FiMic className='text-white' /><h3 className="text-lg font-semibold text-white">Verbal Communication</h3></div>
      <p className='mt-1 text-xs text-zinc-500'>Based on {communication.questionsAnalyzed} spoken answer{communication.questionsAnalyzed === 1 ? "" : "s"}.</p>
      <div className='grid grid-cols-2 md:grid-cols-4 gap-3 mt-4'>
        <Metric label="Speaking pace" value={communication.wordsPerMinute ? `${communication.wordsPerMinute} wpm` : "—"} sub={communication.paceLabel} />
        <Metric label="Filler words" value={communication.fillerCount} sub={`${communication.fillersPer100Words} per 100 words`} />
        <Metric label="Long pauses (>2.5s)" value={communication.pauseDataAvailable ? communication.longPauseCount : "—"} sub={communication.pauseDataAvailable ? `longest ${communication.longestPauseSec}s` : "not measured"} />
        <Metric label="Clarity (AI-rated)" value={communication.clarityScore ? `${communication.clarityScore}/100` : "—"} />
      </div>
      {fillers.length > 0 && (
        <div className='mt-4 flex flex-wrap gap-2'>
          {fillers.map(([word, n]) => (
            <span key={word} className='rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-200'>"{word}" × {n}</span>
          ))}
        </div>
      )}
      {(communication.notes?.length > 0 || communication.feedback) && (
        <ul className='mt-4 space-y-1.5 text-sm text-zinc-300'>
          {communication.notes?.map((n) => <li key={n}>• {n}</li>)}
          {communication.feedback && <li>• {communication.feedback}</li>}
        </ul>
      )}
      {communication.caveat && <p className='mt-3 text-[11px] text-zinc-500'>{communication.caveat}</p>}
    </div>
  )
}

function RoadmapCta({ report }) {
  const navigate = useNavigate()
  const { resume } = useSelector((state) => state.resume)
  const [existing, setExisting] = useState(undefined)

  useEffect(() => {
    let cancelled = false
    getRoadmapByInterview(report._id).then((res) => {
      if (!cancelled) setExisting(res?.success ? res.data : null)
    })
    return () => { cancelled = true }
  }, [report._id])

  const generateUrl = `/roadmap?fromInterview=${report._id}${existing ? `&update=${existing._id}` : ""}`

  return (
    <div className='rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-500/15 to-transparent bg-[#17181E] p-6'>
      <div className='flex items-center gap-2.5'><FiMap className='text-violet-300' /><h3 className="text-lg font-semibold text-white">Personalized Roadmap</h3></div>
      <p className='mt-2 text-sm text-zinc-400'>
        Build a study plan from this interview's weak areas{resume ? " and your uploaded resume" : ""}. You'll choose the duration on the next screen.
      </p>
      <div className='mt-4 flex flex-wrap gap-2'>
        <button
          onClick={() => navigate(generateUrl)}
          disabled={existing === undefined}
          className='rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-50'>
          {existing ? "Update roadmap" : "Generate personalized roadmap"} <span className='font-normal text-black/50'>(20 coins)</span>
        </button>
        {existing && (
          <button onClick={() => navigate(`/roadmap?id=${existing._id}`)} className='rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:border-white/30'>
            View roadmap ({existing.progress?.percent ?? 0}% done)
          </button>
        )}
      </div>
    </div>
  )
}

function Step3report({ report, user, setUser, onReportChange }) {
  const navigate = useNavigate()
  const reportRef = useRef(null)
  const [regenerating, setRegenerating] = useState(false)
  const [regenError, setRegenError] = useState("")

  const questions = report.questions || []
  const answered = questions.filter((q) => q.answered || q.userAnswer)
  const followUps = questions.filter((q) => q.isFollowUp).length
  const summaryFailed = report.summaryStatus === "failed"

  const retrySummary = async () => {
    setRegenerating(true)
    setRegenError("")
    const res = await regenerateSummary(report._id)
    if (res?.interview) onReportChange?.(res.interview)
    if (!res?.success) setRegenError(res?.message || "Could not generate the summary.")
    setRegenerating(false)
  }

  return (
    <div className='min-h-screen bg-white flex items-center justify-center md:p-5'>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-5xl rounded-[24px] bg-gray-100 border border-white/10 overflow-hidden">
        <div className='border-b border-black/10 px-6 sm:px-8 py-6 flex items-center justify-between gap-4'>
          <div>
            <div onClick={() => navigate("/dashboard")} className='inline-flex items-center gap-2 text-white rounded-full border border-black/20 bg-black px-3 py-1.5 cursor-pointer'>
              <FiArrowLeft size={14} />
              <span className='text-xs text-zinc-100'>Back</span>
            </div>
            <h1 className='text-2xl font-bold text-black mt-2'>Interview Report</h1>
            <p className='text-xs mb-2 text-zinc-500 mt-1.5'>
              {report.role} · <span className='capitalize'>{report.type === "hr" ? "HR" : report.type}</span> · {new Date(report.completedAt || report.updatedAt || report.createdAt).toLocaleString()}
            </p>
            <div className='flex flex-wrap gap-2'>
              <DownloadBtn docRef={reportRef} setUser={setUser} user={user} />
              <button onClick={() => navigate("/history")} className='rounded-lg border border-black/20 px-3 py-2 text-xs text-black'>All interviews</button>
            </div>
          </div>
          <div className='hidden md:flex items-center gap-2.5 rounded-2xl border border-black/34 bg-black px-4 py-2.5'>
            <FiAward className="text-yellow-400" size={16} />
            <span className='text-sm text-white'>Completed</span>
          </div>
        </div>

        <div className='p-4 sm:p-8 space-y-6' ref={reportRef}>
          <div className='grid md:grid-cols-3 gap-5'>
            <div className={card}>
              <div className='w-10 h-10 rounded-xl bg-white text-black flex items-center justify-center'><FiTarget size={18} /></div>
              <p className='mt-5 text-zinc-500 text-xs'>Overall Score</p>
              <h2 className='mt-2 text-4xl font-bold text-white'>{report.overallScore}<span className='text-lg text-zinc-500'>/100</span></h2>
              {report.adaptive && <p className='mt-1 text-[11px] text-zinc-500'>Harder questions weigh more; follow-ups weigh less.</p>}
            </div>

            <div className={card}>
              <div className='w-10 h-10 rounded-xl bg-white text-black flex items-center justify-center'><FiTrendingUp size={18} /></div>
              <p className='mt-5 text-zinc-500 text-xs'>Questions answered</p>
              <h2 className='mt-2 text-4xl font-bold text-white'>{answered.length}</h2>
              {followUps > 0 && <p className='mt-1 text-[11px] text-zinc-500'>including {followUps} follow-up{followUps > 1 ? "s" : ""}</p>}
            </div>

            <div className={card}>
              <div className='w-10 h-10 rounded-xl bg-white text-black flex items-center justify-center'><FiCpu size={18} /></div>
              <p className='mt-5 text-zinc-500 text-xs'>Difficulty path</p>
              <div className='mt-3 flex items-end gap-1.5 h-10' aria-label="Difficulty of each question">
                {answered.map((q, i) => (
                  <div key={i} title={`${q.difficulty} · ${q.feedback?.score ?? 0}/100`}
                    className={`w-3 rounded-sm ${DIFF_COLOR[q.difficulty] || "bg-zinc-500"} ${DIFF_HEIGHT[q.difficulty] || "h-3"} ${q.isFollowUp ? "opacity-50" : ""}`} />
                ))}
              </div>
              <p className='mt-2 text-[11px] text-zinc-500'>easy · medium · hard (faded = follow-up)</p>
            </div>
          </div>

          {summaryFailed && (
            <div role="alert" className='flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-50 p-4 text-sm text-amber-900'>
              <FiAlertTriangle />
              <span className='flex-1'>The AI summary could not be generated. Scores and question feedback below are complete.</span>
              <button onClick={retrySummary} disabled={regenerating} className='inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-xs text-white disabled:opacity-50'>
                <FiRefreshCw size={12} /> {regenerating ? "Generating…" : "Generate summary"}
              </button>
              {regenError && <p className='w-full text-xs text-red-700'>{regenError}</p>}
            </div>
          )}

          {report.summary && (
            <div className={card}>
              <h3 className="text-lg font-semibold text-white">Interview Summary</h3>
              <p className="mt-3 text-sm leading-7 text-zinc-400">{report.summary}</p>
            </div>
          )}

          <div className='grid lg:grid-cols-2 gap-5'>
            <div className='rounded-2xl bg-[#17181E] border border-green-500/20 p-6'>
              <div className='flex items-center gap-2.5'>
                <div className='w-9 h-9 rounded-lg bg-green-500 flex items-center justify-center'><FiTrendingUp className='text-white' size={16} /></div>
                <h2 className="text-lg font-semibold text-white">Strengths</h2>
              </div>
              <div className='mt-5'><List items={report.strengths} tone="green" empty="No strengths available." /></div>
            </div>
            <div className='rounded-2xl bg-[#17181E] border border-red-500/20 p-6'>
              <div className='flex items-center gap-2.5'>
                <div className='w-9 h-9 rounded-lg bg-red-500 flex items-center justify-center'><FiX className='text-white' size={16} /></div>
                <h2 className="text-lg font-semibold text-white">Weaknesses</h2>
              </div>
              <div className='mt-5'><List items={report.weaknesses} tone="red" empty="No weaknesses found." /></div>
            </div>
          </div>

          {report.improvementAreas?.length > 0 && (
            <div className={card}>
              <h3 className="text-lg font-semibold text-white">Improvement Areas</h3>
              <p className='mt-1 text-xs text-zinc-500'>Most important first.</p>
              <div className='mt-4'><List items={report.improvementAreas} numbered empty="" /></div>
            </div>
          )}

          {(report.technicalSkills?.length > 0 || report.keywords?.length > 0) && (
            <div className='grid lg:grid-cols-2 gap-5'>
              <div className={card}>
                <div className='flex items-center gap-2.5'><FiCpu className='text-white' /><h3 className="text-lg font-semibold text-white">Technical Skills Shown</h3></div>
                <div className='mt-4'><Chips items={report.technicalSkills} empty="No specific skills were identified." /></div>
              </div>
              <div className={card}>
                <div className='flex items-center gap-2.5'><FiHash className='text-white' /><h3 className="text-lg font-semibold text-white">Keywords You Used</h3></div>
                <div className='mt-4'><Chips items={report.keywords} empty="No key terms were identified." /></div>
              </div>
            </div>
          )}

          <CommunicationCard communication={report.communication} />

          <div className={card}>
            <h3 className="text-lg font-semibold text-white">Recommendations</h3>
            <div className='mt-5'><List items={report.recommendations} numbered empty="No recommendations available." /></div>
          </div>

          <RoadmapCta report={report} />

          <div>
            <h3 className="text-xl font-bold text-black mb-5">Question-by-Question Analysis</h3>
            <div className='space-y-5'>
              {questions.map((item, index) => (item.answered || item.userAnswer) && (
                <QuestionCard key={index} item={item} index={index} questions={questions} />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default Step3report
