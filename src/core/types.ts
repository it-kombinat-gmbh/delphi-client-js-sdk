// =========================================================================
// Shared primitive types
// =========================================================================

import type { BrowserContext } from './channelTypes'

export type IceServer = {
    urls: string | string[]
    username?: string
    credential?: string
}

/**
 * Logger interface for SDK log output.
 * Matches the `console` subset used by the SDK.
 */
export interface Logger {
    debug: (...args: unknown[]) => void
    info: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
}

// =========================================================================
// Session modes
// =========================================================================

/**
 * The kind of interaction a session is opened for.
 *
 * - `text` — text chat only; no audio.
 * - `audio_playback` — runtime streams TTS audio back to the browser
 *   over the channel. No microphone, no SIP leg.
 * - `voice_conversation` — full WebRTC two-way voice call (gateway + SIP leg).
 *   Audio is delivered via the SIP leg, not over the channel.
 * - `browser_actions` — pure BOA dispatch (no AI conversation).
 * - `listen` — subscribe to a TelPhi-produced interpretation stream.
 */
export type SessionMode =
    | 'text'
    | 'audio_playback'
    | 'voice_conversation'
    | 'browser_actions'
    | 'listen'

// =========================================================================
// Config
// =========================================================================

/**
 * Configuration object for the Delphi client.
 * Pass this once when constructing `DelphiClient` or via `<DelphiClientProvider config={…}>`.
 */
export interface DelphiConfig {
    /** TelAPI domain (e.g. `api.example.com`) — used for REST + WebSocket URLs */
    apiDomain?: string
    /** API key for authenticating session-token requests */
    apiKey?: string
    /** Optional same-origin proxy endpoint for session-token requests */
    sessionTokenUrl?: string
    /** Optional same-origin proxy endpoint for runtime capability discovery */
    runtimeCapabilitiesUrl?: string
    /**
     * Prefer PCMA (G.711 A-law) over Opus when negotiating the SIP leg.
     * Skips transcoding on the WebRTC gateway / RTP engine.
     * @default true
     */
    preferPcma?: boolean
    /**
     * If set and non-empty, used as the full ICE server list for `RTCPeerConnection`.
     * If omitted or empty, STUN/TURN URLs are built from the session token's
     * `telproDomain` (host `telproDomain`, port 3478) plus `turnUsername`
     * and `turnCredential`.
     */
    iceServers?: IceServer[]
    /** TURN long-term username when ICE is auto-derived from `telproDomain` (coturn static-auth) */
    turnUsername?: string
    /** TURN long-term password when ICE is auto-derived from `telproDomain` */
    turnCredential?: string
    /**
     * Idle timeout (ms) for non-voice sessions. The clock resets on every
     * outbound send and every inbound message. Voice sessions ignore this.
     *
     * Set to `0` to disable.
     * @default 300_000  (5 minutes)
     */
    sessionIdleTimeoutMs?: number
    /** Custom logger — defaults to `console` */
    logger?: Logger
}

// =========================================================================
// Session lifecycle types
// =========================================================================

/** Session state persisted to `sessionStorage` for reconnect-after-reload */
export interface PersistedSessionState {
    sessionId: string
    endpointId: string
    mode: SessionMode
    endpointName?: string
    appName?: string
    /** Unix timestamp — used to detect stale sessions */
    startedAt: number
    /** WebSocket token */
    wsToken?: string
    /** TelPro domain for WebRTC voice sessions (gateway / TURN / STUN host) */
    telproDomain?: string
    /**
     * WebSocket URL to the WebRTC gateway, captured from the session token
     * response. Persisted so reconnect-after-reload doesn't need a fresh
     * token round-trip.
     */
    webrtcGatewayUrl?: string
}

