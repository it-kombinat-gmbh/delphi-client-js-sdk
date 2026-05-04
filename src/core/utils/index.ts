export { logger, logDebug, setLogger } from './sdkLogger'
export { playDtmfTone } from './playDtmfTone'
export { setAudioCodecPreferences } from './setAudioCodecPreferences'
export { sanitizeSdpIceCredentials } from './sanitizeSdpIceCredentials'
export { SESSION_STATE_STORAGE_KEY, DTMF_FREQUENCIES } from './constants'
export { saveSessionState, loadSessionState, clearSessionState } from './sessionState'

// Message builders
export {
    createMessageId,
    createBaseMessage,
    createChatMessage,
    createActionMessage,
    createActionResultMessage,
    createActionAckMessage,
    createAsyncActionResultMessage,
    createActionUpdateChatMessage,
    createStatusMessage,
    createErrorMessage,
    createReconnectMessage,
    createControlMessage,
    createEnableTextChatMessage,
    createDisableTextChatMessage,
    createSetResponseModeMessage,
    createContextUpdateMessage,
    createBrowserContextMessage,
    createBrowserSelectionContextMessage,
    createBrowserActionMessage,
    createAudioMessage,
    createTextChatMessage,
    createReadAloudMessage,
    createPingMessage,
    createPongMessage,
} from './channel'

/** Generate a random alphanumeric string of `len` characters */
export function randomString(len: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < len; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
}
