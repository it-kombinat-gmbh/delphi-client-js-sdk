import { logDebug, logger } from './sdkLogger'

/**
 * Configure audio codec preferences on an RTCPeerConnection.
 *
 * When `preferPcma` is true (default), forces PCMA (G.711 A-law) as the
 * preferred codec. This eliminates opus → PCMA transcoding overhead on
 * the WebRTC gateway / RTP engine.
 */
export function setAudioCodecPreferences(pc: RTCPeerConnection, preferPcma: boolean = true): void {
    if (!preferPcma) return

    try {
        const transceivers = pc.getTransceivers()
        const audioTransceiver = transceivers.find(
            (t) => t.sender.track?.kind === 'audio' || t.receiver.track?.kind === 'audio',
        )

        if (!audioTransceiver) {
            logDebug('No audio transceiver found, skipping codec preferences')
            return
        }

        const capabilities = RTCRtpSender.getCapabilities('audio')
        if (!capabilities) {
            logDebug('Could not get audio capabilities')
            return
        }

        // PCMA first, then telephone-event (needed for DTMF in-band)
        const preferredCodecs = capabilities.codecs
            .filter((c) => c.mimeType === 'audio/PCMA' || c.mimeType === 'audio/telephone-event')
            .sort((a) => (a.mimeType === 'audio/PCMA' ? -1 : 1))

        if (preferredCodecs.length > 0) {
            logDebug(
                'Setting audio codec preferences:',
                preferredCodecs.map((c) => c.mimeType),
            )
            audioTransceiver.setCodecPreferences(preferredCodecs)
        } else {
            logDebug('PCMA codec not available in browser capabilities')
        }
    } catch (e) {
        logger.warn('Failed to set codec preferences:', e)
    }
}
