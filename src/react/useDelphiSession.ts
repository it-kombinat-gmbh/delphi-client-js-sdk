'use client'

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'

import type {
    BrowserActionPayload,
    BrowserContext,
    BrowserSelectionContext,
    ChannelMessage,
    ChatPayload,
    ControlPayload,
    ResponseMode,
    StatusPayload,
} from '../core/channelTypes'
import type {
    SessionClient, SessionState,
    ActionHandler,
    ActionResult,
    AsyncActionResult,
    BrowserAudioEvent,
    MessageHandler,
    SessionConnectionState,
    SyncActionResult
} from '../core/SessionClient'
import type { SessionMode } from '../core/types'

import { useDelphiClientContext } from './context'

export type {
    SessionConnectionState,
    ActionHandler,
    MessageHandler,
    ActionResult,
    SyncActionResult,
    AsyncActionResult,
    BrowserAudioEvent,
    BrowserContext,
    BrowserSelectionContext,
    BrowserActionPayload,
}

export interface UseDelphiSessionOptions {
    /** Endpoint to open (or reuse) a session against. `null` keeps the hook idle. */
    endpointId: string | null
    /** Session mode used when opening for the first time. Ignored on reuse. */
    mode: SessionMode
    /** Optional human-readable endpoint label */
    endpointName?: string
    /** Optional human-readable app label */
    appName?: string

    onAction?: ActionHandler
    onMessage?: MessageHandler
    onChat?: (chat: ChatPayload, message: ChannelMessage) => void
    onStatus?: (status: StatusPayload, message: ChannelMessage) => void
    onControl?: (control: ControlPayload, message: ChannelMessage) => void
    onAudio?: (audio: BrowserAudioEvent, message: ChannelMessage) => void
    onConnectionChange?: (state: SessionConnectionState) => void
    onError?: (error: Error) => void
    /** Whether to auto-play assembled audio responses (default `true`). */
    autoPlayAudio?: boolean
}

export interface UseDelphiSessionReturn {
    /** The underlying session, or `null` while the hook is opening / idle. */
    session: SessionClient | null
    connectionState: SessionConnectionState
    connected: boolean
    sessionId: string | null
    textChatEnabled: boolean
    messages: ChannelMessage[]
    lastError: Error | null

    sendChat: (
        content: string,
        options?: {
            intent?: ChatPayload['intent']
            responseExpected?: boolean
            preferredResponse?: ResponseMode
            metadata?: Record<string, unknown>
        },
    ) => boolean
    sendContextUpdate: (content: string, metadata?: Record<string, unknown>) => boolean
    setBrowserContext: (browserContext: BrowserContext) => boolean
    setSelectionContext: (selection: BrowserSelectionContext) => boolean
    sendTextChat: (content: string, metadata?: Record<string, unknown>) => boolean
    sendReadAloud: (content: string, metadata?: Record<string, unknown>) => boolean
    sendBrowserAction: (payload: BrowserActionPayload) => boolean
    enableTextChat: (responseMode?: ResponseMode) => boolean
    disableTextChat: () => boolean
    setResponseMode: (responseMode: ResponseMode) => boolean
    sendAsyncActionResult: (
        actionId: string,
        success: boolean,
        options?: { data?: unknown; error?: string; durationMs?: number },
    ) => boolean
    sendActionProgress: (actionId: string, status: 'received' | 'executing') => boolean
    sendActionUpdateChat: (
        actionId: string,
        content: string,
        metadata?: Record<string, unknown>,
    ) => boolean
    sendMessage: (message: Partial<ChannelMessage>) => boolean
    audioDone: (responseId?: string) => Promise<BrowserAudioEvent>
    /** Close the session immediately. Otherwise it stays open until idle timeout or unmount-with-zero-refcount. */
    close: () => Promise<void>
    /** Clear the visible message history */
    clearMessages: () => void
}

const IDLE_RETURN: Omit<UseDelphiSessionReturn, 'session'> = {
    connectionState: 'disconnected',
    connected: false,
    sessionId: null,
    textChatEnabled: false,
    messages: [],
    lastError: null,
    sendChat: () => false,
    sendContextUpdate: () => false,
    setBrowserContext: () => false,
    setSelectionContext: () => false,
    sendTextChat: () => false,
    sendReadAloud: () => false,
    sendBrowserAction: () => false,
    enableTextChat: () => false,
    disableTextChat: () => false,
    setResponseMode: () => false,
    sendAsyncActionResult: () => false,
    sendActionProgress: () => false,
    sendActionUpdateChat: () => false,
    sendMessage: () => false,
    audioDone: () => Promise.reject(new Error('No active session')),
    close: () => Promise.resolve(),
    clearMessages: () => { },
}

