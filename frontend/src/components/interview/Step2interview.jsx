import { useCallback, useEffect, useRef, useState } from 'react'
import maleVideo from "../../assets/male-ai.mp4"
import femaleVideo from "../../assets/female-ai.mp4"
import { AnimatePresence, motion } from "motion/react"
import {
  FiAlertTriangle, FiArrowDown, FiArrowRight, FiArrowUp, FiCamera, FiCameraOff, FiCode,
  FiCornerDownRight, FiMessageSquare, FiMic, FiMicOff, FiRefreshCw, FiSkipForward, FiVolume2, FiX,
} from 'react-icons/fi'
import CodeEditor from './CodeEditor'
import CodePanel from './CodePanel'
import { DEFAULT_CODE, isTemplate } from '../../lib/codeTemplates'
import Timer from './Timer'
import MicStatus from './MicStatus'
import QuestionTypeBadge from './QuestionTypeBadge'
import { typeInfo } from '../../lib/questionTypes'
import { submitAnswer } from '../../apis/interview.api'
import { useNavigate } from 'react-router-dom'
import useSpeechSynthesis from '../../hooks/useSpeechSynthesis'
import useVoiceInput from '../../hooks/useVoiceInput'
import { answerModeFor, appendTranscript } from '../../lib/speechText'

const DIFFICULTY_STYLE = {
  easy: "text-emerald-300 border-emerald-400/30 bg-emerald-500/10",
  medium: "text-amber-300 border-amber-400/30 bg-amber-500/10",
  hard: "text-red-300 border-red-400/30 bg-red-500/10",
}

