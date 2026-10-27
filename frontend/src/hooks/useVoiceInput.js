import { useCallback, useEffect, useRef, useState } from "react"
import { rmsDb, VoiceActivityDetector } from "../lib/vad"
import { isLikelyEcho } from "../lib/speechText"

// Continuous microphone input for verbal answers.
//
// - The microphone permission is requested once per interview; the mic then
//   stays available for every question (no toggling per question).
// - Speech recognition runs continuously and is restarted automatically when
//   the browser ends it (silence timeouts, network hiccups).
// - While the AI interviewer is speaking, capture is paused, results that
//   arrive during or just after its speech are discarded, and anything that
//   matches what the AI just said is dropped (echo guard).
// - Voice activity detection on an echo-cancelled audio stream measures
//   speaking time and pauses for the communication report.

const TAIL_AFTER_AI_MS = 700
const LEVEL_INTERVAL_MS = 50
const MAX_RESTART_DELAY_MS = 8000

const getRecognitionClass = () =>
    typeof window === "undefined" ? null : window.SpeechRecognition || window.webkitSpeechRecognition || null

export default function useVoiceInput({ active, aiSpeaking, aiTextRef, onFinalTranscript }) {
    const RecognitionClass = getRecognitionClass()
    const recognitionSupported = Boolean(RecognitionClass)
    const mediaSupported = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia)

    const [permission, setPermission] = useState(recognitionSupported ? "idle" : "unsupported")
    const [muted, setMuted] = useState(false)
    const [listening, setListening] = useState(false)
    const [interim, setInterim] = useState("")
    const [level, setLevel] = useState(0)
    const [speechDetected, setSpeechDetected] = useState(false)
    const [error, setError] = useState("")
    const [hidden, setHidden] = useState(typeof document !== "undefined" ? document.hidden : false)

    const recognitionRef = useRef(null)
    const streamRef = useRef(null)
    const audioCtxRef = useRef(null)
    const analyserRef = useRef(null)
    const levelTimerRef = useRef(null)
    const vadRef = useRef(new VoiceActivityDetector())
    const allowedRef = useRef(false)
    const runningRef = useRef(false)
    const restartTimerRef = useRef(null)
    const restartDelayRef = useRef(300)
    const ignoreUntilRef = useRef(0)
    const transcriptRef = useRef("")
    const listeningMsRef = useRef(0)
    const listeningSinceRef = useRef(null)
    const onFinalRef = useRef(onFinalTranscript)
    const fatalRef = useRef(false)

    useEffect(() => {
        onFinalRef.current = onFinalTranscript
    }, [onFinalTranscript])

    const allowed = permission === "granted" && active && !muted && !aiSpeaking && !hidden

    // ── Recognition lifecycle ───────────────────────────────────────────

    const startRecognition = useCallback(() => {
        const rec = recognitionRef.current
        if (!rec || runningRef.current || !allowedRef.current || fatalRef.current) return
        try {
            rec.start()
            runningRef.current = true
        } catch {
            // start() throws if it is already starting; onend will retry.
        }
    }, [])

    const scheduleRestart = useCallback(() => {
        clearTimeout(restartTimerRef.current)
        restartTimerRef.current = setTimeout(startRecognition, restartDelayRef.current)
    }, [startRecognition])

    const createRecognition = useCallback(() => {
        if (!RecognitionClass || recognitionRef.current) return
        const rec = new RecognitionClass()
        rec.lang = "en-US"
        rec.continuous = true
        rec.interimResults = true
        rec.maxAlternatives = 1

        rec.onstart = () => {
            setListening(true)
        }

        rec.onresult = (event) => {
            if (!allowedRef.current || Date.now() < ignoreUntilRef.current) return
            let interimText = ""
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i]
                const text = result[0]?.transcript || ""
                if (result.isFinal) {
                    const clean = text.trim()
                    if (!clean) continue
                    if (isLikelyEcho(clean, aiTextRef?.current || "")) continue
                    transcriptRef.current = `${transcriptRef.current} ${clean}`.trim()
                    onFinalRef.current?.(clean)
                } else {
                    interimText += text
                }
            }
            setInterim(interimText.trim())
            setError("")
            restartDelayRef.current = 300
        }

        rec.onerror = (event) => {
            switch (event.error) {
                case "not-allowed":
                case "service-not-allowed":
                    fatalRef.current = true
                    setPermission("denied")
                    setError("Microphone access was blocked. Allow it in your browser's site settings, or type your answers.")
                    break
                case "audio-capture":
                    setError("No microphone was found. Connect one, or type your answers.")
                    restartDelayRef.current = Math.min(MAX_RESTART_DELAY_MS, restartDelayRef.current * 2)
                    break
                case "network":
                    setError("Speech recognition lost its connection. Retrying… you can keep typing meanwhile.")
                    restartDelayRef.current = Math.min(MAX_RESTART_DELAY_MS, restartDelayRef.current * 2)
                    break
                case "no-speech":
                case "aborted":
                    break
                default:
                    setError(`Speech recognition error: ${event.error}`)
            }
        }

        rec.onend = () => {
            runningRef.current = false
            setListening(false)
            setInterim("")
            // Browsers end recognition after silence; keep it running while allowed.
            if (allowedRef.current && !fatalRef.current) scheduleRestart()
        }

        recognitionRef.current = rec
    }, [RecognitionClass, aiTextRef, scheduleRestart])

    // ── Audio level / VAD ──────────────────────────────────────────────

    const startLevelMonitor = useCallback((stream) => {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext
            if (!AudioContextClass) return
            const ctx = new AudioContextClass()
            const source = ctx.createMediaStreamSource(stream)
            const analyser = ctx.createAnalyser()
            analyser.fftSize = 1024
            source.connect(analyser)
            audioCtxRef.current = ctx
            analyserRef.current = analyser
            const buffer = new Float32Array(analyser.fftSize)
            let tick = 0
            levelTimerRef.current = setInterval(() => {
                analyser.getFloatTimeDomainData(buffer)
                const db = rmsDb(buffer)
                if (allowedRef.current) {
                    const event = vadRef.current.process(db, performance.now())
                    if (event === "speech-start") setSpeechDetected(true)
                    if (event === "speech-end") setSpeechDetected(false)
                }
                // Update the meter ~10x a second to limit re-renders.
                if (++tick % 2 === 0) setLevel(Math.max(0, Math.min(1, (db + 60) / 50)))
            }, LEVEL_INTERVAL_MS)
        } catch {
            // The level meter and pause analysis are optional; recognition still works.
        }
    }, [])

    /** Ask for microphone access once and start listening. */
    const start = useCallback(async () => {
        if (!recognitionSupported) {
            setPermission("unsupported")
            return
        }
        setError("")
        fatalRef.current = false
        setPermission("requesting")
        try {
            if (mediaSupported && !streamRef.current) {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                })
                streamRef.current = stream
                stream.getAudioTracks().forEach((track) => {
                    track.onended = () => {
                        setError("The microphone was disconnected. Reconnect it and press Retry, or type your answers.")
                        fatalRef.current = true
                        setPermission("error")
                    }
                })
                startLevelMonitor(stream)
            }
            createRecognition()
            setPermission("granted")
        } catch (err) {
            const denied = err?.name === "NotAllowedError" || err?.name === "SecurityError"
            setPermission(denied ? "denied" : "error")
            setError(
                denied
                    ? "Microphone access was blocked. Allow it in your browser's site settings, or type your answers."
                    : err?.name === "NotFoundError"
                        ? "No microphone was found. Connect one, or type your answers."
                        : `Could not start the microphone: ${err?.message || "unknown error"}`
            )
        }
    }, [recognitionSupported, mediaSupported, createRecognition, startLevelMonitor])

    /** Release the microphone completely (e.g. when leaving the interview). */
    const stopAll = useCallback(() => {
        allowedRef.current = false
        clearTimeout(restartTimerRef.current)
        clearInterval(levelTimerRef.current)
        try {
            recognitionRef.current?.abort()
        } catch {
            // ignore
        }
        recognitionRef.current = null
        runningRef.current = false
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        audioCtxRef.current?.close().catch(() => {})
        audioCtxRef.current = null
    }, [])

    // React to gating changes: pause for AI speech, mute, tab switches, question type.
    useEffect(() => {
        const wasAllowed = allowedRef.current
        allowedRef.current = allowed
        const now = performance.now()

        if (allowed && !wasAllowed) {
            ignoreUntilRef.current = Date.now() + TAIL_AFTER_AI_MS
            listeningSinceRef.current = now
            restartDelayRef.current = 300
            scheduleRestart()
        } else if (!allowed && wasAllowed) {
            if (listeningSinceRef.current !== null) {
                listeningMsRef.current += now - listeningSinceRef.current
                listeningSinceRef.current = null
            }
            vadRef.current.suspend(now)
            clearTimeout(restartTimerRef.current)
            try {
                recognitionRef.current?.abort()
            } catch {
                // ignore
            }
        }
    }, [allowed, scheduleRestart])

    useEffect(() => {
        const onVisibility = () => setHidden(document.hidden)
        document.addEventListener("visibilitychange", onVisibility)
        return () => document.removeEventListener("visibilitychange", onVisibility)
    }, [])

    useEffect(() => stopAll, [stopAll])

    /** Reset transcript and metrics at the start of a question. */
    const beginQuestion = useCallback(() => {
        transcriptRef.current = ""
        listeningMsRef.current = 0
        listeningSinceRef.current = allowedRef.current ? performance.now() : null
        vadRef.current.resetStats()
        setInterim("")
    }, [])

    /** Metrics for the current answer, sent with the submission. */
    const getMetrics = useCallback(() => {
        const now = performance.now()
        const listeningMs = listeningMsRef.current + (listeningSinceRef.current !== null ? now - listeningSinceRef.current : 0)
        const vadAvailable = Boolean(analyserRef.current)
        return {
            transcript: transcriptRef.current,
            listeningTimeSec: Math.round(listeningMs / 100) / 10,
            vadAvailable,
            ...(vadAvailable ? vadRef.current.getStats(now) : {}),
        }
    }, [])

    return {
        recognitionSupported,
        permission,
        muted,
        setMuted,
        listening: allowed && listening,
        allowed,
        // Hide stale state while capture is paused.
        interim: allowed ? interim : "",
        level: allowed ? level : 0,
        speechDetected: allowed && speechDetected,
        error,
        start,
        stopAll,
        beginQuestion,
        getMetrics,
        spokenTranscript: () => transcriptRef.current,
    }
}
