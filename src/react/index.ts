// =============================================================================
// @ki-kombinat/delphi-client-js-sdk/react — React bindings
// Peer dependency: react >=18
// =============================================================================

// ── Context / Provider ────────────────────────────────────────────────────────
export { DelphiClientProvider, useDelphiClientContext } from './context'
export type { DelphiClientProviderProps } from './context'

// ── Hooks ─────────────────────────────────────────────────────────────────────
export { useDelphiClientState, useDelphiClient } from './useDelphiClient'
export { useDelphiSession } from './useDelphiSession'
export type { UseDelphiSessionOptions, UseDelphiSessionReturn } from './useDelphiSession'
export { useBrowserAction } from './useBrowserAction'
export type { ExecuteBrowserActionOptions, BrowserActionHandler } from '../core/browserActions'
export { useSelectionTracking } from './useSelectionTracking'

// ── Components ────────────────────────────────────────────────────────────────
export { DelphiConfigInit } from './DelphiConfigInit'

// ── Re-export core types that React consumers commonly need ───────────────────
export type { DelphiClientState } from '../core/DelphiClient'

export type {
    SessionConnectionState,
    ActionHandler,
    MessageHandler,
    ActionResult,
    SyncActionResult,
    AsyncActionResult,
    BrowserAudioEvent,
} from '../core/SessionClient'

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
    DelphiPhoneProps,
} from '../core/types'

export type {
    ChannelMessage,
    ChatPayload,
    StatusPayload,
    ControlPayload,
    ActionPayload,
    BrowserActionPayload,
    AudioPayload,
    ResponseMode,
    BrowserContext,
    BrowserSelectionContext,
} from '../core/channelTypes'