const VERDICT_STYLE = {
  strong: "text-emerald-300",
  adequate: "text-sky-300",
  partial: "text-amber-300",
  weak: "text-orange-300",
  incorrect: "text-red-300",
  "no-answer": "text-red-300",
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const buildCodeAnswer = (code, notes) =>
  notes.trim() ? `${code.trim()}\n\n--- Explanation ---\n${notes.trim()}` : code.trim()

function Step2interview({ interviewData, user }) {
  const navigate = useNavigate()
  const tts = useSpeechSynthesis()

  // ── Interview state ──
  const [question, setQuestion] = useState(interviewData.question)
  const [index, setIndex] = useState(interviewData.currentQuestion || 0)
  const [progress, setProgress] = useState(interviewData.progress)
  const [answer, setAnswer] = useState("")
  const [code, setCode] = useState(DEFAULT_CODE.javascript)
  const [codeLanguage, setCodeLanguage] = useState("javascript")
  const [notes, setNotes] = useState("")
  const [lastFeedback, setLastFeedback] = useState(null)
  const [adaptation, setAdaptation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [started, setStarted] = useState(false)

  // ── Timer ──
  const [timeLeft, setTimeLeft] = useState(interviewData.question?.timer || 60)
  const [timerRunning, setTimerRunning] = useState(false)
  const deadlineRef = useRef(null)
  const timerRef = useRef(null)
  const questionStartRef = useRef(null)

  // ── UI ──
  const [cameraOn, setCameraOn] = useState(false)
  const [codeModalOpen, setCodeModalOpen] = useState(false)
  const aiVideoRef = useRef(null)
  const userVideoRef = useRef(null)
  const streamRef = useRef(null)
  const submittingRef = useRef(false)
  const spokenRef = useRef("")

  const type = question?.questionType || "verbal"
  const isVerbal = type === "verbal"
  const isCoding = type === "coding"

  // Speech input: continuous while the question is verbal; automatically
  // paused while the interviewer speaks and for written/coding questions.
  const onFinalTranscript = useCallback((text) => {
    spokenRef.current = appendTranscript(spokenRef.current, text)
    setAnswer((prev) => appendTranscript(prev, text))
  }, [])

  const voice = useVoiceInput({
    active: started && isVerbal && !loading,
    aiSpeaking: tts.isSpeaking,
    aiTextRef: tts.lastSpokenRef,
    onFinalTranscript,
  })

  const videoSource = tts.voiceGender === "male" ? maleVideo : femaleVideo
  const firstName = user?.name?.split(" ")[0] || "there"

  // Keep the AI video in sync with speech.
  useEffect(() => {
    const video = aiVideoRef.current
    if (!video) return
    if (tts.isSpeaking) video.play().catch(() => {})
    else video.pause()
  }, [tts.isSpeaking])

  // Release the camera when leaving the page.
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), [])

  const stopTimer = useCallback(() => {
    clearInterval(timerRef.current)
    timerRef.current = null
    setTimerRunning(false)
  }, [])

  useEffect(() => () => clearInterval(timerRef.current), [])

  // ── Submission ──

  const submitRef = useRef(null)

  const startTimer = useCallback((seconds) => {
    clearInterval(timerRef.current)
    deadlineRef.current = Date.now() + seconds * 1000
    questionStartRef.current = Date.now()
    setTimeLeft(seconds)
    setTimerRunning(true)
    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining <= 0) {
        clearInterval(timerRef.current)
        timerRef.current = null
        setTimerRunning(false)
        submitRef.current?.({ timedOut: true })
      }
    }, 250)
  }, [])

  /** Show a question, read it aloud, then start its timer. */
  const presentQuestion = useCallback(async (q, { intro = "", reset = true } = {}) => {
    setQuestion(q)
    // The first question is already on screen when the interview starts, so
    // anything typed while the microphone permission was pending is kept.
    if (reset) {
      setAnswer("")
      setNotes("")
      spokenRef.current = ""
      if (q.questionType === "coding") setCode(DEFAULT_CODE[codeLanguage] || DEFAULT_CODE.javascript)
    }
    setTimeLeft(q.timer || 60)

    const spoken = q.isFollowUp ? `Follow-up question. ${q.question}` : q.question
    const shortened = q.questionType === "coding" && spoken.length > 400
      ? `${spoken.slice(0, 380)}… The full problem is on your screen.`
      : spoken
    await tts.speak(intro ? `${intro} ${shortened}` : shortened)
    // Measure the answer from the moment the question has been read.
    voice.beginQuestion()
    startTimer(q.timer || 60)
  }, [codeLanguage, startTimer, tts, voice])

  const buildAnswer = () => (isCoding ? (isTemplate(code) ? "" : buildCodeAnswer(code, notes)) : answer.trim())

  const submit = async ({ timedOut = false } = {}) => {
    if (submittingRef.current) return
    const finalAnswer = buildAnswer()
    if (!timedOut && !finalAnswer) return

    submittingRef.current = true
    stopTimer()
    tts.cancel()
    setLoading(true)
    setError(null)

    const metrics = isVerbal ? voice.getMetrics() : null
    const res = await submitAnswer({
      interviewId: interviewData.interviewId,
      questionIndex: index,
      answer: finalAnswer,
      timedOut: timedOut && !finalAnswer,
      answerMode: isCoding ? "code" : answerModeFor(finalAnswer, spokenRef.current),
      codeLanguage: isCoding ? codeLanguage : "",
      timeTakenSec: questionStartRef.current ? Math.round((Date.now() - questionStartRef.current) / 1000) : 0,
      speechMetrics: metrics?.transcript ? metrics : null,
    })

    if (!res?.success) {
      setLoading(false)
      submittingRef.current = false
      if (res?.status === 409 && res.question && typeof res.currentQuestion === "number") {
        // The server already moved on (e.g. a duplicate submit); continue from there.
        setIndex(res.currentQuestion)
        await presentQuestion(res.question)
        return
      }
      if (res?.status === 400 && /already completed/i.test(res.message || "")) {
        navigate(`/interview/${interviewData.interviewId}/report`, { replace: true })
        return
      }
      setError({ message: res?.message || "Could not submit your answer.", timedOut, retryable: res?.status !== 400 })
      return
    }

    setLastFeedback({ ...res.feedback, question: question.question })
    setAdaptation(res.adaptation || null)

    if (res.completed) {
      await tts.speak("That's the end of the interview. Great effort! Preparing your detailed report now.")
      voice.stopAll()
      navigate(`/interview/${interviewData.interviewId}/report`)
      return
    }

    if (res.progress) setProgress(res.progress)
    setIndex(res.currentQuestion)
    setLoading(false)
    submittingRef.current = false

    const brief = res.feedback?.feedback ? res.feedback.feedback : "Noted your answer."
    await presentQuestion(res.question, { intro: res.question?.isFollowUp ? brief : `${brief} Next question.` })
  }

  useEffect(() => {
    submitRef.current = submit
  })

  // ── Start (user gesture: needed for microphone permission and speech) ──

  const begin = async () => {
    setStarted(true)
    await voice.start()
    await sleep(300)
    const intro = index === 0 ? `Welcome ${firstName}! Let's begin your interview.` : `Welcome back ${firstName}. Let's continue.`
    await presentQuestion(question, { intro, reset: false })
  }

  // ── Camera ──

  const toggleCamera = async () => {
    if (cameraOn) {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setCameraOn(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      setCameraOn(true)
      setTimeout(() => {
        if (userVideoRef.current) userVideoRef.current.srcObject = stream
      }, 100)
    } catch {
      setCameraOn(false)
    }
  }

  const handleSubmitCode = (snippet, lang) => {
    setAnswer((prev) => `${prev.trim() ? `${prev.trim()}\n\n` : ""}--- Code (${lang}) ---\n${snippet}`)
    setCodeModalOpen(false)
  }

  // ── Derived display ──

  const totalMain = progress?.totalMain || interviewData.totalQuestions || 1
  const mainAnswered = progress?.mainAnswered ?? index
  const displayNumber = question?.isFollowUp ? mainAnswered : Math.min(mainAnswered + 1, totalMain)
  const percent = Math.min(100, Math.round((mainAnswered / totalMain) * 100))
  const canSubmit = !loading && started && Boolean(buildAnswer())
  const info = typeInfo(type)

  if (!question) return null

  return (
    <div className='min-h-screen bg-white flex items-center justify-center p-3 sm:p-5'>

      {codeModalOpen && <CodeEditor onClose={() => setCodeModalOpen(false)} onSubmitCode={handleSubmitCode} />}

      {/* Start overlay — one click grants the mic and starts the interviewer's voice. */}
      <AnimatePresence>
        {!started && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className='fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'>
            <div className='w-full max-w-md rounded-2xl border border-white/10 bg-[#0E1016] p-6 text-white'>
              <h2 className='text-lg font-semibold'>{index === 0 ? "Ready to start?" : "Resume your interview"}</h2>
              <ul className='mt-3 space-y-2 text-sm text-zinc-300'>
                <li className='flex gap-2'><FiMic className='mt-0.5 shrink-0' /> We'll ask for microphone access once. It stays on for spoken answers and pauses automatically while the interviewer speaks.</li>
                <li className='flex gap-2'><FiCode className='mt-0.5 shrink-0' /> Written and coding questions use a text box or code editor instead.</li>
                <li className='flex gap-2'><FiArrowUp className='mt-0.5 shrink-0' /> Questions adapt to your answers, and you may get follow-up questions.</li>
              </ul>
              <p className='mt-3 text-xs text-zinc-500'>Use headphones if you can — it keeps the interviewer's voice out of your answers.</p>
              <button onClick={begin} className='mt-5 h-11 w-full rounded-xl bg-white text-sm font-semibold text-black hover:opacity-90'>
                {index === 0 ? "Start interview" : "Continue"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className='w-full max-w-6xl bg-[#0E1016] border border-white/10 rounded-2xl sm:rounded-[24px] overflow-hidden shadow-[0_0_60px_rgba(255,255,255,.03)] grid lg:grid-cols-[32%_68%]'>

        {/* left */}
        <div className='flex flex-col border-b lg:border-b-0 lg:border-r border-white/8 p-4 sm:p-5 gap-3'>

          <div className='relative rounded-xl overflow-hidden bg-black aspect-video'>
            <video src={videoSource} ref={aiVideoRef} muted playsInline preload="auto" loop className="w-full h-full object-cover" />
            {tts.isSpeaking && (
              <div className='absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-2.5 py-1'>
                <div className='flex gap-0.5 items-end h-3'>
                  {[1, 2, 3].map(i => (
                    <motion.div key={i} className="w-0.5 bg-white rounded-full"
                      animate={{ height: ["4px", "12px", "4px"] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }} />
                  ))}
                </div>
                <span className='text-[10px] text-white/80'>AI Speaking</span>
              </div>
            )}
            {tts.isSpeaking && (
              <button onClick={tts.cancel} className='absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[10px] text-white/80 hover:text-white'>
                <FiSkipForward size={10} /> Skip
              </button>
            )}
          </div>

          <div className='min-h-[52px] flex items-center'>
            <AnimatePresence>
              {tts.subtitle &&
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className='w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2'>
                  <p className="text-xs text-white/65 leading-relaxed text-center">{tts.subtitle}</p>
                </motion.div>}
            </AnimatePresence>
          </div>

          <div className='relative rounded-xl overflow-hidden bg-[#17181E] border border-white/8 aspect-video flex items-center justify-center'>
            {cameraOn ?
              <>
                <video ref={userVideoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                <div className='absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5'>
                  <span className="text-[10px] text-white/70">You</span>
                </div>
              </>
              :
              <div className='flex flex-col items-center gap-2'>
                <div className='w-14 h-14 rounded-full bg-white/10 border border-white/15 flex items-center justify-center'>
                  <span className='text-2xl font-bold text-white'>{user?.name?.charAt(0)?.toUpperCase() || "U"}</span>
                </div>
                <span className='text-xs text-white/35'>{firstName}</span>
              </div>}
          </div>

          <div className='flex items-center justify-center gap-3 pt-1'>
            <motion.button
              onClick={() => voice.setMuted(!voice.muted)}
              disabled={voice.permission !== "granted"}
              whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.93 }}
              aria-label={voice.muted ? "Unmute microphone" : "Mute microphone"}
              title={voice.muted ? "Unmute microphone" : "Mute microphone"}
              className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all disabled:opacity-40 ${voice.muted ? "bg-red-500/20 border-red-500/30 text-red-400" : "bg-white/10 border-white/15 text-white"}`}>
              {voice.muted ? <FiMicOff size={15} /> : <FiMic size={15} />}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.93 }}
              onClick={toggleCamera}
              aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
              className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${cameraOn ? "bg-white/10 border-white/15 text-white" : "bg-white/5 border-white/10 text-white/45 hover:text-white/70"}`}>
              {cameraOn ? <FiCamera size={15} /> : <FiCameraOff size={15} />}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.93 }}
              onClick={() => started && !tts.isSpeaking && tts.speak(question.question)}
              disabled={!started || tts.isSpeaking}
              aria-label="Repeat the question"
              title="Repeat the question"
              className="w-10 h-10 rounded-xl flex items-center justify-center border bg-white/5 border-white/10 text-white/45 hover:text-white/70 disabled:opacity-40 transition-all">
              <FiVolume2 size={15} />
            </motion.button>

            {!isCoding && (
              <motion.button
                whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.93 }}
                onClick={() => setCodeModalOpen(true)}
                aria-label="Add code to your answer"
                title="Add code to your answer"
                className="w-10 h-10 rounded-xl flex items-center justify-center border bg-white/5 border-white/10 text-white/45 hover:text-white/70 transition-all">
                <FiCode size={15} />
              </motion.button>
            )}
          </div>

          <MicStatus voice={voice} active={isVerbal && !loading} aiSpeaking={tts.isSpeaking} />
        </div>

        {/* right */}
        <div className='flex flex-col p-4 sm:p-6 min-w-0'>

          <div className='flex items-start justify-between gap-3 mb-4'>
            <div className='min-w-0'>
              <h2 className='text-base sm:text-lg font-semibold text-white'>AI Interview</h2>
              <div className='mt-2 flex flex-wrap items-center gap-2'>
                <QuestionTypeBadge type={type} />
                <span className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${DIFFICULTY_STYLE[question.difficulty] || DIFFICULTY_STYLE.easy}`}>
                  {question.difficulty}
                </span>
                {question.isFollowUp && (
                  <span className='inline-flex items-center gap-1 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2.5 py-1 text-xs font-medium text-fuchsia-300'>
                    <FiCornerDownRight size={11} /> Follow-up
                  </span>
                )}
                {question.topic && <span className='text-xs text-zinc-500'>{question.topic}</span>}
              </div>
            </div>
            <div className='shrink-0'>
              <Timer timeLeft={timeLeft} totalTime={question.timer || 60} paused={!timerRunning} />
            </div>
          </div>

          {adaptation?.reason && !loading && (
            <div className='mb-3 flex items-start gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-zinc-400'>
              {adaptation.change > 0 ? <FiArrowUp className='mt-0.5 shrink-0 text-amber-300' /> : adaptation.change < 0 ? <FiArrowDown className='mt-0.5 shrink-0 text-emerald-300' /> : <FiArrowRight className='mt-0.5 shrink-0' />}
              <span>{adaptation.reason}</span>
            </div>
          )}

          <motion.div key={`${index}-${question.question}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className='relative overflow-hidden rounded-xl bg-[#17181E] border border-white/8 p-4 sm:p-5 mb-3'>
            <div className='relative flex items-center gap-2.5 mb-3'>
              <div className='w-8 h-8 rounded-lg bg-white text-black flex items-center justify-center shrink-0'>
                <FiMessageSquare size={14} />
              </div>
              <p className='text-xs text-zinc-500'>
                {question.isFollowUp ? `Follow-up to question ${displayNumber}` : `Question ${displayNumber} of ${totalMain}`}
              </p>
            </div>
            <p className='relative text-white text-sm sm:text-base leading-7 whitespace-pre-wrap'>{question.question}</p>
            <p className='relative mt-3 text-[11px] text-zinc-500'>{info.hint}</p>
          </motion.div>

          <div className='mb-3'>
            <div className='flex justify-between text-[10px] text-white/35 mb-1'>
              <span>Progress</span>
              <span>{mainAnswered}/{totalMain} answered{progress?.followUpsUsed ? ` · ${progress.followUpsUsed} follow-up${progress.followUpsUsed > 1 ? "s" : ""}` : ""}</span>
            </div>
            <div className='w-full h-1 rounded-full bg-white/10 overflow-hidden'>
              <div className='h-full bg-white rounded-full transition-all duration-500' style={{ width: `${percent}%` }} />
            </div>
          </div>

          {/* Answer area */}
          {isCoding ? (
            <div className='flex flex-col gap-2'>
              <CodePanel
                language={codeLanguage}
                onLanguageChange={setCodeLanguage}
                code={code}
                onCodeChange={setCode}
                height={300}
                compact
              />
              <label htmlFor="code-notes" className='text-xs font-medium text-zinc-400'>Explain your approach (optional)</label>
              <textarea
                id="code-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder='Approach, complexity, edge cases…'
                className='w-full rounded-xl bg-[#17181E] border border-white/8 p-3 text-sm text-white outline-none resize-none focus:border-white/25 transition placeholder-white/20' />
            </div>
          ) : (
            <div className='flex-1 flex flex-col min-h-0'>
              <label htmlFor="answer" className='text-xs font-medium text-zinc-400 mb-1.5'>
                Your Answer {isVerbal && <span className='text-zinc-600'>— speak, or type to edit</span>}
              </label>
              <textarea
                id="answer"
                onChange={(e) => setAnswer(e.target.value)}
                value={answer}
                rows={isVerbal ? 5 : 8}
                onKeyDown={(e) => { if (e.ctrlKey && e.key === "Enter") submit() }}
                placeholder={isVerbal ? 'Start speaking — your words appear here…' : 'Write your answer here…'}
                className='flex-1 w-full rounded-xl bg-[#17181E] border border-white/8 p-4 text-sm text-white outline-none resize-none focus:border-white/25 transition placeholder-white/20' />
              {voice.interim && (
                <p className='mt-1.5 text-xs italic text-white/40' aria-live="polite">… {voice.interim}</p>
              )}
            </div>
          )}

          {/* Feedback on the previous answer */}
          <AnimatePresence>
            {lastFeedback && !loading && (
              <motion.div
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                className='mt-3 rounded-xl border border-green-500/20 bg-green-500/5 p-3.5'>
                <div className='flex items-center justify-between gap-2'>
                  <p className='text-[11px] uppercase tracking-widest text-green-400'>Feedback on your last answer</p>
                  <div className='flex items-center gap-2'>
                    {lastFeedback.verdict && (
                      <span className={`text-[11px] font-semibold capitalize ${VERDICT_STYLE[lastFeedback.verdict] || "text-zinc-300"}`}>
                        {lastFeedback.verdict.replace("-", " ")} · {lastFeedback.score}/100
                      </span>
                    )}
                    <button onClick={() => setLastFeedback(null)} aria-label="Dismiss feedback" className='text-white/30 hover:text-white/70'><FiX size={13} /></button>
                  </div>
                </div>
                <p className='mt-1.5 text-sm text-zinc-300 leading-6'>{lastFeedback.feedback}</p>
                {lastFeedback.whatWasMissing?.length > 0 && (
                  <p className='mt-1 text-xs text-zinc-500'>Missing: {lastFeedback.whatWasMissing.slice(0, 2).join("; ")}</p>
                )}
                <p className='mt-1 text-[11px] text-zinc-600'>Full breakdown and a model answer are in your report.</p>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <div role="alert" className='mt-3 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200'>
              <FiAlertTriangle className='mt-0.5 shrink-0' />
              <div className='flex-1'>
                <p>{error.message}</p>
                {error.retryable && (
                  <button onClick={() => submit({ timedOut: error.timedOut })} className='mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black'>
                    <FiRefreshCw size={12} /> Retry submit
                  </button>
                )}
              </div>
            </div>
          )}

          <div className='flex items-center justify-between mt-4 pt-3 border-t border-white/8'>
            <span className='text-xs text-zinc-600 hidden sm:block'>
              {!isCoding && <>Press <span className='mx-1 rounded bg-white/10 px-1.5 py-0.5 text-white text-[10px]'>Ctrl+Enter</span>to submit</>}
            </span>

            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => submit()}
              disabled={!canSubmit}
              className='ml-auto h-10 min-w-[150px] justify-center px-5 rounded-xl bg-white text-black text-sm font-semibold flex items-center gap-2 disabled:opacity-40 transition'>
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-black border-t-transparent animate-spin" />
                  Evaluating…
                </>
              ) : (
                <>Submit Answer <FiArrowRight size={15} /></>
              )}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default Step2interview
