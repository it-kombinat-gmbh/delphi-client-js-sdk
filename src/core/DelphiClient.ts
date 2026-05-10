import type {
    DelphiConfig,
    SessionTokenResponse,
    OpenSessionOptions,
    StartCallOptions,
    ReadAloudOptions,
    ListenOptions,
    PersistedSessionState,
    IceServer,
    RuntimeCapabilities,
    RuntimeInteractionMode,
    SessionMode,
} from './types'
import { SessionClient, type SessionOptions, type BrowserAudioEvent } from './SessionClient'
import { randomString } from './utils'
import { saveSessionState, loadSessionState, clearSessionState } from './utils/sessionState'
import { playDtmfTone } from './utils/playDtmfTone'
import { setLogger, logDebug, logger } from './utils/sdkLogger'
import { setAudioCodecPreferences } from './utils/setAudioCodecPreferences'
import { sanitizeSdpIceCredentials } from './utils/sanitizeSdpIceCredentials'

// =============================================================================
// State & ref types
// =============================================================================

/**
 * Public snapshot of the `DelphiClient`'s state.
 *
 * Shaped for `useSyncExternalStore`. The active voice-call session (if any)
 * lives in `voiceCall`; all other sessions are tracked anonymously in
 * `sessions` (a flattened, serialisable view of the internal session map).
 */
export interface DelphiClientState {
    // Voice call (one at a time, when mode === 'voice_conversation')
    voiceCall: {
        sessionId: string | null
        endpointId: string
        endpointName: string
        appName: string
        registered: boolean
        calling: boolean
        inCall: boolean
        initialized: boolean
        reconnecting: boolean
        autoDialPending: boolean
        telproDomain: string | null
        /**
         * WebSocket URL to the WebRTC gateway, captured from the active
         * session token. `null` outside of a `voice_conversation` session.
         */
        webrtcGatewayUrl: string | null
        dtmfDigits: string
        audioBlocked: boolean
    }
    /** Human-readable phase string for UIs */
    status: string
    /** Read-only view of every active session keyed by endpointId. */
    sessions: ReadonlyArray<{
        endpointId: string
        sessionId: string
        mode: SessionMode
        connected: boolean
        lastActivityAt: number
    }>
    /** Free-form text the user has highlighted in the page */
    selectedText: string
}

/**
 * Refs for the active WebRTC gateway connection.
 *
 * The current implementation talks to a Janus Gateway (so the on-the-wire
 * messages and the keepalive cadence are Janus-shaped), but everything
 * outside `DelphiClient`'s private surface is gateway-agnostic so the
 * gateway can be replaced without touching the public API.
 */
interface WebRTCGatewayRefs {
    ws: WebSocket | null
    /** Gateway-issued session identifier (Janus session id today). */
    gatewaySessionId: number | null
    /** Gateway-issued plugin handle identifier (Janus handle id today). */
    gatewayHandleId: number | null
    transactions: Map<string, (msg: Record<string, unknown>) => void>
    keepAliveTimer: ReturnType<typeof setInterval> | null
    initializing: boolean
    initialized: boolean
    initPromise: Promise<void> | null
}

interface MediaRefs {
    pc: RTCPeerConnection | null
    localStream: MediaStream | null
    /**
     * Buffered remote stream from `pc.ontrack`. Stored even before the
     * UI's `<audio>` element exists, so the stream can be wired up the
     * moment `setRemoteAudioElement()` is called.
     */
    remoteStream: MediaStream | null
    remoteAudio: HTMLAudioElement | null
    localAudio: HTMLAudioElement | null
    pendingCandidates: Array<Record<string, unknown> | null>
    remoteDescriptionSet: boolean
}

interface SessionEntry {
    session: SessionClient
    endpointId: string
    mode: SessionMode
    idleTimer: ReturnType<typeof setTimeout> | null
    /** When voice mode is active, we keep extra metadata in voiceCall state. */
    isVoice: boolean
}

// =============================================================================
// Errors
// =============================================================================

export class CapabilityNotSupportedError extends Error {
    readonly name = 'CapabilityNotSupportedError'

    constructor(
        readonly capability: RuntimeInteractionMode,
        readonly capabilities: RuntimeCapabilities,
    ) {
        super(
            `Endpoint ${capabilities.endpointId} does not support '${capability}'. ` +
                `Supported interaction modes: ${supportedInteractionModes(capabilities).join(', ') || 'none'}.`,
        )
    }
}

export class ReadAloudCapabilityNotFoundError extends Error {
    readonly name = 'ReadAloudCapabilityNotFoundError'
    constructor(endpointId: string) {
        super(`Endpoint ${endpointId} has no readAloud browser-action capability configured.`)
    }
}

function supportedInteractionModes(capabilities: RuntimeCapabilities): RuntimeInteractionMode[] {
    return Object.entries(capabilities.interactionModes)
        .filter(([, supported]) => supported)
        .map(([mode]) => mode as RuntimeInteractionMode)
}

// =============================================================================
// DelphiClient
// =============================================================================

const DEFAULT_IDLE_TIMEOUT_MS = 300_000 // 5 minutes
const DEFAULT_READ_ALOUD_MESSAGE_TYPE = 'browser.action.readAloud'

/**
 * Top-level Delphi SDK orchestrator.
 *
 * Manages session lifecycle (token acquisition, channel WebSocket, optional
 * WebRTC + SIP for voice), capability discovery, and high-level helpers like
 * `readAloud()` and `startCall()`. Sessions are long-lived per endpoint so
 * repeated calls reuse the same connection.
 *
 * Zero runtime dependencies. Compatible with `useSyncExternalStore`.
 *
 * @example
 * ```ts
 * const delphi = new DelphiClient({ apiDomain: 'api.example.com', apiKey: 'key' })
 *
 * // 1) Quickstart
 * await delphi.readAloud('Hello, world!', { endpointId: 'ext-100' })
 *
 * // 2) Power-user
 * const session = await delphi.openSession({ endpointId: 'ext-100', mode: 'audio_playback' })
 * session.setBrowserContext({ text: 'Page text…' })
 * session.sendBrowserAction({ messageType: 'browser.action.readAloud' })
 * await session.audioDone()
 * await session.close()
 *
 * // 3) Voice call
 * delphi.setRemoteAudioElement(audioRef.current)
 * const call = await delphi.startCall({ endpointId: 'ext-100' })
 * call.sendReadAloud('Hello!')
 * await delphi.endCall()
 * ```
 */
export class DelphiClient {
    private _config: DelphiConfig
    private _state: DelphiClientState
    private _webrtc: WebRTCGatewayRefs
    private _media: MediaRefs
    private _pendingReconnect: PersistedSessionState | null = null
    private _sessionStateTimer: ReturnType<typeof setInterval> | null = null
    private _listeners: Set<() => void> = new Set()
    private _destroyed = false
    private _sessions: Map<string, SessionEntry> = new Map()
    /** The endpoint whose voice session is currently active, if any. */
    private _voiceEndpointId: string | null = null

