// =============================================================================
// @ki-kombinat/delphi-client-js-sdk — Core (headless, zero runtime dependencies)
// =============================================================================

// ── Top-level orchestrator ───────────────────────────────────────────────────
export {
    CapabilityNotSupportedError,
    ReadAloudCapabilityNotFoundError,
    DelphiClient,
} from './DelphiClient'
export type { DelphiClientState } from './DelphiClient'

// ── Realtime session client ──────────────────────────────────────────────────
export { SessionClient } from './SessionClient'
export type {
    SessionState,
    SessionOptions,
    SessionConnectionState,
    ActionResult,
    SyncActionResult,
    AsyncActionResult,
    ActionHandler,
    MessageHandler,
    BrowserAudioEvent,
} from './SessionClient'

// ── Browser actions (pure function — no React) ────────────────────────────────
export { executeBrowserAction } from './browserActions'
export type {
    BrowserActionResult,
    BrowserActionSyncResult,
    BrowserActionAsyncResult,
    BrowserActionHandler,
    BrowserActionName,
    CustomBrowserActionParameters,
    ExecuteBrowserActionOptions,
    NavigateActionParameters,
    NavigateCallback,
    ShowAlertActionParameters,
} from './browserActions'

// ── Types ────────────────────────────────────────────────────────────────────
export type {
    DelphiConfig,
    SessionMode,
    IceServer,
    Logger,
    PersistedSessionState,
    SessionTokenResponse,
    OpenSessionOptions,
    StartCallOptions,
    ReadAloudOptions,
    RuntimeCapabilities,
    RuntimeInteractionMode,
    RuntimeTransport,
    RuntimeMigration,
    DelphiPhoneProps,
} from './types'

// ── Channel message types ────────────────────────────────────────────────────
export type {
    ChannelMessage,
    ChannelMessageType,
    MessageDirection,
    MessageRole,
    StatusState,
    ActionPriority,
    ActionStatus,
    ControlCommand,
    ResponseMode,
    BrowserContext,
    BrowserSelectionContext,
    ChatPayload,
    ControlPayload,
    ActionPayload,
    ActionResultPayload,
    BrowserActionPayload,
    AudioPayload,
    StatusPayload,
    ReconnectPayload,
    ErrorPayload,
    WsTokenPayload,
    WsRefreshPayload,
} from './channelTypes'

export {
    StandardActions,
    getToAriChannel,
    getToBrowserChannel,
    getChannelStream,
} from './channelTypes'
export type { StandardActionName } from './channelTypes'

// ── Message builders ─────────────────────────────────────────────────────────
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
} from './utils/channel'

// ── Utilities ────────────────────────────────────────────────────────────────
export {
    logger,
    logDebug,
    setLogger,
    playDtmfTone,
    setAudioCodecPreferences,
    SESSION_STATE_STORAGE_KEY,
    DTMF_FREQUENCIES,
    saveSessionState,
    loadSessionState,
    clearSessionState,
    randomString,
} from './utils'
