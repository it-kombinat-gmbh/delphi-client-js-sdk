import type {
    ChannelMessage,
    ChatPayload,
    StatusPayload,
    ControlPayload,
    ActionPayload,
    ResponseMode,
    BrowserContext,
    BrowserSelectionContext,
    BrowserActionPayload,
    AudioPayload,
} from './channelTypes'
import type { SessionMode } from './types'
import {
    createChatMessage,
    createActionResultMessage,
    createActionAckMessage,
    createAsyncActionResultMessage,
    createActionUpdateChatMessage,
    createReconnectMessage,
    createPingMessage,
    createEnableTextChatMessage,
    createDisableTextChatMessage,
    createSetResponseModeMessage,
    createContextUpdateMessage,
    createBrowserContextMessage,
    createBrowserActionMessage,
    createTextChatMessage,
    createReadAloudMessage,
    createMessageId,
} from './utils/channel'
import { logger } from './utils/sdkLogger'

// =============================================================================
// Types
// =============================================================================

export type SessionConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

/**
 * Sync action result — action completed immediately.
 */
export interface SyncActionResult {
    success: boolean
    data?: unknown
    error?: string
}

/**
 * Async action result — call `sendAsyncActionResult()` when the action finishes.
 */
export interface AsyncActionResult {
    async: true
    message?: string
}

export type ActionResult = SyncActionResult | AsyncActionResult

/**
 * A fully-assembled audio response from the runtime.
 *
 * Emitted from `SessionClient.onAudio` after the runtime has finished streaming
 * a `start` → `delta`* → `done` cycle.
 */
export interface BrowserAudioEvent {
    /** Server-issued response id; correlates to a single `readAloud` / `sendBrowserAction` request. */
    responseId: string
    mimeType: string
    /** `data:<mimeType>;base64,<concatenated chunks>` URL ready to feed into `<audio>` or `new Audio()`. */
    dataUrl: string
    metadata?: Record<string, unknown>
}

/** Handler invoked when the AI requests a browser action */
export type ActionHandler = (action: ActionPayload) => Promise<ActionResult>

/** Handler invoked for every inbound message */
export type MessageHandler = (message: ChannelMessage) => void

export interface SessionState {
    connectionState: SessionConnectionState
    connected: boolean
    /** True once the server has acknowledged this session channel. */
    serverReady: boolean
    sessionId: string | null
    endpointId: string | null
    mode: SessionMode | null
    textChatEnabled: boolean
    messages: ChannelMessage[]
    lastError: Error | null
    /** Wall-clock ms of the last outbound send or inbound message. */
    lastActivityAt: number
}

export interface SessionOptions {
    /** Handler for action requests from ARI */
    onAction?: ActionHandler
    /** Handler for all incoming messages */
    onMessage?: MessageHandler
    /** Handler for text-chat messages specifically */
    onChat?: (chat: ChatPayload, message: ChannelMessage) => void
    /** Handler for status updates */
    onStatus?: (status: StatusPayload, message: ChannelMessage) => void
    /** Handler for control messages */
    onControl?: (control: ControlPayload, message: ChannelMessage) => void
    /** Handler for completed runtime audio responses */
    onAudio?: (audio: BrowserAudioEvent, message: ChannelMessage) => void
    /** Handler for connection state changes */
    onConnectionChange?: (state: SessionConnectionState) => void
    /** Handler for errors */
    onError?: (error: Error) => void
    /** Enable auto-reconnection (default: `true`) */
    autoReconnect?: boolean
    /** Reconnect delay in ms (default: `2000`) */
    reconnectDelay?: number
    /** Ping interval in ms (default: `30000`) */
    pingInterval?: number
    /** Automatically play completed runtime audio responses in the browser. (default: `true`) */
    autoPlayAudio?: boolean
}

// =============================================================================
// SessionClient
// =============================================================================