    constructor(config: DelphiConfig = {}) {
        this._config = config
        setLogger(config.logger)
        this._state = this._initialState()
        this._webrtc = this._initialWebRTCRefs()
        this._media = this._initialMediaRefs()
    }

    // -------------------------------------------------------------------------
    // Subscription (useSyncExternalStore compatible)
    // -------------------------------------------------------------------------

    /** Subscribe to all state changes. Returns an unsubscribe function. */
    subscribe(listener: () => void): () => void {
        this._listeners.add(listener)
        return () => this._listeners.delete(listener)
    }

    /** Return a stable snapshot of the current state */
    getState(): Readonly<DelphiClientState> {
        return this._state
    }

    /** Return a read-only copy of the current runtime config */
    getConfig(): Readonly<DelphiConfig> {
        return this._config
    }

    /** Update the runtime config (also re-binds the logger). */
    updateConfig(config: DelphiConfig): void {
        this._config = config
        setLogger(config.logger)
    }

    // -------------------------------------------------------------------------
    // Session token API
    // -------------------------------------------------------------------------

    /**
     * Request a session token from TelAPI.
     *
     * Hits `POST {apiDomain}/api/v1/sessions/token` (or `sessionTokenUrl` if
     * configured for same-origin proxying).
     */
    async getSessionToken(endpointId: string, mode: SessionMode): Promise<SessionTokenResponse> {
        const { apiDomain, apiKey, sessionTokenUrl } = this._config

        if (!sessionTokenUrl && !apiDomain) throw new Error('apiDomain not configured')
        if (!sessionTokenUrl && !apiKey) throw new Error('apiKey not configured')

        const url = sessionTokenUrl || `https://${apiDomain}/api/v1/sessions/token`
        logDebug('Requesting session token', { endpointId, mode, url })

        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (apiKey) headers['X-API-Key'] = apiKey

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ endpointId, mode }),
        })

        if (!response.ok) {
            const err = (await response.json().catch(() => ({ error: 'Unknown error' }))) as {
                error?: string
            }
            throw new Error(err.error || `Failed to get session token: ${response.status}`)
        }

        const data = (await response.json()) as SessionTokenResponse
        logDebug('Session token received', {
            sessionId: data.sessionId,
            wsTokenExpiresIn: data.wsTokenExpiresIn,
        })
        return data
    }

    // -------------------------------------------------------------------------
    // Capability discovery
    // -------------------------------------------------------------------------

    /**
     * Discover which runtime modes and transports an endpoint supports.
     */
    async getCapabilities(endpointId: string): Promise<RuntimeCapabilities> {
        const { apiDomain, apiKey, runtimeCapabilitiesUrl } = this._config

        if (!runtimeCapabilitiesUrl && !apiDomain) throw new Error('apiDomain not configured')
        if (!runtimeCapabilitiesUrl && !apiKey) throw new Error('apiKey not configured')

        const baseUrl = runtimeCapabilitiesUrl || `https://${apiDomain}/api/v1/runtime/capabilities`
        const separator = baseUrl.includes('?') ? '&' : '?'
        const url = `${baseUrl}${separator}endpointId=${encodeURIComponent(endpointId)}`

        const headers: Record<string, string> = {}
        if (apiKey) headers['X-API-Key'] = apiKey

        const response = await fetch(url, { method: 'GET', headers })

        if (!response.ok) {
            const err = (await response.json().catch(() => ({ error: 'Unknown error' }))) as {
                error?: string | { message?: string }
            }
            const message =
                typeof err.error === 'string'
                    ? err.error
                    : err.error?.message || `Failed to get capabilities: ${response.status}`
            throw new Error(message)
        }

        return (await response.json()) as RuntimeCapabilities
    }

    /** Check whether already-fetched endpoint capabilities support an interaction mode. */
    hasCapability(capabilities: RuntimeCapabilities, capability: RuntimeInteractionMode): boolean {
        return capabilities.interactionModes[capability] === true
    }

    /** Throws `CapabilityNotSupportedError` if unsupported. */
    assertCapability(capabilities: RuntimeCapabilities, capability: RuntimeInteractionMode): void {
        if (!this.hasCapability(capabilities, capability)) {
            throw new CapabilityNotSupportedError(capability, capabilities)
        }
    }

    /** Convenience: fetch capabilities and assert support in one call. */
    async assertEndpointCapability(
        endpointId: string,
        capability: RuntimeInteractionMode,
    ): Promise<RuntimeCapabilities> {
        const capabilities = await this.getCapabilities(endpointId)
        this.assertCapability(capabilities, capability)
        return capabilities
    }

    // -------------------------------------------------------------------------
    // Session management (long-lived, one per endpointId)
    // -------------------------------------------------------------------------

    /**
     * Find-or-create a session for an endpoint.
     *
     * The first call for an endpoint determines the session mode; subsequent
     * calls reuse the open session and ignore the `mode` parameter (with a
     * debug-log warning if it differs). To switch modes, call
     * `endSession({ endpointId })` first.
     *
     * The returned `SessionClient` is fully connected (or in the process of
     * connecting; `getState().connectionState` will transition through
     * `'connecting'` → `'connected'`).
     */
    async openSession(options: OpenSessionOptions): Promise<SessionClient> {
        const { endpointId, mode } = options

        const existing = this._sessions.get(endpointId)
        if (existing) {
            if (existing.mode !== mode) {
                logger.debug(
                    `[DelphiClient] openSession({ endpointId: ${endpointId}, mode: ${mode} }) ` +
                        `reusing existing session opened with mode '${existing.mode}'. ` +
                        `Call endSession first if you want a different mode.`,
                )
            }
            this._touchSession(existing)
            return existing.session
        }

        const token = await this.getSessionToken(endpointId, mode)
        const session = new SessionClient()
        const wsUrl = this._config.apiDomain ? `wss://${this._config.apiDomain}` : undefined

        const entry: SessionEntry = {
            session,
            endpointId,
            mode,
            idleTimer: null,
            isVoice: mode === 'voice_conversation',
        }
        this._sessions.set(endpointId, entry)

        // De-register on close (whether triggered by us or the server)
        session.onClose(() => {
            const current = this._sessions.get(endpointId)
            if (current === entry) {
                this._clearIdleTimer(entry)
                this._sessions.delete(endpointId)
                if (this._voiceEndpointId === endpointId) {
                    this._voiceEndpointId = null
                    this._handleVoiceHangup()
                }
                this._refreshSessionsView()
            }
        })

        // Activity tracking — every state change resets the idle timer
        session.subscribe(() => this._touchSession(entry))

        session.setMetadata({ endpointId, mode })
        session.connect(token.sessionId, token.wsToken, wsUrl)

        if (mode === 'voice_conversation') {
            this._voiceEndpointId = endpointId
            this._setVoiceState({
                sessionId: token.sessionId,
                endpointId,
                endpointName: options.endpointName ?? '',
                appName: options.appName ?? '',
            })
            if (token.telproDomain) {
                this._setVoiceState({
                    telproDomain: token.telproDomain,
                    webrtcGatewayUrl: token.webrtcGatewayUrl ?? null,
                })
                saveSessionState({
                    sessionId: token.sessionId,
                    endpointId,
                    mode,
                    endpointName: options.endpointName,
                    appName: options.appName,
                    startedAt: Date.now(),
                    wsToken: token.wsToken,
                    telproDomain: token.telproDomain,
                    webrtcGatewayUrl: token.webrtcGatewayUrl,
                })
            }
        }

        this._refreshSessionsView()
        this._touchSession(entry)
        return session
    }

    /** Returns the existing `SessionClient` for an endpoint, or `null`. No I/O. */
    getSession(endpointId: string): SessionClient | null {
        return this._sessions.get(endpointId)?.session ?? null
    }

    /** Close the session for an endpoint (no-op if none open). */
    async endSession(endpointId: string): Promise<void> {
        const entry = this._sessions.get(endpointId)
        if (!entry) return
        await entry.session.close()
    }

    /** Close every active session. */
    async endAllSessions(): Promise<void> {
        const entries = Array.from(this._sessions.values())
        await Promise.all(entries.map((e) => e.session.close()))
    }

    // -------------------------------------------------------------------------
    // Read-aloud quickstart
    // -------------------------------------------------------------------------

    /**
     * One-shot read-aloud. Find-or-create an `audio_playback` session for the
     * endpoint, send a `browser_action: readAloud`, and resolve when the
     * runtime finishes streaming the audio.
     *
     * The session stays open after this resolves so subsequent calls reuse
     * the same WebSocket. Use `delphi.endSession(endpointId)` (or rely on
     * the configurable idle timeout) to close it.
     */
    async readAloud(text: string, options: ReadAloudOptions): Promise<BrowserAudioEvent> {
        const session = await this.openSession({
            endpointId: options.endpointId,
            mode: 'audio_playback',
        })
        await this._waitForSessionConnected(session, options.signal)

        if (options.disableAutoPlay !== undefined || options.onAudio !== undefined) {
            session.updateOptions({
                autoPlayAudio: options.disableAutoPlay !== true,
                ...(options.onAudio !== undefined && { onAudio: options.onAudio }),
            })
        }

        const discovered =
            options.capabilityId || options.identifier || options.messageType
                ? null
                : await this._getDefaultReadAloudCapability(options.endpointId)
        const messageType =
            options.messageType ?? discovered?.messageType ?? DEFAULT_READ_ALOUD_MESSAGE_TYPE
        const payload = {
            messageType,
            text,
            capabilityId: options.capabilityId ?? discovered?.id,
            capabilitySlug: discovered?.slug,
            identifier: options.identifier ?? discovered?.slug ?? discovered?.id,
            ...(options.metadata !== undefined && { data: options.metadata }),
        } as Parameters<SessionClient['sendBrowserAction']>[0]

        const audioPromise = session.audioDone()
        const sent = session.sendBrowserAction(payload)
        if (!sent) {
            throw new Error(
                'Failed to send readAloud request: session is not connected. Try awaiting a brief delay or check session.getState().connectionState.',
            )
        }

        if (options.signal) {
            return Promise.race([
                audioPromise,
                new Promise<BrowserAudioEvent>((_, reject) => {
                    if (options.signal!.aborted) {
                        reject(new DOMException('Aborted', 'AbortError'))
                        return
                    }
                    options.signal!.addEventListener(
                        'abort',
                        () => reject(new DOMException('Aborted', 'AbortError')),
                        { once: true },
                    )
                }),
            ])
        }
        return audioPromise
    }

    /**
     * Open a listener session and subscribe it to an interpretation stream.
     */
    async listen(options: ListenOptions): Promise<SessionClient> {
        const session = await this.openSession({
            endpointId: options.endpointId,
            mode: 'listen',
        })
        await this._waitForSessionConnected(session)
        session.setBrowserContext({
            identifier: options.identifier,
            role: 'listener',
            targetLanguage: options.targetLanguage,
            source: 'interpretation_listener',
            metadata: {
                scope: options.scope ?? options.endpointId,
            },
        })
        session.listen({
            ...options,
            endpointId: options.endpointId,
            scope: options.scope ?? options.endpointId,
        })
        return session
    }

    private async _getDefaultReadAloudCapability(endpointId: string): Promise<{
        id: string
        slug: string
        messageType: string
    } | null> {
        const capabilities = await this.assertEndpointCapability(endpointId, 'audio_playback')
        const capability = capabilities.flows.browserActions.find(
            (action) => action.type === 'readAloud',
        )
        if (!capability) {
            throw new ReadAloudCapabilityNotFoundError(endpointId)
        }
        return {
            id: capability.id,
            slug: capability.slug,
            messageType: capability.messageType,
        }
    }

    private _waitForSessionConnected(
        session: SessionClient,
        signal?: AbortSignal,
        timeoutMs = 10_000,
    ): Promise<void> {
        const state = session.getState()
        if (state.connected && state.serverReady) return Promise.resolve()
        if (signal?.aborted) {
            return Promise.reject(new DOMException('Aborted', 'AbortError'))
        }

        return new Promise<void>((resolve, reject) => {
            let settled = false
            let unsubscribe: (() => void) | null = null

            const cleanup = () => {
                settled = true
                clearTimeout(timeout)
                signal?.removeEventListener('abort', onAbort)
                unsubscribe?.()
            }

            const finish = (error?: Error | DOMException) => {
                if (settled) return
                cleanup()
                if (error) reject(error)
                else resolve()
            }

            const onAbort = () => finish(new DOMException('Aborted', 'AbortError'))
            const timeout = setTimeout(() => {
                const latest = session.getState()
                finish(
                    latest.lastError ??
                        new Error(
                            `Timed out waiting for session channel to become ready (${latest.connectionState})`,
                        ),
                )
            }, timeoutMs)

            signal?.addEventListener('abort', onAbort, { once: true })
            unsubscribe = session.subscribe(() => {
                const latest = session.getState()
                if (latest.connected && latest.serverReady) {
                    finish()
                    return
                }
                if (latest.connectionState === 'disconnected' && latest.lastError) {
                    finish(latest.lastError)
                }
            })
        })
    }

    // -------------------------------------------------------------------------
    // Voice call (WebRTC) — wraps openSession({ mode: 'voice_conversation' })
    //                       with WebRTC gateway + SIP setup
    // -------------------------------------------------------------------------

    /**
     * Open a voice-conversation session and bring up the WebRTC gateway +
     * SIP leg on top of it. Returns the underlying `SessionClient`. Call
     * `endCall()` (or `session.close()`) to hang up and tear down WebRTC.
     */
    async startCall(options: StartCallOptions): Promise<SessionClient> {
        const {
            endpointId,
            endpointName = '',
            appName = '',
            browserContext,
            autoDial = false,
        } = options

        if (this._voiceEndpointId && this._voiceEndpointId !== endpointId) {
            throw new Error(
                `Cannot start a call on '${endpointId}': a voice call is already active on '${this._voiceEndpointId}'. End it first.`,
            )
        }

        this._setStatus('Preparing call…')
        this._setVoiceState({ autoDialPending: autoDial, endpointName, appName })

        const session = await this.openSession({
            endpointId,
            mode: 'voice_conversation',
            endpointName,
            appName,
        })

        if (browserContext) {
            await this._waitForSessionConnected(session)
            const sent = session.setBrowserContext(browserContext)
            if (!sent) {
                logger.warn('[DelphiClient] Failed to send browserContext before call dial', {
                    endpointId,
                })
            }
        }

        const { telproDomain, webrtcGatewayUrl } = this._state.voiceCall
        if (!telproDomain) {
            throw new Error(
                'Voice call requires telproDomain in the session token response. ' +
                    'Check that the endpoint is configured for voice_conversation.',
            )
        }
        if (!webrtcGatewayUrl) {
            throw new Error(
                'Voice call requires webrtcGatewayUrl in the session token response. ' +
                    'Update your TelAPI server to include the WebRTC gateway URL when ' +
                    "issuing tokens for mode 'voice_conversation'.",
            )
        }

        await this._initWebRTCGateway(telproDomain, webrtcGatewayUrl)

        if (autoDial && this._state.voiceCall.registered) {
            this._setVoiceState({ autoDialPending: false })
            void this._dial()
        }

        return session
    }

    /** Hang up the active voice call (if any) and tear down WebRTC. */
    async endCall(): Promise<void> {
        if (!this._voiceEndpointId) return
        await this._hangup()
        await this.endSession(this._voiceEndpointId)
    }

    // -------------------------------------------------------------------------
    // Voice-call helpers (audio elements, DTMF, audio unblock, selection)
    // -------------------------------------------------------------------------

    /**
     * Wire the remote `<audio>` element. Safe to call before `startCall()`
     * — if a remote stream has already arrived (race between `pc.ontrack`
     * and the React ref attaching), it is connected immediately.
     */
    setRemoteAudioElement(el: HTMLAudioElement | null): void {
        this._media.remoteAudio = el
        if (el && this._media.remoteStream && el.srcObject !== this._media.remoteStream) {
            el.srcObject = this._media.remoteStream
            void this._tryPlayAudio()
        }
    }

    setLocalAudioElement(el: HTMLAudioElement | null): void {
        this._media.localAudio = el
    }

    /** Send a DTMF tone over the active voice call (no-op if not in a call). */
    async sendDtmf(digit: string): Promise<void> {
        playDtmfTone(digit)
        this._setVoiceState({ dtmfDigits: this._state.voiceCall.dtmfDigits + digit })

        if (!this._state.voiceCall.inCall) return

        try {
            await this._sendGatewayRequest({
                janus: 'message',
                body: { request: 'dtmf_info', digit },
            })
        } catch (e) {
            logger.error('DTMF failed:', e)
        }
    }

    clearDtmfDigits(): void {
        this._setVoiceState({ dtmfDigits: '' })
    }

    /** Enable audio after a browser autoplay block */
    async enableAudio(): Promise<void> {
        const audio = this._media.remoteAudio
        if (!audio) return
        try {
            await audio.play()
            this._setVoiceState({ audioBlocked: false })
        } catch (error) {
            logger.error('Failed to enable audio:', error)
        }
    }

    /** Track the user's current text selection (for AI read-aloud feature) */
    setSelectedText(text: string): void {
        this._setState({ selectedText: text })
    }

    // -------------------------------------------------------------------------
    // Reconnect support (voice-call sessions)
    // -------------------------------------------------------------------------

    /** Check `sessionStorage` for a persisted voice-call state from the previous page load. */
    restorePersistedCall(): PersistedSessionState | null {
        return loadSessionState()
    }

    /** Reconnect a previously-saved voice call. */
    async reconnectCall(state: PersistedSessionState): Promise<void> {
        if (state.mode !== 'voice_conversation') {
            throw new Error(`reconnectCall only supports voice_conversation sessions`)
        }
        logDebug('Reconnecting to voice call:', state.sessionId)
        this._setStatus('Reconnecting…')
        this._setVoiceState({ reconnecting: true })

        if (!state.telproDomain) {
            throw new Error('telproDomain not available in persisted state')
        }
        if (!state.webrtcGatewayUrl) {
            throw new Error(
                'webrtcGatewayUrl not available in persisted state. ' +
                    'The persisted session was created by an older SDK version; clear ' +
                    'sessionStorage and start a fresh call.',
            )
        }
        if (!state.wsToken) {
            throw new Error('wsToken not available in persisted state')
        }

        // Re-open the session (without going through the token endpoint)
        const session = new SessionClient()
        const wsUrl = this._config.apiDomain ? `wss://${this._config.apiDomain}` : undefined
        const entry: SessionEntry = {
            session,
            endpointId: state.endpointId,
            mode: 'voice_conversation',
            idleTimer: null,
            isVoice: true,
        }
        this._sessions.set(state.endpointId, entry)
        this._voiceEndpointId = state.endpointId

        session.onClose(() => {
            const current = this._sessions.get(state.endpointId)
            if (current === entry) {
                this._sessions.delete(state.endpointId)
                if (this._voiceEndpointId === state.endpointId) {
                    this._voiceEndpointId = null
                    this._handleVoiceHangup()
                }
                this._refreshSessionsView()
            }
        })
        session.setMetadata({ endpointId: state.endpointId, mode: 'voice_conversation' })
        session.connect(state.sessionId, state.wsToken, wsUrl)
        this._setVoiceState({
            sessionId: state.sessionId,
            endpointId: state.endpointId,
            endpointName: state.endpointName ?? '',
            appName: state.appName ?? '',
            telproDomain: state.telproDomain,
            webrtcGatewayUrl: state.webrtcGatewayUrl,
        })
        this._refreshSessionsView()

        if (!this._state.voiceCall.registered) {
            logDebug('Not registered yet — queuing reconnect until WebRTC + SIP are ready')
            this._pendingReconnect = state
            if (!this._state.voiceCall.initialized && !this._webrtc.initializing) {
                this._initWebRTCGateway(state.telproDomain, state.webrtcGatewayUrl).catch(
                    (error) => {
                        this._pendingReconnect = null
                        const errMsg = error instanceof Error ? error.message : 'Unknown'
                        this._setStatus(`Reconnect failed: ${errMsg}`)
                        this._setVoiceState({ reconnecting: false })
                    },
                )
            }
            return
        }

        try {
            await this._reconnectMedia(state)
        } finally {
            this._pendingReconnect = null
            this._setVoiceState({ reconnecting: false })
        }
    }

    /** Cancel an in-progress reconnect attempt (does NOT send SIP hangup). */
    cancelReconnect(): void {
        this._pendingReconnect = null
        clearSessionState()
        this._setStatus(this._state.voiceCall.registered ? 'Connected' : 'Disconnected')
        this._setVoiceState({ reconnecting: false })
        this._cleanupMedia()
    }

    // -------------------------------------------------------------------------
    // Destroy
    // -------------------------------------------------------------------------

    /** Tear down everything. Call on component unmount. */
    destroy(): void {
        this._destroyed = true
        this._stopSessionStateTimer()
        this._teardownWebRTC()
        void this.endAllSessions().catch(() => undefined)
        this._listeners.clear()
    }

    // -------------------------------------------------------------------------
    // Idle timeout
    // -------------------------------------------------------------------------

    private _touchSession(entry: SessionEntry): void {
        this._refreshSessionsView()
        if (entry.isVoice) return // voice sessions don't auto-close

        const timeoutMs = this._config.sessionIdleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS
        if (timeoutMs <= 0) return

        if (entry.idleTimer) clearTimeout(entry.idleTimer)
        entry.idleTimer = setTimeout(() => {
            const current = this._sessions.get(entry.endpointId)
            if (current === entry) {
                logger.info(
                    `[DelphiClient] Closing idle session for endpoint '${entry.endpointId}' (${entry.mode}) after ${timeoutMs}ms`,
                )
                void entry.session.close()
            }
        }, timeoutMs)
    }

    private _clearIdleTimer(entry: SessionEntry): void {
        if (entry.idleTimer) {
            clearTimeout(entry.idleTimer)
            entry.idleTimer = null
        }
    }

    private _refreshSessionsView(): void {
        const view = Array.from(this._sessions.values()).map((entry) => {
            const s = entry.session.getState()
            return {
                endpointId: entry.endpointId,
                sessionId: s.sessionId ?? '',
                mode: entry.mode,
                connected: s.connected,
                lastActivityAt: s.lastActivityAt,
            }
        })
        this._setState({ sessions: view })
    }

    // -------------------------------------------------------------------------
    // ICE
    // -------------------------------------------------------------------------

    private _resolveIceServers(telproDomain: string | null | undefined): RTCIceServer[] {
        const custom = this._config.iceServers
        if (custom && custom.length > 0) {
            return custom as RTCIceServer[]
        }

        const host = telproDomain?.trim()
        if (!host) {
            logDebug('ICE: no telproDomain — RTCPeerConnection with empty iceServers')
            return []
        }

        const port = 3478
        const username = this._config.turnUsername ?? 'telpro'
        const credential = this._config.turnCredential ?? 'changeme'

        const derived: IceServer[] = [
            { urls: `stun:${host}:${port}` },
            {
                urls: [`turn:${host}:${port}?transport=udp`, `turn:${host}:${port}?transport=tcp`],
                username,
                credential,
            },
        ]
        logDebug('ICE: derived from telproDomain', host)
        return derived as RTCIceServer[]
    }

    // -------------------------------------------------------------------------
    // WebRTC gateway + SIP plumbing (private — surface via startCall/endCall)
    //
    // ⚠️ Gateway-specific section. The current implementation talks to a
    // Janus Gateway (SIP plugin), so the wire-format literals below
    // (`{ janus: 'create' | 'attach' | 'message' | 'keepalive' | 'trickle' }`,
    // the `janus-protocol` WebSocket subprotocol, and `janus.plugin.sip`)
    // are Janus-shaped. To swap in a different WebRTC gateway, replace
    // the bodies of `_initWebRTCGateway`, `_sendGatewayRequest`,
    // `_handleGatewayMessage`, and `_teardownWebRTC` — the rest of the
    // SDK does not name the gateway.
    // -------------------------------------------------------------------------

    /**
     * Bring up the WebRTC gateway WebSocket and SIP plugin.
     *
     * @param telproDomain  SIP/TURN/STUN host (used for the SIP URI and
     *   ICE auto-derivation).
     * @param gatewayUrl    WebSocket URL of the gateway. Sourced from the
     *   session token response (`SessionTokenResponse.webrtcGatewayUrl`)
     *   so the server can route per-session.
     */
    private async _initWebRTCGateway(telproDomain: string, gatewayUrl: string): Promise<void> {
        const gw = this._webrtc

        if (gw.initializing && gw.initPromise) {
            logDebug('WebRTC gateway already initializing, waiting for existing init')
            await gw.initPromise
            return
        }
        if (gw.initialized && this._state.voiceCall.registered) {
            logDebug('WebRTC gateway already initialized and registered, skipping')
            return
        }
        if (gw.initialized && !this._state.voiceCall.registered) {
            logDebug(
                'WebRTC gateway initialized without SIP registration, tearing down and retrying',
            )
            this._teardownWebRTC()
        }
        if (!telproDomain) {
            throw new Error('Cannot initialize WebRTC gateway without a telproDomain')
        }
        if (!gatewayUrl) {
            throw new Error('Cannot initialize WebRTC gateway without a gateway URL')
        }

        const initPromise = (async () => {
            gw.initializing = true
            gw.gatewaySessionId = null
            gw.gatewayHandleId = null
            this._setStatus('Connecting…')
            logDebug('Connecting to WebRTC gateway WebSocket:', gatewayUrl)

            const ws = new WebSocket(gatewayUrl, 'janus-protocol')
            gw.ws = ws

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10_000)
                ws.onopen = () => {
                    clearTimeout(timeout)
                    resolve()
                }
                ws.onerror = () => {
                    clearTimeout(timeout)
                    reject(new Error('Connection failed'))
                }
            })

            ws.onmessage = (e) => {
                try {
                    this._handleGatewayMessage(
                        JSON.parse(e.data as string) as Record<string, unknown>,
                    )
                } catch (err) {
                    logger.error('WebRTC gateway parse error:', err)
                }
            }

            ws.onclose = () => {
                logDebug('WebRTC gateway WebSocket closed')
                this._setVoiceState({ registered: false })
                if (gw.keepAliveTimer) {
                    clearInterval(gw.keepAliveTimer)
                    gw.keepAliveTimer = null
                }
                this._teardownWebRTC()
            }

            this._setStatus('Creating session…')
            const createResp = await this._sendGatewayRequest({ janus: 'create' })
            gw.gatewaySessionId =
                ((createResp['data'] as Record<string, unknown>)?.['id'] as number) ?? null
            logDebug('Gateway session:', gw.gatewaySessionId)

            if (gw.keepAliveTimer) {
                clearInterval(gw.keepAliveTimer)
                gw.keepAliveTimer = null
            }
            gw.keepAliveTimer = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN && gw.gatewaySessionId) {
                    ws.send(
                        JSON.stringify({
                            janus: 'keepalive',
                            session_id: gw.gatewaySessionId,
                            transaction: randomString(12),
                        }),
                    )
                }
            }, 25_000)

            this._setStatus('Attaching SIP plugin…')
            const attachResp = await this._sendGatewayRequest({
                janus: 'attach',
                plugin: 'janus.plugin.sip',
            })
            gw.gatewayHandleId =
                ((attachResp['data'] as Record<string, unknown>)?.['id'] as number) ?? null
            logDebug('Gateway handle:', gw.gatewayHandleId)

            this._setStatus('Registering…')
            await this._sendGatewayRequest({
                janus: 'message',
                body: {
                    request: 'register',
                    type: 'guest',
                    username: `sip:webrtc@${telproDomain}`,
                    proxy: `sip:${telproDomain}`,
                },
            })

            gw.initialized = true
            gw.initializing = false
            gw.initPromise = null
            this._setVoiceState({ initialized: true })

            this._startSessionStateTimer()
        })()

        gw.initPromise = initPromise

        try {
            await initPromise
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error)
            logger.warn('WebRTC gateway init failed:', errMsg)
            gw.initializing = false
            gw.initialized = false
            gw.initPromise = null
            this._setVoiceState({ initialized: false })
            this._setStatus(`Connection failed: ${errMsg}`)
            throw error
        }
    }

    /**
     * Make an outbound call.
     *
     * @param attempt remaining retry budget. Decremented and re-tried on
     *   transient failures so that "sporadically struggles to initiate"
     *   races with the WebRTC gateway self-heal instead of failing the
     *   user-visible call.
     */
    private async _dial(attempt = 3): Promise<void> {
        if (attempt <= 0) return

        const { registered, endpointId, sessionId, telproDomain } = this._state.voiceCall
        const { preferPcma = true } = this._config

        if (!registered) {
            logDebug('Not registered yet — waiting')
            return
        }
        if (!endpointId) {
            logDebug('No endpointId — cannot make call')
            return
        }
        if (!telproDomain) {
            throw new Error('telproDomain not available — call startCall first')
        }

        try {
            this._setVoiceState({ calling: true })
            this._setStatus('Setting up call…')

            this._setStatus('Getting microphone…')
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
                video: false,
            })
            this._media.localStream = stream
            if (this._media.localAudio) this._media.localAudio.srcObject = stream

            const iceServers = this._resolveIceServers(telproDomain)
            const pc = new RTCPeerConnection({ iceServers })
            this._media.pc = pc

            stream.getTracks().forEach((t) => pc.addTrack(t, stream))
            setAudioCodecPreferences(pc, preferPcma)

            pc.ontrack = (event) => {
                logDebug('[Call] Remote track:', event.track.kind)
                // Buffer the stream even if the audio element hasn't mounted
                // yet — `setRemoteAudioElement` and `_tryPlayAudio` will
                // pick it up when it appears.
                this._media.remoteStream = event.streams[0] ?? new MediaStream([event.track])
                void this._tryPlayAudio()
            }

            pc.oniceconnectionstatechange = () => {
                logDebug('ICE state:', pc.iceConnectionState)
                if (
                    pc.iceConnectionState === 'disconnected' ||
                    pc.iceConnectionState === 'failed'
                ) {
                    void this._restartIce(pc)
                }
            }

            pc.onicecandidate = (event) => {
                const candidate = event.candidate
                    ? {
                          candidate: event.candidate.candidate,
                          sdpMid: event.candidate.sdpMid,
                          sdpMLineIndex: event.candidate.sdpMLineIndex,
                      }
                    : { completed: true }
                // Janus-shaped trickle frame; see _initWebRTCGateway comment.
                this._webrtc.ws?.send(
                    JSON.stringify({
                        janus: 'trickle',
                        session_id: this._webrtc.gatewaySessionId,
                        handle_id: this._webrtc.gatewayHandleId,
                        candidate,
                        transaction: randomString(12),
                    }),
                )
            }

            const offer = await pc.createOffer({ offerToReceiveAudio: true })
            await pc.setLocalDescription(offer)

            const uri = `sip:webrtc@${telproDomain}`
            logDebug('Calling:', uri)

            const sipHeaders: Record<string, string> = {}
            if (sessionId) sipHeaders['X-Call-ID'] = sessionId

            const callBody: Record<string, unknown> = { request: 'call', uri }
            if (Object.keys(sipHeaders).length > 0) callBody['headers'] = sipHeaders

            await this._sendGatewayRequest({
                janus: 'message',
                body: callBody,
                jsep: { type: offer.type, sdp: offer.sdp },
            })
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Unknown'
            logger.warn('Call failed:', errMsg)
            this._setVoiceState({ calling: false })
            this._setStatus(`Call failed: ${errMsg}`)

            const sessionLost =
                errMsg.includes('No such session') || errMsg.includes('not connected')

            if (sessionLost) {
                // Gateway died — retrying won't help, full teardown only.
                logger.warn('Gateway session lost during call, tearing down WebRTC')
                this._teardownWebRTC()
                return
            }

            this._cleanupMedia()

            const remaining = attempt - 1
            if (remaining > 0) {
                logDebug(`Retrying call setup after failure (${remaining} attempt(s) left)`)
                await new Promise((r) => setTimeout(r, 1000))
                void this._dial(remaining)
            }
        }
    }

    /**
     * Force an ICE restart on the active peer connection. Triggered when
     * the connection drops to `disconnected` (transient) or `failed`
     * (terminal-but-recoverable). The resulting JSEP offer is sent over
     * the gateway as a `update` message so the SIP leg can renegotiate
     * media without a fresh INVITE.
     */
    private async _restartIce(pc: RTCPeerConnection): Promise<void> {
        logDebug('ICE connection lost, forcing ICE restart…')
        try {
            this._setStatus('Reconnecting audio…')
            const offer = await pc.createOffer({
                iceRestart: true,
                offerToReceiveAudio: true,
            })
            await pc.setLocalDescription(offer)

            if (this._webrtc.ws && this._webrtc.gatewaySessionId && this._webrtc.gatewayHandleId) {
                await this._sendGatewayRequest({
                    janus: 'message',
                    body: { request: 'update' },
                    jsep: { type: offer.type, sdp: offer.sdp },
                })
            }
        } catch (e) {
            logger.error('Failed to renegotiate following ICE restart:', e)
        }
    }

    /** Send a SIP hangup, then clean up media. Safe to call when not in a call. */
    private async _hangup(): Promise<void> {
        try {
            if (this._state.voiceCall.inCall || this._state.voiceCall.calling) {
                await this._sendGatewayRequest({
                    janus: 'message',
                    body: { request: 'hangup' },
                })
            }
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Unknown'
            if (errMsg.includes('No such session')) {
                logger.warn('Gateway session lost during hangup, tearing down WebRTC')
                this._teardownWebRTC()
            }
        }
        this._handleVoiceHangup()
    }

    private async _reconnectMedia(state: PersistedSessionState): Promise<void> {
        try {
            this._cleanupMedia()
            this._media.remoteDescriptionSet = false

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
                video: false,
            })
            this._media.localStream = stream
            if (this._media.localAudio) this._media.localAudio.srcObject = stream

            if (!state.telproDomain) throw new Error('telproDomain missing')
            const iceServers = this._resolveIceServers(state.telproDomain)
            const pc = new RTCPeerConnection({ iceServers })
            this._media.pc = pc

            stream.getTracks().forEach((t) => pc.addTrack(t, stream))
            setAudioCodecPreferences(pc, this._config.preferPcma ?? true)

            pc.ontrack = (event) => {
                logDebug('[Reconnect] Remote track:', event.track.kind)
                this._media.remoteStream = event.streams[0] ?? new MediaStream([event.track])
                void this._tryPlayAudio()
            }
            pc.oniceconnectionstatechange = () => {
                logDebug('ICE state (reconnect):', pc.iceConnectionState)
                if (
                    pc.iceConnectionState === 'disconnected' ||
                    pc.iceConnectionState === 'failed'
                ) {
                    void this._restartIce(pc)
                }
            }
            pc.onicecandidate = (event) => {
                const candidate = event.candidate
                    ? {
                          candidate: event.candidate.candidate,
                          sdpMid: event.candidate.sdpMid,
                          sdpMLineIndex: event.candidate.sdpMLineIndex,
                      }
                    : { completed: true }
                // Janus-shaped trickle frame; see _initWebRTCGateway comment.
                this._webrtc.ws?.send(
                    JSON.stringify({
                        janus: 'trickle',
                        session_id: this._webrtc.gatewaySessionId,
                        handle_id: this._webrtc.gatewayHandleId,
                        candidate,
                        transaction: randomString(12),
                    }),
                )
            }

            const offer = await pc.createOffer({ offerToReceiveAudio: true })
            await pc.setLocalDescription(offer)

            const uri = `sip:webrtc@${state.telproDomain}`

            await this._sendGatewayRequest({
                janus: 'message',
                body: {
                    request: 'call',
                    uri,
                    headers: { 'X-Call-ID': state.sessionId },
                },
                jsep: { type: offer.type, sdp: offer.sdp },
            })

            this._setVoiceState({ calling: true })
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Unknown'
            logger.warn('Reconnect failed:', errMsg)
            this._setStatus(`Reconnect failed: ${errMsg}`)
            clearSessionState()
            this._cleanupMedia()
        }
    }

    private _cleanupMedia(): void {
        const m = this._media

        if (m.pc) {
            m.pc.close()
            m.pc = null
        }
        if (m.localStream) {
            m.localStream.getTracks().forEach((t) => t.stop())
            m.localStream = null
        }
        m.remoteStream = null
        if (m.remoteAudio) m.remoteAudio.srcObject = null
        if (m.localAudio) m.localAudio.srcObject = null

        m.pendingCandidates = []
        m.remoteDescriptionSet = false

        this._setVoiceState({ audioBlocked: false })
    }

    private _teardownWebRTC(): void {
        this._cleanupMedia()

        const gw = this._webrtc
        if (gw.keepAliveTimer) {
            clearInterval(gw.keepAliveTimer)
            gw.keepAliveTimer = null
        }
        if (gw.ws) {
            const ws = gw.ws
            gw.ws = null
            ws.onclose = null
            ws.close()
        }
        gw.gatewaySessionId = null
        gw.gatewayHandleId = null
        gw.transactions.clear()
        gw.initializing = false
        gw.initialized = false
        gw.initPromise = null

        this._setVoiceState({
            registered: false,
            inCall: false,
            calling: false,
            initialized: false,
        })
        this._setStatus('Disconnected')
    }

    /**
     * Send a request to the WebRTC gateway and resolve with its reply.
     * Wraps the gateway-specific transaction id / session id / handle id
     * fields so callers only have to specify the high-level intent.
     */
    private _sendGatewayRequest(msg: Record<string, unknown>): Promise<Record<string, unknown>> {
        return new Promise((resolve, reject) => {
            const ws = this._webrtc.ws
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebRTC gateway WebSocket not connected'))
                return
            }

            const transaction = randomString(12)
            const message: Record<string, unknown> = { ...msg, transaction }
            // `session_id` / `handle_id` are Janus protocol field names.
            if (this._webrtc.gatewaySessionId) {
                message['session_id'] = this._webrtc.gatewaySessionId
            }
            if (this._webrtc.gatewayHandleId) {
                message['handle_id'] = this._webrtc.gatewayHandleId
            }

            const timeout = setTimeout(() => {
                this._webrtc.transactions.delete(transaction)
                reject(new Error('WebRTC gateway transaction timeout'))
            }, 10_000)

            this._webrtc.transactions.set(transaction, (response) => {
                clearTimeout(timeout)
                this._webrtc.transactions.delete(transaction)
                if (response['janus'] === 'error') {
                    const err = response['error'] as Record<string, unknown> | undefined
                    reject(new Error(String(err?.['reason'] ?? err ?? 'WebRTC gateway error')))
                } else {
                    resolve(response)
                }
            })

            logDebug('Sending to WebRTC gateway:', message)
            ws.send(JSON.stringify(message))
        })
    }

    private _handleGatewayMessage(msg: Record<string, unknown>): void {
        logDebug('WebRTC gateway message:', msg)

        const transaction = msg['transaction'] as string | undefined
        if (transaction && this._webrtc.transactions.has(transaction)) {
            this._webrtc.transactions.get(transaction)!(msg)
            return
        }

        // Janus envelope discriminator: top-level `janus` field.
        const eventType = msg['janus'] as string
        switch (eventType) {
            case 'event': {
                const plugindata = msg['plugindata'] as Record<string, unknown> | undefined
                if (plugindata?.['data']) {
                    this._handleSipEvent(
                        plugindata['data'] as Record<string, unknown>,
                        msg['jsep'] as { type: string; sdp?: string } | undefined,
                    )
                }
                break
            }
            case 'trickle': {
                const candidate = msg['candidate'] as Record<string, unknown> | null
                this._handleRemoteTrickle(candidate)
                break
            }
            case 'webrtcup':
                logDebug('WebRTC connection up')
                break
            case 'hangup':
                logDebug('Gateway hangup')
                this._handleVoiceHangup()
                break
            case 'detached':
                this._webrtc.gatewayHandleId = null
                break
            case 'error': {
                const err = msg['error'] as Record<string, unknown> | undefined
                const errMsg = String(err?.['reason'] ?? 'Unknown WebRTC gateway error')
                logDebug('Gateway error event:', errMsg)
                if (errMsg.includes('No such session')) {
                    logger.warn('Gateway session lost, tearing down to trigger reconnect')
                    this._teardownWebRTC()
                }
                break
            }
        }
    }

    private _handleSipEvent(
        data: Record<string, unknown>,
        jsep?: { type: string; sdp?: string },
    ): void {
        const result = data['result'] as Record<string, unknown> | undefined
        const event = result?.['event'] ?? (data['sip'] !== 'event' ? data['sip'] : undefined)

        logDebug('SIP event:', event, data)

        switch (event) {
            case 'registering':
                this._setStatus('Registering…')
                break
            case 'registered':
                this._setVoiceState({ registered: true })
                this._setStatus('Connected')
                if (this._pendingReconnect) {
                    const reconnectState = this._pendingReconnect
                    setTimeout(() => void this.reconnectCall(reconnectState), 0)
                } else if (this._state.voiceCall.autoDialPending) {
                    this._setVoiceState({ autoDialPending: false })
                    setTimeout(() => void this._dial(), 0)
                }
                break
            case 'registration_failed':
                this._setVoiceState({ registered: false })
                this._setStatus(`Registration failed: ${String(result?.['reason'] ?? 'Unknown')}`)
                this._pendingReconnect = null
                clearSessionState()
                break
            case 'calling':
                this._setVoiceState({ calling: true })
                this._setStatus('Calling…')
                break
            case 'ringing':
                this._setStatus('Ringing…')
                break
            case 'progress':
                this._setStatus('Connecting…')
                if (jsep) void this._handleRemoteJsep(jsep)
                break
            case 'accepted':
                this._setVoiceState({ inCall: true, calling: false })
                this._setStatus('In Call')
                if (jsep) void this._handleRemoteJsep(jsep)
                break
            case 'hangup':
            case 'declining':
            case 'missed':
                logDebug('SIP call ended:', event)
                this._handleVoiceHangup()
                break
        }
    }

    private async _handleRemoteJsep(jsep: { type: string; sdp?: string }): Promise<void> {
        const pc = this._media.pc
        if (!pc) return

        try {
            logDebug('Setting remote description:', jsep.type)
            await pc.setRemoteDescription({
                type: jsep.type as RTCSdpType,
                sdp: jsep.sdp ? sanitizeSdpIceCredentials(jsep.sdp) : jsep.sdp,
            })
            this._media.remoteDescriptionSet = true

            const pending = this._media.pendingCandidates
            if (pending.length > 0) {
                logDebug(`Flushing ${pending.length} queued ICE candidates`)
                this._media.pendingCandidates = []
                for (const c of pending) {
                    await this._addIceCandidate(c)
                }
            }
        } catch (e) {
            logger.error('Error setting remote description:', e)
        }
    }

    private _handleRemoteTrickle(candidate: Record<string, unknown> | null): void {
        if (!this._media.remoteDescriptionSet) {
            logDebug('Queuing ICE candidate (no remote description yet)')
            this._media.pendingCandidates.push(candidate)
            return
        }
        void this._addIceCandidate(candidate)
    }

    private async _addIceCandidate(candidate: Record<string, unknown> | null): Promise<void> {
        const pc = this._media.pc
        if (!pc) return

        try {
            if (candidate && !candidate['completed']) {
                logDebug('Adding remote ICE candidate:', candidate)
                await pc.addIceCandidate({
                    candidate: candidate['candidate'] as string,
                    sdpMid: candidate['sdpMid'] as string | null,
                    sdpMLineIndex: candidate['sdpMLineIndex'] as number | null,
                })
            } else {
                logDebug('Remote ICE gathering complete')
            }
        } catch (e) {
            logger.error('Error adding ICE candidate:', e)
        }
    }

    /**
     * Attempt to play the buffered remote stream on the wired-up audio
     * element. If the element hasn't mounted yet (common race in React
     * trees that lazy-render the phone UI), poll up to 10 times at 1s
     * intervals before giving up.
     */
    private async _tryPlayAudio(retries = 10): Promise<void> {
        const audio = this._media.remoteAudio
        const stream = this._media.remoteStream

        if (!audio || !stream) {
            if (retries > 0 && stream) {
                logDebug(`Audio element not mounted yet, retrying… (${retries} left)`)
                setTimeout(() => void this._tryPlayAudio(retries - 1), 1000)
                return
            }
            if (!stream) logDebug('No remote stream buffered, nothing to play')
            else logDebug('Audio element never mounted, giving up')
            return
        }

        if (audio.srcObject !== stream) {
            audio.srcObject = stream
        }

        try {
            await audio.play()
            logDebug('Audio playback started')
            this._setVoiceState({ audioBlocked: false })
        } catch (error) {
            if (error instanceof Error && error.name === 'NotAllowedError') {
                logDebug('Audio blocked — needs user interaction')
                this._setVoiceState({ audioBlocked: true })
            } else if (error instanceof Error && error.name === 'AbortError') {
                // Fired when a newer srcObject assignment supersedes the
                // pending play(). Safe to ignore — the next call wins.
                logDebug('Audio playback interrupted by a new stream load')
            } else {
                logger.error('Audio playback failed:', error)
            }
        }
    }

    private _handleVoiceHangup(): void {
        this._setVoiceState({
            inCall: false,
            calling: false,
            sessionId: null,
            endpointId: '',
            endpointName: '',
            appName: '',
            registered: false,
            initialized: false,
            autoDialPending: false,
            telproDomain: null,
            webrtcGatewayUrl: null,
            dtmfDigits: '',
            reconnecting: false,
            audioBlocked: false,
        })
        this._setStatus('Disconnected')
        this._cleanupMedia()
        clearSessionState()
    }

    // -------------------------------------------------------------------------
    // Persisted-state TTL refresher (voice calls only)
    // -------------------------------------------------------------------------

    private _startSessionStateTimer(): void {
        if (this._sessionStateTimer) return
        this._sessionStateTimer = setInterval(() => {
            if (this._state.voiceCall.inCall || this._state.voiceCall.calling) {
                const currentState = loadSessionState()
                if (currentState) {
                    saveSessionState({ ...currentState, startedAt: Date.now() })
                }
            }
        }, 5_000)
    }

    private _stopSessionStateTimer(): void {
        if (this._sessionStateTimer) {
            clearInterval(this._sessionStateTimer)
            this._sessionStateTimer = null
        }
    }

    // -------------------------------------------------------------------------
    // State helpers
    // -------------------------------------------------------------------------

    private _setState(patch: Partial<DelphiClientState>): void {
        this._state = { ...this._state, ...patch }
        this._listeners.forEach((l) => l())
    }

    private _setVoiceState(patch: Partial<DelphiClientState['voiceCall']>): void {
        this._setState({ voiceCall: { ...this._state.voiceCall, ...patch } })
    }

    private _setStatus(status: string): void {
        this._setState({ status })
    }

    private _initialState(): DelphiClientState {
        return {
            voiceCall: {
                sessionId: null,
                endpointId: '',
                endpointName: '',
                appName: '',
                registered: false,
                calling: false,
                inCall: false,
                initialized: false,
                reconnecting: false,
                autoDialPending: false,
                telproDomain: null,
                webrtcGatewayUrl: null,
                dtmfDigits: '',
                audioBlocked: false,
            },
            status: 'Disconnected',
            sessions: [],
            selectedText: '',
        }
    }

    private _initialWebRTCRefs(): WebRTCGatewayRefs {
        return {
            ws: null,
            gatewaySessionId: null,
            gatewayHandleId: null,
            transactions: new Map(),
            keepAliveTimer: null,
            initializing: false,
            initialized: false,
            initPromise: null,
        }
    }

    private _initialMediaRefs(): MediaRefs {
        return {
            pc: null,
            localStream: null,
            remoteStream: null,
            remoteAudio: null,
            localAudio: null,
            pendingCandidates: [],
            remoteDescriptionSet: false,
        }
    }
}
