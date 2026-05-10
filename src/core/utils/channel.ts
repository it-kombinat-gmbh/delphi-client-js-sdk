import type {
    BrowserContext,
    BrowserSelectionContext,
    ChannelMessage,
    MessageDirection,
    MessageRole,
    ControlCommand,
    ControlPayload,
    ResponseMode,
    StatusState,
    ActionPriority,
    ChannelMessageType,
    BrowserActionPayload,
    AudioPayload,
} from '../channelTypes'

// =============================================================================
// Message Builder Helpers
// =============================================================================

/** Create a unique message ID */
export function createMessageId(): string {
    return crypto.randomUUID()
}

/** Create a base message skeleton (without payload fields) */
export function createBaseMessage(
    type: ChannelMessageType,
    sessionId: string,
    direction: MessageDirection,
): Omit<
    ChannelMessage,
    | 'chat'
    | 'browserAction'
    | 'action'
    | 'actionResult'
    | 'audio'
    | 'status'
    | 'reconnect'
    | 'error'
    | 'control'
> {
    return {
        type,
        sessionId,
        messageId: createMessageId(),
        timestamp: Date.now(),
        direction,
    }
}

/** Create a browser-originated capability trigger (Browser → Runtime) */
export function createBrowserActionMessage(
    sessionId: string,
    payload: BrowserActionPayload,
): ChannelMessage {
    return {
        ...createBaseMessage('browser_action', sessionId, 'to_ari'),
        browserAction: payload,
    }
}

/** Create a playable audio message (Runtime → Browser) */
export function createAudioMessage(sessionId: string, payload: AudioPayload): ChannelMessage {
    return {
        ...createBaseMessage('audio', sessionId, 'to_browser'),
        audio: payload,
    }
}

/** Create a chat message */
export function createChatMessage(
    sessionId: string,
    direction: MessageDirection,
    role: MessageRole,
    content: string,
    metadata?: Record<string, unknown>,
): ChannelMessage {
    return {
        ...createBaseMessage('chat', sessionId, direction),
        chat: { role, content, metadata },
    }
}

/** Create a browser-side action request (ARI → Browser) */
export function createActionMessage(
    sessionId: string,
    name: string,
    parameters: Record<string, unknown>,
    options: {
        requiresResponse?: boolean
        timeoutMs?: number
        priority?: ActionPriority
        description?: string
    } = {},
): ChannelMessage {
    return {
        ...createBaseMessage('action', sessionId, 'to_browser'),
        action: {
            actionId: createMessageId(),
            name,
            parameters,
            requiresResponse: options.requiresResponse ?? true,
            timeoutMs: options.timeoutMs,
            priority: options.priority,
            description: options.description,
        },
    }
}

/** Create a synchronous action result (Browser → ARI) */
export function createActionResultMessage(
    sessionId: string,
    actionId: string,
    success: boolean,
    options: { data?: unknown; error?: string; durationMs?: number } = {},
): ChannelMessage {
    return {
        ...createBaseMessage('action_result', sessionId, 'to_ari'),
        actionResult: {
            actionId,
            success,
            data: options.data,
            error: options.error,
            durationMs: options.durationMs,
            isFinal: true,
        },
    }
}

/** Create an async action acknowledgment (action received, will process) */
export function createActionAckMessage(
    sessionId: string,
    actionId: string,
    status: 'received' | 'executing' = 'received',
): ChannelMessage {
    return {
        ...createBaseMessage('action_result', sessionId, 'to_ari'),
        actionResult: {
            actionId,
            status,
            success: true,
            isFinal: false,
        },
    }
}

/** Create an async action completion message (final result) */
export function createAsyncActionResultMessage(
    sessionId: string,
    actionId: string,
    success: boolean,
    options: { data?: unknown; error?: string; durationMs?: number } = {},
): ChannelMessage {
    return {
        ...createBaseMessage('action_result', sessionId, 'to_ari'),
        actionResult: {
            actionId,
            status: success ? 'completed' : 'failed',
            success,
            data: options.data,
            error: options.error,
            durationMs: options.durationMs,
            isFinal: true,
        },
    }
}

/** Create a chat message that references an action (for async updates via chat flow) */
export function createActionUpdateChatMessage(
    sessionId: string,
    actionId: string,
    content: string,
    metadata?: Record<string, unknown>,
): ChannelMessage {
    return {
        ...createBaseMessage('chat', sessionId, 'to_ari'),
        chat: {
            role: 'user',
            content,
            intent: 'action_update',
            relatedActionId: actionId,
            metadata,
        },
    }
}

/** Create a status message */
export function createStatusMessage(
    sessionId: string,
    direction: MessageDirection,
    state: StatusState,
    metadata?: Record<string, unknown>,
): ChannelMessage {
    return {
        ...createBaseMessage('status', sessionId, direction),
        status: { state, metadata },
    }
}