/**
 * Headless WebSocket session client.
 *
 * Owns the persistent channel between the browser and the AI runtime
 * (telapi → telphi/ARI) for one **session**. A session is a server-issued
 * abstraction (`sessionId`) that scopes rate limiting, conversation
 * history, and audio routing.
 *
 * Sessions come in different modes (`text`, `audio_playback`,
 * `voice_conversation`, `browser_actions`) but the wire protocol is
 * identical — the mode just tells the runtime what to do with messages
 * (e.g. stream audio back vs. route it over a SIP leg).
 *
 * Zero runtime dependencies. Compatible with `useSyncExternalStore`.
 *
 * @example
 * ```ts
 * const session = new SessionClient({ onAction: myHandler })
 * session.connect(sessionId, wsToken, 'wss://api.example.com')
 * session.sendBrowserAction({ messageType: 'browser.action.readAloud', text: '…' })
 * await session.audioDone()
 * await session.close()
 * ```
 */
export class SessionClient {
    private _state: SessionState = {
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
    }

    private _options: Required<
        Pick<SessionOptions, 'autoReconnect' | 'reconnectDelay' | 'pingInterval'>
    > &
        SessionOptions

    private _sessionId: string | null = null
    private _wsToken: string | null = null
    private _wsUrl: string = 'ws://localhost:3001'

    private _ws: WebSocket | null = null
    private _reconnectTimer: ReturnType<typeof setTimeout> | null = null
    private _pingTimer: ReturnType<typeof setInterval> | null = null
    private _lastStreamId: string | null = null
    private _destroyed = false
    private _audioBuffers: Map<
        string,
        { chunks: string[]; mimeType: string; metadata?: Record<string, unknown> }
    > = new Map()
    private _pendingAudioWaiters: Array<{
        responseId?: string
        resolve: (event: BrowserAudioEvent) => void
        reject: (error: Error) => void
    }> = []
    private _audioPlaybackQueue: Promise<void> = Promise.resolve()
    private _onCloseCallbacks: Set<() => void> = new Set()

    /** State-change subscribers (for `useSyncExternalStore` compatibility) */
    private _listeners: Set<() => void> = new Set()

    constructor(options: SessionOptions = {}) {
        this._options = {
            autoReconnect: true,
            reconnectDelay: 2000,
            pingInterval: 30000,
            ...options,
        }
    }

    // -------------------------------------------------------------------------
    // Subscription (useSyncExternalStore compatible)
    // -------------------------------------------------------------------------

    /**
     * Subscribe to state changes.
     * @returns An unsubscribe function.
     */
    subscribe(listener: () => void): () => void {
        this._listeners.add(listener)
        return () => this._listeners.delete(listener)
    }

    /** Return a stable snapshot of the current state */
    getState(): Readonly<SessionState> {
        return this._state
    }

