import { useCallback, useEffect, useRef, useState } from "react"

// Text-to-speech for the AI interviewer, with an explicit "speaking" state so
// the microphone can be paused while the AI talks.

const MAX_CHUNK = 180

// Chrome silently stops long utterances; speak sentence-sized chunks instead.
export const splitForSpeech = (text = "") => {
    const sentences = String(text).replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]*\s*/g) || []
    const chunks = []
    let current = ""
    for (const sentence of sentences) {
        if ((current + sentence).length > MAX_CHUNK && current) {
            chunks.push(current.trim())
            current = ""
        }
        if (sentence.length > MAX_CHUNK) {
            const words = sentence.split(" ")
            for (const word of words) {
                if ((current + " " + word).length > MAX_CHUNK && current) {
                    chunks.push(current.trim())
                    current = ""
                }
                current += `${word} `
            }
        } else {
            current += sentence
        }
    }
    if (current.trim()) chunks.push(current.trim())
    return chunks
}

const pickVoice = (voices) => {
    const english = voices.filter((v) => /^en(-|_|$)/i.test(v.lang))
    const pool = english.length ? english : voices
    const female = pool.find((v) => /zira|samantha|female|aria|jenny/i.test(v.name))
    const male = pool.find((v) => /david|mark|male|guy/i.test(v.name))
    if (female) return { voice: female, gender: "female" }
    if (male) return { voice: male, gender: "male" }
    return { voice: pool[0] || null, gender: "female" }
}

export default function useSpeechSynthesis() {
    const supported = typeof window !== "undefined" && "speechSynthesis" in window
    const [voice, setVoice] = useState(null)
    const [voiceGender, setVoiceGender] = useState("female")
    const [voicesReady, setVoicesReady] = useState(!supported)
    const [isSpeaking, setIsSpeaking] = useState(false)
    const [subtitle, setSubtitle] = useState("")
    const lastSpokenRef = useRef("")
    const cancelledRef = useRef(false)
    const voiceRef = useRef(null)

    useEffect(() => {
        if (!supported) return undefined
        const load = () => {
            const voices = window.speechSynthesis.getVoices()
            if (!voices.length) return
            const picked = pickVoice(voices)
            voiceRef.current = picked.voice
            setVoice(picked.voice)
            setVoiceGender(picked.gender)
            setVoicesReady(true)
        }
        load()
        window.speechSynthesis.addEventListener("voiceschanged", load)
        // Some browsers never fire voiceschanged; continue with the default voice.
        const fallback = setTimeout(() => setVoicesReady(true), 1500)
        return () => {
            clearTimeout(fallback)
            window.speechSynthesis.removeEventListener("voiceschanged", load)
            window.speechSynthesis.cancel()
        }
    }, [supported])

    const speakChunk = (chunk) =>
        new Promise((resolve) => {
            const utter = new SpeechSynthesisUtterance(chunk)
            if (voiceRef.current) utter.voice = voiceRef.current
            utter.rate = 0.95
            utter.pitch = 1.05
            // Safety net: some browsers occasionally never fire onend.
            const guard = setTimeout(resolve, Math.max(4000, chunk.length * 110))
            const done = () => {
                clearTimeout(guard)
                resolve()
            }
            utter.onend = done
            utter.onerror = done
            window.speechSynthesis.speak(utter)
        })

    /** Speak text; resolves when finished (or cancelled). */
    const speak = useCallback(async (text) => {
        if (!supported || !text?.trim()) return
        window.speechSynthesis.cancel()
        cancelledRef.current = false
        lastSpokenRef.current = text
        setSubtitle(text)
        setIsSpeaking(true)
        try {
            for (const chunk of splitForSpeech(text)) {
                if (cancelledRef.current) break
                await speakChunk(chunk)
            }
        } finally {
            setIsSpeaking(false)
            setTimeout(() => setSubtitle((s) => (s === text ? "" : s)), 400)
        }
    }, [supported])

    /** Stop speaking immediately (used for "skip" and interruptions). */
    const cancel = useCallback(() => {
        if (!supported) return
        cancelledRef.current = true
        window.speechSynthesis.cancel()
        setIsSpeaking(false)
        setSubtitle("")
    }, [supported])

    return { supported, voice, voiceGender, voicesReady, isSpeaking, subtitle, speak, cancel, lastSpokenRef }
}