/** Response from the session-token API */
export interface SessionTokenResponse {
    sessionId: string
    wsToken: string
    /** WS token TTL in seconds */
    wsTokenExpiresIn: number
    /** Session TTL in seconds */
    expiresIn: number
    /** TelPro domain for voice_conversation sessions (omitted for non-voice) */
    telproDomain?: string
    /**
     * WebSocket URL to the WebRTC gateway used for the SIP/audio leg.
     *
     * Required for `mode === 'voice_conversation'`; omitted for other
     * modes. Routing the URL through the token response (rather than
     * requiring the SDK consumer to configure it) lets the server pick
     * the gateway per session — useful for region routing, A/B tests,
     * and gateway swaps without any client-side change.
     *
     * The current backend implementation speaks the Janus API; the field
     * name is intentionally gateway-agnostic so the underlying transport
     * can be swapped without an SDK or wire-format rename.
     *
     * @example `wss://gateway.example.com`
     */
    webrtcGatewayUrl?: string
}

/** Parameters for opening a session */
export interface OpenSessionOptions {
    endpointId: string
    /** Defaults to `'audio_playback'` for `delphi.readAloud`, must be supplied explicitly otherwise. */
    mode: SessionMode
    endpointName?: string
    appName?: string
}

/**
 * Parameters for `delphi.readAloud()`. The endpoint is required; everything
 * else has a sensible default.
 */
export interface ReadAloudOptions {
    endpointId: string
    /** Optional metadata forwarded to the runtime alongside the read-aloud action */
    metadata?: Record<string, unknown>
    /** Optional explicit BOA capability id; if omitted, the server picks. */
    capabilityId?: string
    /** Optional disambiguator when multiple read-aloud capabilities exist on the same endpoint */
    identifier?: string
    /** Per-call override of the message-type used to trigger the read-aloud BOA */
    messageType?: string
    /** Cancellation signal */
    signal?: AbortSignal
    /** Override the default audio playback (the SDK plays via `new Audio()` by default). */
    onAudio?: (event: import('./SessionClient').BrowserAudioEvent) => void
    /** If `true`, the SDK will not play audio internally even when `onAudio` is omitted. */
    disableAutoPlay?: boolean
}

export interface ListenOptions {
    endpointId: string
    identifier: string
    targetLanguage: string
    scope?: string
    startMode?: 'live' | 'from_beginning' | 'from_sequence' | 'closest_to_now'
    sinceStreamId?: string
    latencyOffsetMs?: number
    includeCaptions?: boolean
    capabilityId?: string
    capabilitySlug?: string
    messageType?: string
}

/** Parameters for `delphi.startCall()` (voice_conversation session + WebRTC). */
export interface StartCallOptions {
    endpointId: string
    endpointName?: string
    appName?: string
    /**
     * Context sent on the session channel before auto-dial starts. Useful for
     * flows that need identifiers/roles when the SIP leg enters TelPhi.
     */
    browserContext?: BrowserContext
    /** If `true`, dial as soon as the SIP plugin reports `registered`. Default `false`. */
    autoDial?: boolean
}

export type RuntimeInteractionMode = SessionMode

export type RuntimeTransport = 'rest' | 'websocket' | 'existing_media' | 'webrtc'

export type RuntimeMigration = 'text_to_voice' | 'api_to_media'

export interface RuntimeCapabilities {
    endpointId: string
    flowDefinitionId: string | null
    runtime: {
        sessionContinuity: 'supported'
        migration: RuntimeMigration[]
    }
    interactionModes: Record<RuntimeInteractionMode, boolean>
    transports: {
        preferred: RuntimeTransport[]
        available: RuntimeTransport[]
    }
    flows: {
        entryPoints: Array<'phone' | 'web_voice' | 'web_chat'>
        responseModes: Array<'audio_stream' | 'text_stream' | 'json' | 'none'>
        sideFlows: Array<{
            id: string
            name?: string
            triggerType: string
            messageType?: string
        }>
        browserActions: Array<{
            id: string
            slug: string
            label: string
            type: 'readAloud' | 'transformAndRead' | 'listen'
            messageType: string
            voiceInvocable: boolean
        }>
    }
}

// =========================================================================
// Component / hook prop types
// =========================================================================

export interface DelphiPhoneProps {
    /** Optional SPA-router callback; falls back to the History API when omitted */
    onNavigate?: (path: string) => void
}
