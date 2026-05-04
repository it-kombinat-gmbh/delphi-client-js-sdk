/**
 * Channel Types
 *
 * Shared types for bidirectional communication between:
 * Browser (WebRTC Phone) <-> TelAPI (WS Gateway) <-> TelPhi (ARI / AI)
 *
 * ## Two Communication Flows
 *
 * ### Flow A – Tool Call Actions (AI-initiated)
 * AI tool call → telphi → redis stream → telapi → browser
 *                                                     ↓
 * AI receives result ← telphi ← redis stream ← telapi ← browser executes
 *
 * ### Flow B – Text Chat (Browser-initiated, on-demand)
 * Browser: control { enable_text_chat }
 *     ↓
 * User types → chat → AI processes → AI responds via TEXT
 *     ↓
 * Browser: control { disable_text_chat }
 */

// =============================================================================
// Primitive channel types
// =============================================================================

export type ChannelMessageType =
    | 'chat' // Text messages (bidirectional)
    | 'browser_action' // Browser-originated capability trigger
    | 'action' // AI requests browser to do something
    | 'action_result' // Browser reports action completion → AI context
    | 'audio' // Runtime streams playable audio to the browser
    | 'status' // Call / connection status updates
    | 'control' // Session control (text chat enable / disable)
    | 'reconnect' // Reconnection handshake
    | 'ping' // Keepalive
    | 'pong' // Keepalive response
    | 'error' // Error notification

export type MessageDirection = 'to_browser' | 'to_ari'
export type MessageRole = 'user' | 'assistant' | 'system'

export type StatusState =
    | 'connected'
    | 'reconnecting'
    | 'disconnected'
    | 'call_active'
    | 'call_ended'
    | 'call_hold'
    | 'call_resumed'
    | 'text_chat_enabled'
    | 'text_chat_disabled'
    | 'response_mode_changed'

export type ActionPriority = 'high' | 'normal' | 'low'

export type ControlCommand =
    | 'enable_text_chat'
    | 'disable_text_chat'
    | 'request_context'
    | 'clear_context'
    /** Switch the AI response output modality (voice ↔ text-only / Option A) */
    | 'set_response_mode'

/** How the AI should respond to messages */
export type ResponseMode = 'voice' | 'text' | 'both'

// =============================================================================
// Payload interfaces
// =============================================================================

/**
 * Chat message payload (bidirectional).
 *
 * Browser → ARI: only processed by AI if text_chat is enabled,
 * or if `responseExpected` is explicitly set.
 *
 * ARI → Browser: always delivered.
 */
export interface ChatPayload {
    role: MessageRole
    content: string
    intent?:
        | 'conversation'
        | 'notification'
        | 'context_update'
        | 'browser_context'
        | 'action_update'
        | 'read_aloud'
    /**
     * When `true` — AI MUST respond (overrides textChatEnabled state).
     * When `false` — AI should NOT respond (context update only).
     * When `undefined` — follow default rules.
     */
    responseExpected?: boolean
    /**
     * If `responseExpected` is true, which channel should AI use to respond?
     */
    preferredResponse?: ResponseMode
    /** Correlates an async action update to the original action */
    relatedActionId?: string
    metadata?: Record<string, unknown>
}

export interface BrowserContext {
    text: string
    source?: string
    url?: string
    title?: string
    metadata?: Record<string, unknown>
}

export type BrowserSelectionContext = BrowserContext

/** Control message payload (Browser → ARI) */
export interface ControlPayload {
    command: ControlCommand
    settings?: {
        responseMode?: ResponseMode
        sessionTimeout?: number
    }
    metadata?: Record<string, unknown>
}

/** Action request payload (ARI → Browser) */
export interface ActionPayload {
    actionId: string
    /** Action name, e.g. `navigate`, `fill_form` */
    name: string
    parameters: Record<string, unknown>
    requiresResponse: boolean
    timeoutMs?: number
    priority?: ActionPriority
    description?: string
}

