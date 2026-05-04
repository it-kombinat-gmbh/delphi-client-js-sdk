import type { PersistedSessionState } from '../types'

import { SESSION_STATE_STORAGE_KEY } from './constants'
import { logDebug, logger } from './sdkLogger'

/** Persist voice-session state to `sessionStorage` for cross-reload reconnect */
export function saveSessionState(state: PersistedSessionState): void {
    try {
        sessionStorage.setItem(SESSION_STATE_STORAGE_KEY, JSON.stringify(state))
        logDebug('Session state saved:', state)
    } catch (e) {
        logger.error('Failed to save session state:', e)
    }
}

/**
 * Load voice-session state from `sessionStorage`.
 * Returns `null` if nothing stored or if the state is stale (>20 s).
 */
export function loadSessionState(): PersistedSessionState | null {
    try {
        const stored = sessionStorage.getItem(SESSION_STATE_STORAGE_KEY)
        if (!stored) return null

        const state = JSON.parse(stored) as PersistedSessionState

        // Server-side session only stays alive for ~20 s after disconnect
        const MAX_SESSION_AGE_MS = 20_000
        if (Date.now() - state.startedAt > MAX_SESSION_AGE_MS) {
            logDebug('Stored session state is stale (>20s), clearing')
            clearSessionState()
            return null
        }

        logDebug('Session state loaded:', state)
        return state
    } catch (e) {
        logger.error('Failed to load session state:', e)
        return null
    }
}

/** Remove session state from `sessionStorage` */
export function clearSessionState(): void {
    try {
        sessionStorage.removeItem(SESSION_STATE_STORAGE_KEY)
        logDebug('Session state cleared')
    } catch (e) {
        logger.error('Failed to clear session state:', e)
    }
}
