import { DTMF_FREQUENCIES } from './constants'
import { logger } from './sdkLogger'

/** Lazy-initialised AudioContext for DTMF tone generation */
let audioContext: AudioContext | null = null

/**
 * Play a DTMF tone for a single digit.
 *
 * @param digit    - One of `0-9`, `*`, `#`
 * @param durationMs - Tone duration in ms (default: 150)
 */
export function playDtmfTone(digit: string, durationMs = 150): void {
    const frequencies = DTMF_FREQUENCIES[digit]
    if (!frequencies) return

    try {
        if (!audioContext) audioContext = new AudioContext()
        if (audioContext.state === 'suspended') void audioContext.resume()

        const [lowFreq, highFreq] = frequencies
        const duration = durationMs / 1000

        const osc1 = audioContext.createOscillator()
        const osc2 = audioContext.createOscillator()
        const gainNode = audioContext.createGain()

        osc1.frequency.value = lowFreq
        osc2.frequency.value = highFreq
        osc1.type = 'sine'
        osc2.type = 'sine'
        gainNode.gain.value = 0.1

        osc1.connect(gainNode)
        osc2.connect(gainNode)
        gainNode.connect(audioContext.destination)

        const now = audioContext.currentTime
        osc1.start(now)
        osc2.start(now)
        osc1.stop(now + duration)
        osc2.stop(now + duration)

        // Fade out to avoid audible click
        gainNode.gain.setValueAtTime(0.1, now)
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration)
    } catch (e) {
        logger.warn('Failed to play DTMF tone:', e)
    }
}
