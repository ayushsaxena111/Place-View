// Energy-based voice activity detection (VAD).
//
// Fed with microphone levels (dBFS) every ~50 ms. Tracks an adaptive noise
// floor, decides when the candidate is speaking, and measures speaking time
// and pauses between speech segments. Pure logic, no browser APIs, so it can
// be unit-tested with synthetic level sequences.

export const DEFAULT_VAD_OPTIONS = Object.freeze({
    thresholdDb: 12,     // speech must be this far above the noise floor
    absoluteMinDb: -55,  // ...and never quieter than this
    minSpeechMs: 120,    // sustained energy needed to start a segment
    hangoverMs: 600,     // silence needed to end a segment
    minPauseMs: 400,     // gaps shorter than this are not pauses
    longPauseMs: 2500,   // "long pause" threshold reported to the candidate
    initialFloorDb: -60,
    calibrationMs: 500,  // first samples only measure the room's background noise
})

export class VoiceActivityDetector {
    constructor(options = {}) {
        this.options = { ...DEFAULT_VAD_OPTIONS, ...options }
        this.floorDb = this.options.initialFloorDb
        this.calibration = { start: null, sum: 0, count: 0, done: false }
        this.frameMs = 50
        this.lastTs = null
        this.resetStats()
    }

    resetStats() {
        this.speaking = false
        this.candidateStart = null
        this.lastAbove = null
        this.segmentStart = null
        this.lastSegmentEnd = null
        this.speakingMs = 0
        this.pauses = []
    }

    get threshold() {
        return Math.max(this.floorDb + this.options.thresholdDb, this.options.absoluteMinDb)
    }

    /**
     * Process one level sample.
     * @returns {"speech-start"|"speech-end"|null}
     */
    process(levelDb, nowMs) {
        const level = Number.isFinite(levelDb) ? levelDb : -100
        if (this.lastTs !== null && nowMs > this.lastTs) {
            this.frameMs = Math.min(200, nowMs - this.lastTs)
        }
        this.lastTs = nowMs

        // Learn the background level first so a noisy room is not "speech".
        // If the candidate happens to speak during calibration, the floor
        // drops back down as soon as they pause (see below).
        const cal = this.calibration
        if (!cal.done) {
            if (cal.start === null) cal.start = nowMs
            cal.sum += level
            cal.count++
            if (nowMs - cal.start + this.frameMs >= this.options.calibrationMs) {
                this.floorDb = cal.sum / cal.count
                cal.done = true
            }
            return null
        }

        const above = level > this.threshold

        if (!this.speaking) {
            // Track the background noise while nobody is talking.
            this.floorDb = level < this.floorDb
                ? this.floorDb * 0.7 + level * 0.3
                : this.floorDb * 0.98 + level * 0.02

            if (above) {
                if (this.candidateStart === null) this.candidateStart = nowMs
                if (nowMs - this.candidateStart >= this.options.minSpeechMs) {
                    this.startSegment(this.candidateStart)
                    this.lastAbove = nowMs
                    return "speech-start"
                }
            } else {
                this.candidateStart = null
            }
            return null
        }

        if (above) {
            this.lastAbove = nowMs
            return null
        }
        if (nowMs - this.lastAbove >= this.options.hangoverMs) {
            this.endSegment(this.lastAbove + this.frameMs)
            return "speech-end"
        }
        return null
    }

    startSegment(at) {
        if (this.lastSegmentEnd !== null) {
            const gap = at - this.lastSegmentEnd
            if (gap >= this.options.minPauseMs) this.pauses.push(gap)
        }
        this.speaking = true
        this.segmentStart = at
        this.candidateStart = null
    }

    endSegment(at) {
        this.speakingMs += Math.max(0, at - this.segmentStart)
        this.lastSegmentEnd = at
        this.speaking = false
        this.segmentStart = null
    }

    /**
     * Stop measuring (e.g. while the AI interviewer speaks). Any open segment is
     * closed and the next gap is not counted as a pause.
     */
    suspend(nowMs) {
        if (this.speaking) this.endSegment(Math.min(nowMs, (this.lastAbove ?? nowMs) + this.frameMs))
        this.lastSegmentEnd = null
        this.candidateStart = null
    }

    getStats(nowMs) {
        const openMs = this.speaking ? Math.max(0, Math.min(nowMs, (this.lastAbove ?? nowMs) + this.frameMs) - this.segmentStart) : 0
        const long = this.pauses.filter((p) => p >= this.options.longPauseMs)
        const totalPause = this.pauses.reduce((a, b) => a + b, 0)
        return {
            speakingTimeSec: round1((this.speakingMs + openMs) / 1000),
            pauseCount: this.pauses.length,
            longPauseCount: long.length,
            longestPauseSec: round1(Math.max(0, ...this.pauses) / 1000),
            totalPauseSec: round1(totalPause / 1000),
        }
    }
}

const round1 = (n) => Math.round(n * 10) / 10

/** Root-mean-square level of a block of samples, in dBFS. */
export const rmsDb = (samples) => {
    if (!samples || samples.length === 0) return -100
    let sum = 0
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
    const rms = Math.sqrt(sum / samples.length)
    return rms > 0 ? 20 * Math.log10(rms) : -100
}
