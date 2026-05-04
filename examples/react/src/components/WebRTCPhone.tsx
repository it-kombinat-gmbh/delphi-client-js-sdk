import { useEffect, useCallback, useState, useSyncExternalStore } from 'react'

import {
    useDelphiClientContext,
    useDelphiSession,
    useSelectionTracking,
    useBrowserAction,
} from '@ki-kombinat/delphi-client-js-sdk/react'

/**
 * A fully functional headless WebRTC softphone UI built with Tailwind CSS.
 *
 * Demonstrates the v0.1 SDK shape:
 *   - Voice call lifecycle via `delphi.startCall()` / `delphi.endCall()`.
 *   - Long-lived per-endpoint sessions via `useDelphiSession({ endpointId, mode })`.
 *   - Browser actions (AI tool calls).
 *   - DTMF dialpad.
 *   - Audio-blocked / reconnect-after-reload handling.
 *   - Text selection → read-aloud floating action button.
 */
export function WebRTCPhone() {
    const delphi = useDelphiClientContext()

    const subscribe = useCallback((cb: () => void) => delphi.subscribe(cb), [delphi])
    const getSnapshot = useCallback(() => delphi.getState(), [delphi])
    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

    const { voiceCall, status, sessions } = state
    const {
        registered,
        calling,
        inCall,
        initialized,
        reconnecting,
        audioBlocked,
        endpointId,
        endpointName,
        appName,
        sessionId: voiceSessionId,
        dtmfDigits,
    } = voiceCall

    const [open, setOpen] = useState(false)
    const [chatOpen, setChatOpen] = useState(false)
    const [dialpadOpen, setDialpadOpen] = useState(false)
    const [chatInput, setChatInput] = useState('')
    const [endpointInput, setEndpointInput] = useState('')

    // Callback refs avoid the useRef + useEffect race where the SDK doesn't
    // see the audio element until the component re-renders. The element is
    // wired up the moment React commits the DOM node.
    const remoteAudioRef = useCallback(
        (node: HTMLAudioElement | null) => {
            delphi.setRemoteAudioElement(node)
        },
        [delphi],
    )
    const localAudioRef = useCallback(
        (node: HTMLAudioElement | null) => {
            delphi.setLocalAudioElement(node)
        },
        [delphi],
    )

    // Reconnect a previously persisted voice call on mount
    useEffect(() => {
        const stored = delphi.restorePersistedCall()
        if (stored) delphi.reconnectCall(stored).catch(console.error)
    }, [delphi])

    useEffect(() => {
        return () => {
            void delphi.endAllSessions().catch(() => undefined)
        }
    }, [delphi])

    // Channel-side handlers (browser actions). The session is bound below.
    const handleBrowserAction = useBrowserAction()

    const {
        connected: channelConnected,
        textChatEnabled,
        messages,
        sendContextUpdate,
        sendTextChat,
        sendReadAloud,
        enableTextChat,
        disableTextChat,
    } = useDelphiSession({
        endpointId: endpointId || null,
        mode: 'voice_conversation',
        endpointName,
        appName,
        onAction: handleBrowserAction,
    })

    const { selectedText, handleReadAloudSelected, showReadAloudFab } = useSelectionTracking({
        sendReadAloud,
        channelConnected,
    })

    const handleStartCall = useCallback(
        (id: string) => {
            delphi
                .startCall({ endpointId: id, autoDial: true })
                .catch((e: unknown) => console.error('startCall failed', e))
            setOpen(true)
        },
        [delphi],
    )

    const handleHangup = useCallback(async () => {
        await delphi.endCall()
        setChatOpen(false)
        setDialpadOpen(false)
        setOpen(false)
    }, [delphi])

    const handleSendChat = useCallback(() => {
        if (!chatInput.trim()) return
        if (textChatEnabled) sendTextChat(chatInput.trim())
        else sendContextUpdate(chatInput.trim())
        setChatInput('')
    }, [chatInput, textChatEnabled, sendTextChat, sendContextUpdate])

    useEffect(() => {
        if (inCall && channelConnected && !textChatEnabled) enableTextChat('text')
    }, [inCall, channelConnected, textChatEnabled, enableTextChat])

    const hasActiveCall = inCall || calling || reconnecting
    const connected = registered

    return (
        <div className="space-y-6">
            {/* Read-aloud FAB */}
            {showReadAloudFab && (
                <button
                    onClick={handleReadAloudSelected}
                    className="fixed bottom-20 right-20 z-50 rounded-full bg-purple-600 p-4 text-white shadow-lg hover:bg-purple-700 transition-colors"
                    title={`Read aloud: "${selectedText.slice(0, 40)}..."`}
                >
                    🔊
                </button>
            )}

            {/* Status bar */}
            <div
                className={`rounded-xl p-4 text-sm font-medium ${connected ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-gray-50 text-gray-600 border border-gray-200'}`}
            >
                <span
                    className={`inline-block w-2 h-2 rounded-full mr-2 ${connected ? 'bg-green-500' : 'bg-gray-400'}`}
                />
                {status}
                {reconnecting && (
                    <span className="ml-2 text-amber-600 animate-pulse">Reconnecting…</span>
                )}
                {sessions.length > 0 && (
                    <span className="ml-2 text-xs text-gray-500">
                        ({sessions.length} session{sessions.length === 1 ? '' : 's'})
                    </span>
                )}
            </div>

            {/* Audio blocked */}
            {audioBlocked && (
                <button
                    onClick={() => delphi.enableAudio()}
                    className="w-full rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 hover:bg-amber-100"
                >
                    🔇 Audio blocked — click to enable
                </button>
            )}

            {/* Endpoint selector */}
            {!endpointId && (
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
                    <h2 className="text-base font-semibold text-gray-900">Start a call</h2>
                    <div className="flex gap-2">
                        <input
                            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Endpoint ID"
                            value={endpointInput}
                            onChange={(e) => setEndpointInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && endpointInput.trim()) {
                                    handleStartCall(endpointInput.trim())
                                }
                            }}
                        />
                        <button
                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            disabled={!endpointInput.trim()}
                            onClick={() => handleStartCall(endpointInput.trim())}
                        >
                            Call
                        </button>
                    </div>

                </div>
            )}

            {/* Phone panel */}
            {open && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                    <div className="flex items-center justify-between bg-gray-50 px-4 py-3 border-b border-gray-200">
                        <div className="font-semibold text-gray-800">
                            {appName || endpointName || endpointId || 'Phone'}
                            {hasActiveCall && (
                                <span
                                    className={`ml-2 text-xs rounded-full px-2 py-0.5 ${inCall ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
                                >
                                    {inCall
                                        ? 'In Call'
                                        : reconnecting
                                          ? 'Reconnecting'
                                          : 'Calling…'}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={() => setOpen(false)}
                            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                        >
                            ×
                        </button>
                    </div>

                    <div className="p-4 space-y-4">
                        <div className="flex gap-2">
                            {reconnecting ? (
                                <button
                                    onClick={() => delphi.cancelReconnect()}
                                    className="flex-1 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100"
                                >
                                    Cancel Reconnect
                                </button>
                            ) : !inCall && !calling ? (
                                <button
                                    onClick={() => endpointId && handleStartCall(endpointId)}
                                    disabled={!endpointId || (initialized && !registered)}
                                    className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
                                >
                                    📞 {endpointId ? `Call ${appName || endpointId}` : 'Call'}
                                </button>
                            ) : calling ? (
                                <button
                                    disabled
                                    className="flex-1 rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-500"
                                >
                                    Dialling…
                                </button>
                            ) : (
                                <button
                                    onClick={handleHangup}
                                    className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                                >
                                    📵 Hang Up
                                </button>
                            )}
                        </div>

                        <button
                            className="text-xs text-blue-600 hover:underline"
                            onClick={() => setDialpadOpen((v) => !v)}
                        >
                            {dialpadOpen ? 'Hide Dialpad' : 'Show Dialpad'} (#️⃣)
                        </button>

                        {dialpadOpen && (
                            <div className="space-y-2">
                                <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-lg tracking-widest text-gray-700 min-h-[2.5rem]">
                                    {dtmfDigits || <span className="text-gray-400">—</span>}
                                </div>
                                <div className="grid grid-cols-3 gap-1">
                                    {[
                                        '1',
                                        '2',
                                        '3',
                                        '4',
                                        '5',
                                        '6',
                                        '7',
                                        '8',
                                        '9',
                                        '*',
                                        '0',
                                        '#',
                                    ].map((d) => (
                                        <button
                                            key={d}
                                            onClick={() => delphi.sendDtmf(d)}
                                            disabled={calling}
                                            className="rounded-lg border border-gray-200 py-2 text-base font-semibold hover:bg-gray-100 active:scale-95 disabled:opacity-40"
                                        >
                                            {d}
                                        </button>
                                    ))}
                                </div>
                                {dtmfDigits && (
                                    <button
                                        onClick={() => delphi.clearDtmfDigits()}
                                        className="text-xs text-red-500 hover:underline"
                                    >
                                        Clear digits
                                    </button>
                                )}
                            </div>
                        )}

                        {hasActiveCall && voiceSessionId && (
                            <button
                                className="text-xs text-blue-600 hover:underline"
                                onClick={() => setChatOpen((v) => !v)}
                            >
                                {chatOpen ? 'Hide Chat' : 'Show Chat'} 💬
                                {channelConnected && (
                                    <span className="ml-1 rounded-full bg-green-100 px-1.5 text-green-700">
                                        ●
                                    </span>
                                )}
                            </button>
                        )}

                        {chatOpen && hasActiveCall && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">
                                        {textChatEnabled ? '💬 Text mode' : '🎤 Voice mode'}
                                    </span>
                                    <button
                                        onClick={() =>
                                            textChatEnabled
                                                ? disableTextChat()
                                                : enableTextChat('text')
                                        }
                                        disabled={!channelConnected}
                                        className={`rounded px-2 py-1 text-xs font-medium ${textChatEnabled ? 'bg-blue-600 text-white' : 'border border-gray-300 text-gray-600'} disabled:opacity-40`}
                                    >
                                        {textChatEnabled ? 'Disable Chat' : 'Enable Chat'}
                                    </button>
                                </div>

                                <div className="rounded-lg bg-gray-50 border border-gray-200 p-2 max-h-40 overflow-y-auto space-y-1">
                                    {messages.filter((m) => m.type === 'chat' && m.chat).length ===
                                    0 ? (
                                        <p className="text-xs text-gray-400 text-center py-2">
                                            {textChatEnabled
                                                ? 'No messages yet.'
                                                : 'Enable text chat.'}
                                        </p>
                                    ) : (
                                        messages
                                            .filter((m) => m.type === 'chat' && m.chat)
                                            .map((msg) => (
                                                <div
                                                    key={msg.messageId}
                                                    className={`rounded-lg px-3 py-1.5 text-sm max-w-[85%] ${
                                                        msg.chat?.role === 'user'
                                                            ? 'ml-auto bg-blue-600 text-white'
                                                            : 'bg-gray-200 text-gray-800'
                                                    }`}
                                                >
                                                    {msg.chat?.content}
                                                </div>
                                            ))
                                    )}
                                </div>

                                <div className="flex gap-2">
                                    <input
                                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder={
                                            textChatEnabled ? 'Message AI…' : 'Add context…'
                                        }
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        disabled={!channelConnected}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault()
                                                handleSendChat()
                                            }
                                        }}
                                    />
                                    <button
                                        onClick={handleSendChat}
                                        disabled={!channelConnected || !chatInput.trim()}
                                        className="rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-40"
                                    >
                                        ↩
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (!chatInput.trim()) return
                                            sendReadAloud(chatInput.trim())
                                            setChatInput('')
                                        }}
                                        disabled={!channelConnected || !chatInput.trim() || !inCall}
                                        title="Read aloud via AI"
                                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40"
                                    >
                                        🔊
                                    </button>
                                </div>
                            </div>
                        )}

                        {hasActiveCall && (
                            <p className="text-xs text-center text-gray-400">
                                You can close this panel — the call continues in the background.
                            </p>
                        )}

                        {connected && !hasActiveCall && (
                            <button
                                onClick={async () => {
                                    await delphi.endCall()
                                    setOpen(false)
                                }}
                                className="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50"
                            >
                                Disconnect
                            </button>
                        )}
                    </div>
                </div>
            )}

            {!open && (
                <div className="fixed bottom-6 right-6">
                    <button
                        onClick={() => setOpen(true)}
                        className={`rounded-full p-4 text-white shadow-lg transition-colors ${
                            hasActiveCall
                                ? 'bg-red-600 hover:bg-red-700 animate-pulse'
                                : connected
                                  ? 'bg-blue-600 hover:bg-blue-700'
                                  : 'bg-gray-400 hover:bg-gray-500'
                        }`}
                        title="Open phone"
                    >
                        {hasActiveCall ? '📵' : '📞'}
                    </button>
                </div>
            )}

            <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }}>
                <track kind="captions" />
            </audio>
            <audio ref={localAudioRef} muted style={{ display: 'none' }}>
                <track kind="captions" />
            </audio>
        </div>
    )
}