    /** Register a callback fired exactly once when the session closes for any reason. */
    onClose(callback: () => void): () => void {
        this._onCloseCallbacks.add(callback)
        return () => this._onCloseCallbacks.delete(callback)
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    /**
     * Connect to the channel WebSocket for a previously-issued session.
     *
     * @param sessionId - Session ID from the session-token response
     * @param wsToken   - WebSocket authentication token
     * @param wsUrl     - Base WebSocket URL (e.g. `wss://api.example.com`)
     */
    connect(sessionId: string, wsToken: string, wsUrl?: string): void {
        if (this._destroyed) return

        const isNewSession = this._sessionId !== null && this._sessionId !== sessionId
        const alreadyConnected =
            !isNewSession &&
            this._sessionId === sessionId &&
            this._wsToken === wsToken &&
            this._ws !== null &&
            (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)

        if (alreadyConnected) {
            logger.debug(
                '[SessionClient] Already connected to this session — ignoring duplicate connect()',
            )
            return
        }

        this._sessionId = sessionId
        this._wsToken = wsToken
        if (wsUrl) this._wsUrl = wsUrl
        logger.info('[SessionClient] Connecting session channel', {
            sessionId,
            wsUrl: this._wsUrl,
            replacingExistingSocket: this._ws !== null,
            previousReadyState: this._ws?.readyState,
        })
        this._updateState({ sessionId, lastActivityAt: Date.now() })

        if (isNewSession) {
            this._updateState({ messages: [] })
            this._lastStreamId = null
            try {
                sessionStorage.removeItem(`channel_last_stream:${sessionId}`)
            } catch {
                /* no-op */
            }
            logger.debug('[SessionClient] New session — message history cleared')
        } else {
            try {
                const stored = sessionStorage.getItem(`channel_last_stream:${sessionId}`)
                if (stored) {
                    this._lastStreamId = stored
                    logger.debug(
                        '[SessionClient] Restored lastStreamId from sessionStorage:',
                        stored,
                    )
                }
            } catch {
                /* sessionStorage unavailable — no-op */
            }
        }

        this._connect()
    }

    /**
     * Set the metadata describing this session (mode + endpointId).
     * Surfaced through `getState()` for UIs to introspect.
     */
    setMetadata(meta: { endpointId: string; mode: SessionMode }): void {
        this._updateState({ endpointId: meta.endpointId, mode: meta.mode })
    }

    /**
     * Gracefully disconnect. Does not attempt reconnection.
     *
     * @deprecated Prefer `close()` for new code; `disconnect` is kept for cases
     *   where you want to disconnect without de-registering from a parent map.
     */
    disconnect(): void {
        this._clearTimers()
        if (this._ws) {
            this._ws.close(1000, 'Client disconnect')
            this._ws = null
        }
        this._updateState({
            connectionState: 'disconnected',
            connected: false,
            textChatEnabled: false,
            sessionId: null,
        })
        this._lastStreamId = null
        this._sessionId = null
    }

    /**
     * Close the session: disconnect, reject pending audio waiters, fire `onClose`
     * callbacks, and prevent any further reconnection.
     */
    async close(): Promise<void> {
        if (this._destroyed) return
        this._destroyed = true
        this._clearTimers()

        for (const waiter of this._pendingAudioWaiters) {
            waiter.reject(new Error('Session closed before audio response arrived'))
        }
        this._pendingAudioWaiters = []

        if (this._sessionId) {
            try {
                sessionStorage.removeItem(`channel_last_stream:${this._sessionId}`)
            } catch {
                /* sessionStorage unavailable — no-op */
            }
        }
        this._lastStreamId = null

        if (this._ws) {
            try {
                this._ws.close(1000, 'Client close')
            } catch {
                /* ignore */
            }
            this._ws = null
        }
        this._updateState({
            connectionState: 'disconnected',
            connected: false,
            textChatEnabled: false,
            sessionId: null,
        })

        const callbacks = Array.from(this._onCloseCallbacks)
        this._onCloseCallbacks.clear()
        for (const cb of callbacks) {
            try {
                cb()
            } catch (e) {
                logger.error('[SessionClient] onClose callback threw', e)
            }
        }

        this._listeners.clear()
    }

    /** Update callback options at runtime (e.g. after reconnect with new handlers) */
    updateOptions(options: Partial<SessionOptions>): void {
        Object.assign(this._options, options)
    }

    /** Clear the visible message history and the persisted resume cursor. */
    clearMessages(): void {
        this._updateState({ messages: [] })
        this._lastStreamId = null
        if (this._sessionId) {
            try {
                sessionStorage.removeItem(`channel_last_stream:${this._sessionId}`)
            } catch {
                /* sessionStorage unavailable — no-op */
            }
        }
    }

    /** Reset the idle-timeout clock without sending anything. */
    touch(): void {
        this._updateState({ lastActivityAt: Date.now() })
    }

    // -------------------------------------------------------------------------
    // Sending messages
    // -------------------------------------------------------------------------

    /**
     * Send a chat message with full control over response behaviour.
     */
    sendChat(
        content: string,
        options: {
            intent?: ChatPayload['intent']
            responseExpected?: boolean
            preferredResponse?: ResponseMode
            metadata?: Record<string, unknown>
        } = {},
    ): boolean {
        if (!this._sessionId) return false
        const message = createChatMessage(
            this._sessionId,
            'to_ari',
            'user',
            content,
            options.metadata,
        )
        if (message.chat) {
            if (options.intent !== undefined) message.chat.intent = options.intent
            if (options.responseExpected !== undefined)
                message.chat.responseExpected = options.responseExpected
            if (options.preferredResponse !== undefined)
                message.chat.preferredResponse = options.preferredResponse
        }
        this._addOutboundMessage(message)
        return this._sendRaw(message)
    }

    /**
     * Send a context-only update — **no AI response expected**.
     * Use for: async action completed, background state changes.
     */
    sendContextUpdate(content: string, metadata?: Record<string, unknown>): boolean {
        if (!this._sessionId) return false
        const message = createContextUpdateMessage(this._sessionId, content, metadata)
        this._addOutboundMessage(message)
        return this._sendRaw(message)
    }

    /**
     * Set durable browser context without invoking an action or AI response.
     *
     * Use to keep the AI aware of what the user is currently looking at:
     * page text, current route, open modal, highlighted selection, etc.
     * The runtime stores this as the "current" browser context for the
     * session and feeds it into subsequent AI turns.
     */
    setBrowserContext(browserContext: BrowserContext): boolean {
        if (!this._sessionId) return false
        const message = createBrowserContextMessage(this._sessionId, browserContext)
        const sent = this._sendRaw(message)
        logger.debug('[SessionClient] Browser context message sent', {
            sent,
            sessionId: this._sessionId,
            messageId: message.messageId,
            source: browserContext.source,
            textLength: browserContext.text?.length ?? 0,
            preview: browserContext.text?.slice(0, 120),
        })
        return sent
    }

    /**
     * Set durable browser selection context without invoking an action or AI response.
     *
     * Convenience wrapper around `setBrowserContext()` that defaults
     * `source` to `'selection'`.
     *
     * @deprecated Prefer `setBrowserContext()` for new integrations.
     */
    setSelectionContext(selection: BrowserSelectionContext): boolean {
        return this.setBrowserContext({ ...selection, source: selection.source ?? 'selection' })
    }

    /**
     * Send a text chat — expects a **text** response from AI.
     */
    sendTextChat(content: string, metadata?: Record<string, unknown>): boolean {
        if (!this._sessionId) return false
        const message = createTextChatMessage(this._sessionId, content, metadata)
        this._addOutboundMessage(message)
        return this._sendRaw(message)
    }

    /**
     * Send a read-aloud request — expects a **voice** response from AI.
     */
    sendReadAloud(content: string, metadata?: Record<string, unknown>): boolean {
        if (!this._sessionId) return false
        const message = createReadAloudMessage(this._sessionId, content, metadata)
        this._addOutboundMessage(message)
        return this._sendRaw(message)
    }

    /**
     * Trigger a browser-originated capability side flow (e.g. read-aloud,
     * transform-and-read, custom BOA flows).
     *
     * The top-level channel type stays `'browser_action'`; the payload's
     * `messageType` carries the flow trigger (for example
     * `'browser.action.readAloud'`). When `capabilityId` is omitted, the
     * runtime resolves the BOA itself (typically picks the first matching
     * one configured on the endpoint).
     */
    sendBrowserAction(payload: BrowserActionPayload): boolean {
        if (!this._sessionId) return false
        const message = createBrowserActionMessage(this._sessionId, payload)
        this._addOutboundMessage(message)
        return this._sendRaw(message)
    }

    /** Enable text-chat mode (AI will respond to text messages) */
    enableTextChat(responseMode: ResponseMode = 'text'): boolean {
        if (!this._sessionId) return false
        const message = createEnableTextChatMessage(this._sessionId, responseMode)
        const sent = this._sendRaw(message)
        if (sent) this._updateState({ textChatEnabled: true })
        return sent
    }

    /** Disable text-chat mode (AI returns to voice-only) */
    disableTextChat(): boolean {
        if (!this._sessionId) return false
        const message = createDisableTextChatMessage(this._sessionId)
        const sent = this._sendRaw(message)
        if (sent) this._updateState({ textChatEnabled: false })
        return sent
    }

    /**
     * Switch the AI output modality.
     *
     * `'text'`  — AI responds with text only (Option A: no audio, user can still speak).
     * `'voice'` — AI responds with audio (normal realtime mode).
     * `'both'`  — AI responds with both audio and text simultaneously.
     */
    setResponseMode(responseMode: ResponseMode): boolean {
        if (!this._sessionId) return false
        const message = createSetResponseModeMessage(this._sessionId, responseMode)
        return this._sendRaw(message)
    }

    /** Send the final result of an async browser action */
    sendAsyncActionResult(
        actionId: string,
        success: boolean,
        options: { data?: unknown; error?: string; durationMs?: number } = {},
    ): boolean {
        if (!this._sessionId) return false
        return this._sendRaw(
            createAsyncActionResultMessage(this._sessionId, actionId, success, options),
        )
    }

    /** Send a progress update for an in-flight async action */
    sendActionProgress(actionId: string, status: 'received' | 'executing'): boolean {
        if (!this._sessionId) return false
        return this._sendRaw(createActionAckMessage(this._sessionId, actionId, status))
    }

    /** Send an async action update via the chat flow */
    sendActionUpdateChat(
        actionId: string,
        content: string,
        metadata?: Record<string, unknown>,
    ): boolean {
        if (!this._sessionId) return false
        return this._sendRaw(
            createActionUpdateChatMessage(this._sessionId, actionId, content, metadata),
        )
    }

    /** Send a raw / custom message */
    sendMessage(partial: Partial<ChannelMessage>): boolean {
        if (!this._sessionId) return false
        const message: ChannelMessage = {
            type: 'chat',
            sessionId: this._sessionId,
            messageId: createMessageId(),
            timestamp: Date.now(),
            direction: 'to_ari',
            ...partial,
        } as ChannelMessage
        return this._sendRaw(message)
    }

    /**
     * Wait for the next assembled audio response from the runtime.
     *
     * If `responseId` is supplied, resolves only when that specific
     * response completes; otherwise resolves on the next `audio.done`.
     */
    audioDone(responseId?: string): Promise<BrowserAudioEvent> {
        return new Promise<BrowserAudioEvent>((resolve, reject) => {
            this._pendingAudioWaiters.push({ responseId, resolve, reject })
        })
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private _connect(): void {
        if (!this._sessionId || !this._wsToken) {
            logger.debug('[SessionClient] Missing sessionId or wsToken — cannot connect')
            return
        }

        this._clearTimers()

        if (this._ws) {
            this._ws.close(1000, 'New connection')
            this._ws = null
        }

        this._updateState({ connectionState: 'connecting' })

        try {
            const url = `${this._wsUrl}/ws/session?sessionId=${encodeURIComponent(this._sessionId)}&token=${encodeURIComponent(this._wsToken)}`
            const ws = new WebSocket(url)
            this._ws = ws

            ws.onopen = () => {
                if (this._destroyed) return
                logger.info('[SessionClient] Connected session channel', {
                    sessionId: this._sessionId,
                })
                this._updateState({
                    connectionState: 'connected',
                    connected: true,
                    serverReady: false,
                    lastError: null,
                    lastActivityAt: Date.now(),
                })

                if (this._lastStreamId && this._sessionId) {
                    ws.send(
                        JSON.stringify(createReconnectMessage(this._sessionId, this._lastStreamId)),
                    )
                }

                this._pingTimer = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN && this._sessionId) {
                        ws.send(JSON.stringify(createPingMessage(this._sessionId)))
                    }
                }, this._options.pingInterval)
            }

            ws.onmessage = (event) => void this._handleMessage(event)

            ws.onclose = (event) => {
                if (this._destroyed) return
                logger.info('[SessionClient] Disconnected session channel', {
                    sessionId: this._sessionId,
                    code: event.code,
                    reason: event.reason,
                })

                this._clearPingTimer()
                this._updateState({ textChatEnabled: false, serverReady: false })

                const shouldReconnect =
                    this._options.autoReconnect &&
                    this._sessionId &&
                    this._wsToken &&
                    event.code !== 1000 &&
                    event.code !== 4000 &&
                    !(event.code >= 4001 && event.code <= 4099)

                if (shouldReconnect) {
                    this._updateState({
                        connectionState: 'reconnecting',
                        connected: false,
                        serverReady: false,
                    })
                    this._reconnectTimer = setTimeout(() => {
                        if (!this._destroyed) {
                            logger.debug('[SessionClient] Attempting reconnection…')
                            this._connect()
                        }
                    }, this._options.reconnectDelay)
                } else {
                    this._updateState({
                        connectionState: 'disconnected',
                        connected: false,
                        serverReady: false,
                    })
                }
            }

            ws.onerror = () => {
                this._handleError(new Error('WebSocket connection error'))
            }
        } catch (error) {
            this._handleError(
                error instanceof Error ? error : new Error('Failed to create WebSocket'),
            )
            this._updateState({ connectionState: 'disconnected', connected: false })
        }
    }

    private async _handleMessage(event: MessageEvent): Promise<void> {
        if (this._destroyed) return

        let message: ChannelMessage
        try {
            message = JSON.parse(event.data as string) as ChannelMessage
        } catch {
            logger.error('[SessionClient] Failed to parse message')
            return
        }

        if (message.type === 'pong' || message.type === 'ping') return

        message = { ...message, timestamp: Date.now() }
        this._updateState({ lastActivityAt: Date.now() })

        if (message.streamId && this._sessionId) {
            this._lastStreamId = message.streamId
            try {
                sessionStorage.setItem(`channel_last_stream:${this._sessionId}`, message.streamId)
            } catch {
                /* no-op */
            }
        }
        this._options.onMessage?.(message)

        switch (message.type) {
            case 'chat':
                if (message.chat) {
                    this._updateState({ messages: [...this._state.messages, message] })
                    this._options.onChat?.(message.chat, message)
                }
                break

            case 'action':
                if (message.action && !this._options.onAction) {
                    if (message.action.requiresResponse && this._sessionId) {
                        this._sendRaw(
                            createActionResultMessage(
                                this._sessionId,
                                message.action.actionId,
                                false,
                                {
                                    error: `No browser action handler registered for '${message.action.name}'`,
                                },
                            ),
                        )
                    }
                    break
                }

                if (message.action && this._options.onAction) {
                    const actionId = message.action.actionId
                    const startTime = Date.now()
                    try {
                        const result = await this._options.onAction(message.action)

                        if ('async' in result && result.async) {
                            if (message.action.requiresResponse && this._sessionId) {
                                this._sendRaw(
                                    createActionAckMessage(this._sessionId, actionId, 'received'),
                                )
                            }
                        } else {
                            const sync = result as SyncActionResult
                            if (message.action.requiresResponse && this._sessionId) {
                                this._sendRaw(
                                    createActionResultMessage(
                                        this._sessionId,
                                        actionId,
                                        sync.success,
                                        {
                                            data: sync.data,
                                            error: sync.error,
                                            durationMs: Date.now() - startTime,
                                        },
                                    ),
                                )
                            }
                        }
                    } catch (err) {
                        if (message.action.requiresResponse && this._sessionId) {
                            this._sendRaw(
                                createActionResultMessage(this._sessionId, actionId, false, {
                                    error: err instanceof Error ? err.message : 'Action failed',
                                }),
                            )
                        }
                    }
                }
                break

            case 'status':
                if (message.status) {
                    if (message.status.state === 'connected') {
                        this._updateState({ serverReady: true })
                    }
                    if (message.status.state === 'text_chat_enabled') {
                        this._updateState({ textChatEnabled: true })
                    } else if (message.status.state === 'text_chat_disabled') {
                        this._updateState({ textChatEnabled: false })
                    }
                    this._updateState({ messages: [...this._state.messages, message] })
                    this._options.onStatus?.(message.status, message)
                }
                break

            case 'audio':
                if (message.audio) {
                    this._handleAudio(message.audio, message)
                }
                break

            case 'control':
                if (message.control) {
                    this._options.onControl?.(message.control, message)
                }
                break

            case 'error':
                if (message.error) {
                    this._handleError(new Error(`${message.error.code}: ${message.error.message}`))
                }
                break
        }
    }

    private _handleAudio(audio: AudioPayload, message: ChannelMessage): void {
        const responseId = audio.responseId ?? message.messageId
        const current = this._audioBuffers.get(responseId) ?? {
            chunks: [],
            mimeType: audio.mimeType ?? 'audio/mpeg',
            metadata: audio.metadata,
        }

        if (audio.event === 'start') {
            this._audioBuffers.set(responseId, {
                chunks: [],
                mimeType: audio.mimeType ?? current.mimeType,
                metadata: audio.metadata,
            })
            return
        }

        if (audio.event === 'delta') {
            if (audio.delta) current.chunks.push(audio.delta)
            if (audio.mimeType) current.mimeType = audio.mimeType
            if (audio.metadata) current.metadata = audio.metadata
            this._audioBuffers.set(responseId, current)
            return
        }

        if (audio.event === 'done') {
            const dataUrl = `data:${current.mimeType};base64,${current.chunks.join('')}`
            const browserEvent: BrowserAudioEvent = {
                responseId,
                mimeType: current.mimeType,
                dataUrl,
                metadata: current.metadata,
            }
            this._audioBuffers.delete(responseId)
            this._options.onAudio?.(browserEvent, message)

            // Resolve waiters: prefer responseId-matched, otherwise next-in-line
            const matched: number[] = []
            for (let i = 0; i < this._pendingAudioWaiters.length; i++) {
                const w = this._pendingAudioWaiters[i]!
                if (w.responseId === responseId) matched.push(i)
            }
            if (matched.length > 0) {
                for (const i of matched.reverse()) {
                    const [w] = this._pendingAudioWaiters.splice(i, 1)
                    w?.resolve(browserEvent)
                }
            } else if (this._pendingAudioWaiters.length > 0) {
                const w = this._pendingAudioWaiters.shift()
                w?.resolve(browserEvent)
            }

            if (this._options.autoPlayAudio !== false) {
                this._playAudio(dataUrl)
            }
        }
    }

    private _playAudio(dataUrl: string): void {
        this._audioPlaybackQueue = this._audioPlaybackQueue
            .then(() => this._playAudioNow(dataUrl))
            .catch((error: unknown) => {
                this._handleError(
                    error instanceof Error ? error : new Error('Failed to play audio'),
                )
            })
    }

    private _playAudioNow(dataUrl: string): Promise<void> {
        const AudioCtor = (
            globalThis as unknown as {
                Audio?: new (src?: string) => {
                    play: () => Promise<void>
                    addEventListener: (
                        type: string,
                        listener: () => void,
                        options?: { once?: boolean },
                    ) => void
                    removeEventListener: (type: string, listener: () => void) => void
                }
            }
        ).Audio
        if (!AudioCtor) return Promise.resolve()

        return new Promise((resolve, reject) => {
            const audio = new AudioCtor(dataUrl)
            const cleanup = () => {
                audio.removeEventListener('ended', onEnded)
                audio.removeEventListener('error', onError)
            }
            const onEnded = () => {
                cleanup()
                resolve()
            }
            const onError = () => {
                cleanup()
                reject(new Error('Failed to load browser audio response'))
            }
            audio.addEventListener('ended', onEnded, { once: true })
            audio.addEventListener('error', onError, { once: true })
            audio.play().catch((error: unknown) => {
                cleanup()
                reject(error instanceof Error ? error : new Error('Failed to play audio'))
            })
        })
    }

    private _sendRaw(message: ChannelMessage): boolean {
        if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return false
        try {
            this._ws.send(JSON.stringify(message))
            this._updateState({ lastActivityAt: Date.now() })
            return true
        } catch (error) {
            this._handleError(error instanceof Error ? error : new Error('Failed to send message'))
            return false
        }
    }

    private _addOutboundMessage(message: ChannelMessage): void {
        this._updateState({ messages: [...this._state.messages, message] })
    }

    private _handleError(error: Error): void {
        if (this._destroyed) return
        this._updateState({ lastError: error })
        this._options.onError?.(error)
        logger.error('[SessionClient] Error:', error)
    }

    private _updateState(patch: Partial<SessionState>): void {
        this._state = { ...this._state, ...patch }
        this._listeners.forEach((l) => l())
        if (patch.connectionState && this._options.onConnectionChange) {
            this._options.onConnectionChange(patch.connectionState)
        }
    }

    private _clearTimers(): void {
        this._clearReconnectTimer()
        this._clearPingTimer()
    }

    private _clearReconnectTimer(): void {
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer)
            this._reconnectTimer = null
        }
    }

    private _clearPingTimer(): void {
        if (this._pingTimer) {
            clearInterval(this._pingTimer)
            this._pingTimer = null
        }
    }
}