/**
 * React hook that opens (or reuses) a `SessionClient` for an endpoint.
 *
 * Sessions are find-or-create per `endpointId` on the parent `DelphiClient`,
 * so multiple components asking for the same endpoint share one WebSocket.
 *
 * @example
 * ```tsx
 * const { session, connected, sendReadAloud } = useDelphiSession({
 *   endpointId: 'ext-100',
 *   mode: 'audio_playback',
 *   onAction: handleBrowserAction,
 * })
 *
 * // Or just use the orchestrator directly for one-shot reads:
 * await delphi.readAloud('Hello!', { endpointId: 'ext-100' })
 * ```
 */
export function useDelphiSession(options: UseDelphiSessionOptions): UseDelphiSessionReturn {
    const delphi = useDelphiClientContext()
    const {
        endpointId,
        mode,
        endpointName,
        appName,
        onAction,
        onMessage,
        onChat,
        onStatus,
        onControl,
        onAudio,
        onConnectionChange,
        onError,
        autoPlayAudio,
    } = options

    // Reactively resolve the SessionClient for the current endpoint by
    // subscribing to the parent client's state. We can't cache the session
    // in `useState`: when a previous session ends and a new one is opened
    // for the same `endpointId` (e.g. consecutive voice calls), the cached
    // reference would still point at the closed SessionClient and the hook
    // would surface stale `messages` / `connectionState`. Going through
    // `delphi.getSession()` on every notification keeps us aligned with the
    // current session map.
    const subscribeToDelphi = useCallback(
        (cb: () => void) => delphi.subscribe(cb),
        [delphi],
    )
    const getSessionFromDelphi = useCallback(
        () => (endpointId ? delphi.getSession(endpointId) : null),
        [delphi, endpointId],
    )
    const session = useSyncExternalStore(
        subscribeToDelphi,
        getSessionFromDelphi,
        getSessionFromDelphi,
    )

    // Trigger `openSession` the first time we observe an endpointId that has
    // no live session on the parent client. Subsequent renders pick up the
    // newly-created session via the reactive lookup above.
    useEffect(() => {
        if (!endpointId) return
        if (session) return
        void delphi
            .openSession({ endpointId, mode, endpointName, appName })
            .catch((e: unknown) => {
                onError?.(e instanceof Error ? e : new Error(String(e)))
            })
    }, [delphi, endpointId, mode, endpointName, appName, onError, session])

    // Keep session callbacks in sync with the latest props
    useEffect(() => {
        if (!session) return
        session.updateOptions({
            onAction,
            onMessage,
            onChat,
            onStatus,
            onControl,
            onAudio,
            onConnectionChange,
            onError,
            ...(autoPlayAudio !== undefined && { autoPlayAudio }),
        })
    }, [
        session,
        onAction,
        onMessage,
        onChat,
        onStatus,
        onControl,
        onAudio,
        onConnectionChange,
        onError,
        autoPlayAudio,
    ])

    // Subscribe to session state. We always call useSyncExternalStore (rules of
    // hooks): when there is no session we use a no-op subscribe + a stable
    // sentinel snapshot. The subscribe/getSnapshot pair must be referentially
    // stable across renders or React will tear down and re-establish the
    // subscription on every render.
    const idleSnapshot = useMemo<Readonly<SessionState>>(
        () => ({
            connectionState: 'disconnected',
            connected: false,
            serverReady: false,
            sessionId: null,
            endpointId: null,
            mode: null,
            textChatEnabled: false,
            messages: [],
            lastError: null,
            lastActivityAt: 0,
        }),
        [],
    )
    const subscribe = useCallback(
        (cb: () => void) => (session ? session.subscribe(cb) : () => { }),
        [session],
    )
    const getSnapshot = useCallback(
        () => (session ? session.getState() : idleSnapshot),
        [session, idleSnapshot],
    )
    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

    return useMemo(() => {
        if (!session) {
            return { session: null, ...IDLE_RETURN }
        }
        return {
            session,
            connectionState: state.connectionState,
            connected: state.connected,
            sessionId: state.sessionId,
            textChatEnabled: state.textChatEnabled,
            messages: state.messages,
            lastError: state.lastError,
            sendChat: session.sendChat.bind(session),
            sendContextUpdate: session.sendContextUpdate.bind(session),
            setBrowserContext: session.setBrowserContext.bind(session),
            setSelectionContext: session.setSelectionContext.bind(session),
            sendTextChat: session.sendTextChat.bind(session),
            sendReadAloud: session.sendReadAloud.bind(session),
            sendBrowserAction: session.sendBrowserAction.bind(session),
            enableTextChat: session.enableTextChat.bind(session),
            disableTextChat: session.disableTextChat.bind(session),
            setResponseMode: session.setResponseMode.bind(session),
            sendAsyncActionResult: session.sendAsyncActionResult.bind(session),
            sendActionProgress: session.sendActionProgress.bind(session),
            sendActionUpdateChat: session.sendActionUpdateChat.bind(session),
            sendMessage: session.sendMessage.bind(session),
            audioDone: session.audioDone.bind(session),
            close: session.close.bind(session),
            clearMessages: session.clearMessages.bind(session),
        }
    }, [session, state])
}