/** Create an error message */
export function createErrorMessage(
    sessionId: string,
    direction: MessageDirection,
    code: string,
    message: string,
    details?: unknown,
): ChannelMessage {
    return {
        ...createBaseMessage('error', sessionId, direction),
        error: { code, message, details },
    }
}

/** Create a reconnect request message */
export function createReconnectMessage(
    sessionId: string,
    lastReceivedStreamId?: string,
    sessionData?: Record<string, unknown>,
): ChannelMessage {
    return {
        ...createBaseMessage('reconnect', sessionId, 'to_ari'),
        reconnect: { lastReceivedMessageId: lastReceivedStreamId, sessionData },
    }
}

/** Create a control message (Browser → ARI) */
export function createControlMessage(
    sessionId: string,
    command: ControlCommand,
    settings?: ControlPayload['settings'],
    metadata?: Record<string, unknown>,
): ChannelMessage {
    return {
        ...createBaseMessage('control', sessionId, 'to_ari'),
        control: { command, settings, metadata },
    }
}

/** Create an enable-text-chat control message */
export function createEnableTextChatMessage(
    sessionId: string,
    responseMode: ResponseMode = 'text',
): ChannelMessage {
    return createControlMessage(sessionId, 'enable_text_chat', { responseMode })
}

/** Create a disable-text-chat control message */
export function createDisableTextChatMessage(sessionId: string): ChannelMessage {
    return createControlMessage(sessionId, 'disable_text_chat')
}

/**
 * Create a set-response-mode control message.
 * Switches the AI's output modality between voice and text-only (Option A).
 *
 * `'text'`  — AI responds with text only (no audio output); user can still speak.
 * `'voice'` — AI responds with audio (normal realtime mode).
 * `'both'`  — AI responds with both audio and text simultaneously.
 */
export function createSetResponseModeMessage(
    sessionId: string,
    responseMode: ResponseMode,
): ChannelMessage {
    return createControlMessage(sessionId, 'set_response_mode', { responseMode })
}

/**
 * Create a context-only update — no AI response expected.
 * Use for: async action completed, background state changes.
 */
export function createContextUpdateMessage(
    sessionId: string,
    content: string,
    metadata?: Record<string, unknown>,
): ChannelMessage {
    return {
        ...createBaseMessage('chat', sessionId, 'to_ari'),
        chat: {
            role: 'user',
            content,
            intent: 'context_update',
            responseExpected: false,
            metadata,
        },
    }
}

/**
 * Create a browser-selection context update — no AI response expected.
 * Convenience wrapper that defaults `source` to `'selection'`.
 */
export function createBrowserSelectionContextMessage(
    sessionId: string,
    selection: BrowserSelectionContext,
): ChannelMessage {
    return createBrowserContextMessage(sessionId, {
        ...selection,
        source: selection.source ?? 'selection',
    })
}

/**
 * Create a browser context update — no AI response expected.
 * Use for durable browser state such as current page context or selected text.
 */
export function createBrowserContextMessage(
    sessionId: string,
    browserContext: BrowserContext,
): ChannelMessage {
    return {
        ...createBaseMessage('chat', sessionId, 'to_ari'),
        chat: {
            role: 'user',
            content: browserContext.text ?? browserContext.identifier ?? '',
            intent: 'browser_context',
            responseExpected: false,
            metadata: {
                browserContext,
            },
        },
    }
}

/**
 * Create a text chat message — expects a TEXT response from AI.
 * Use for: active text conversation.
 */
export function createTextChatMessage(
    sessionId: string,
    content: string,
    metadata?: Record<string, unknown>,
): ChannelMessage {
    return {
        ...createBaseMessage('chat', sessionId, 'to_ari'),
        chat: {
            role: 'user',
            content,
            intent: 'conversation',
            responseExpected: true,
            metadata,
        },
    }
}

/**
 * Create a read-aloud request — expects a VOICE response from AI.
 * Use for: user highlighted text, wants AI to read it back.
 */
export function createReadAloudMessage(
    sessionId: string,
    content: string,
    metadata?: Record<string, unknown>,
): ChannelMessage {
    return {
        ...createBaseMessage('chat', sessionId, 'to_ari'),
        chat: {
            role: 'user',
            content,
            intent: 'read_aloud',
            responseExpected: true,
            preferredResponse: 'voice',
            metadata,
        },
    }
}

/** Create a keepalive ping message */
export function createPingMessage(sessionId: string): ChannelMessage {
    return createBaseMessage('ping', sessionId, 'to_ari') as ChannelMessage
}

/** Create a keepalive pong message */
export function createPongMessage(sessionId: string): ChannelMessage {
    return createBaseMessage('pong', sessionId, 'to_browser') as ChannelMessage
}