export type ActionStatus = 'received' | 'executing' | 'completed' | 'failed'

/**
 * Action result payload (Browser → ARI).
 * Supports both synchronous and asynchronous actions.
 */
export interface ActionResultPayload {
    actionId: string
    status?: ActionStatus
    success: boolean
    data?: unknown
    error?: string
    durationMs?: number
    /** `true` means the action is complete (no more updates expected) */
    isFinal?: boolean
}

export interface BrowserActionPayload {
    messageType: string
    /** Optional; when omitted, the runtime may resolve the first matching capability. */
    capabilityId?: string
    capabilitySlug?: string
    identifier?: string
    text?: string
    url?: string
    title?: string
    data?: Record<string, unknown>
}

export interface AudioPayload {
    event: 'start' | 'delta' | 'done'
    delta?: string
    mimeType?: string
    responseId?: string
    index?: number
    metadata?: Record<string, unknown>
}

/** Status update payload (bidirectional) */
export interface StatusPayload {
    state: StatusState
    metadata?: Record<string, unknown>
}

/** Reconnection handshake payload */
export interface ReconnectPayload {
    lastReceivedMessageId?: string
    sessionData?: Record<string, unknown>
}

/** Error payload */
export interface ErrorPayload {
    code: string
    message: string
    details?: unknown
}

// =============================================================================
// Main message interface
// =============================================================================

/**
 * Channel message envelope.
 * All messages between browser ↔ telapi ↔ telphi follow this structure.
 */
export interface ChannelMessage {
    type: ChannelMessageType
    /** Server-issued session ID. Carries every message on the wire. */
    sessionId: string
    messageId: string
    /** Redis Stream entry id for replayable runtime-to-browser messages. */
    streamId?: string
    timestamp: number
    direction: MessageDirection

    chat?: ChatPayload
    browserAction?: BrowserActionPayload
    action?: ActionPayload
    actionResult?: ActionResultPayload
    audio?: AudioPayload
    status?: StatusPayload
    control?: ControlPayload
    reconnect?: ReconnectPayload
    error?: ErrorPayload
}

// =============================================================================
// WebSocket token types
// =============================================================================

/** JWT payload for WebSocket authentication */
export interface WsTokenPayload {
    sessionId: string
    endpointId: string
    teamId: string
    iat: number
    exp: number
    sub: 'ws_token'
}

export interface WsRefreshPayload extends WsTokenPayload {
    refreshable: boolean
    originalIat: number
}

// =============================================================================
// Redis channel key helpers
// =============================================================================

export function getToAriChannel(sessionId: string): string {
    return `voiceai:channel:${sessionId}:to_ari`
}

export function getToBrowserChannel(sessionId: string): string {
    return `voiceai:channel:${sessionId}:to_browser`
}

export function getChannelStream(sessionId: string): string {
    return `voiceai:stream:${sessionId}`
}

// =============================================================================
// Standard action names
// =============================================================================

/** Standard action names the browser should handle */
export const StandardActions = {
    FILL_FORM: 'fill_form',
    CLICK_ELEMENT: 'click_element',
    NAVIGATE: 'navigate',
    NAVIGATE_CURRENT: 'navigate_current',
    SHOW_ALERT: 'show_alert',
    SHOW_CONFIRM: 'show_confirm',
    SHOW_PROMPT: 'show_prompt',
    SHOW_NOTIFICATION: 'show_notification',
    OPEN_MODAL: 'open_modal',
    CLOSE_MODAL: 'close_modal',
    SCROLL_TO: 'scroll_to',
    SET_STORAGE: 'set_storage',
    GET_STORAGE: 'get_storage',
    DOWNLOAD_FILE: 'download_file',
    COPY_TO_CLIPBOARD: 'copy_to_clipboard',
    PLAY_AUDIO: 'play_audio',
    STOP_AUDIO: 'stop_audio',
    CUSTOM: 'custom',
} as const

export type StandardActionName = (typeof StandardActions)[keyof typeof StandardActions]
