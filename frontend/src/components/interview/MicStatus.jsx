import { FiAlertCircle, FiMic, FiMicOff, FiPauseCircle, FiRefreshCw } from 'react-icons/fi'

// Shows what the microphone is doing right now, so candidates never have to
// guess whether they are being heard.
function MicStatus({ voice, active, aiSpeaking }) {
    const { permission, muted, allowed, level, speechDetected, error, recognitionSupported } = voice

    let tone = "text-white/45"
    let icon = <FiMicOff size={12} />
    let text = "Microphone off"
    let action = null

    if (!recognitionSupported || permission === "unsupported") {
        icon = <FiAlertCircle size={12} />
        tone = "text-amber-300"
        text = "Voice input isn't supported in this browser (use Chrome or Edge). You can type your answers."
    } else if (permission === "denied" || permission === "error") {
        icon = <FiAlertCircle size={12} />
        tone = "text-red-300"
        text = error || "Microphone unavailable. You can type your answers."
        action = (
            <button onClick={voice.start} className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-0.5 text-[10px] text-white/80 hover:border-white/30">
                <FiRefreshCw size={10} /> Retry
            </button>
        )
    } else if (permission === "requesting") {
        text = "Waiting for microphone permission…"
    } else if (permission === "granted") {
        if (muted) {
            text = "Microphone muted"
            tone = "text-red-300"
        } else if (aiSpeaking) {
            icon = <FiPauseCircle size={12} />
            text = "Paused while the interviewer speaks"
        } else if (!active) {
            icon = <FiPauseCircle size={12} />
            text = "Paused for this written/coding question"
        } else if (allowed) {
            icon = <FiMic size={12} />
            tone = "text-emerald-300"
            text = speechDetected ? "Hearing you…" : "Listening"
        }
    }

    return (
        <div className="w-full rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2" aria-live="polite">
            <div className={`flex items-center gap-2 text-[11px] ${tone}`}>
                {icon}
                <span className="flex-1 leading-4">{text}</span>
                {action}
            </div>
            {permission === "granted" && allowed && (
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                        className={`h-full rounded-full transition-[width] duration-100 ${speechDetected ? "bg-emerald-400" : "bg-white/40"}`}
                        style={{ width: `${Math.round(level * 100)}%` }}
                    />
                </div>
            )}
            {permission === "granted" && error && (
                <p className="mt-1 text-[10px] text-amber-300/90">{error}</p>
            )}
        </div>
    )
}

export default MicStatus
