import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useDelphiClientContext, useDelphiSession } from '../../../../src/react'

/**
 * Demonstrates pure text chat via TelAPI FlowEngine (`mode: 'text'`) and
 * optional upgrade to a voice call on the same sessionId.
 */
export function TextChatDemo() {
    const delphi = useDelphiClientContext()

    const [endpointId, setEndpointId] = useState<string>(
        () => (import.meta.env['VITE_TEXT_CHAT_ENDPOINT_ID'] as string | undefined)?.trim() ?? '',
    )
    const [chatInput, setChatInput] = useState('')
    const [upgradeStatus, setUpgradeStatus] = useState<string | null>(null)
    const remoteAudioRef = useRef<HTMLAudioElement>(null)

    const {
        connected,
        messages,
        sendTextChat,
        clearMessages,
    } = useDelphiSession({
        endpointId: endpointId.trim() || null,
        mode: 'text',
    })

    useEffect(() => {
        delphi.setRemoteAudioElement(remoteAudioRef.current)
    }, [delphi])

    const chatMessages = useMemo(
        () =>
            messages.filter(
                (message) =>
                    message.type === 'chat' &&
                    message.chat?.content &&
                    message.chat.intent !== 'browser_context',
            ),
        [messages],
    )

    const handleSend = useCallback(() => {
        if (!chatInput.trim() || !connected) return
        sendTextChat(chatInput.trim())
        setChatInput('')
    }, [chatInput, connected, sendTextChat])

    const handleEndTextSession = useCallback(async () => {
        if (!endpointId.trim()) return
        await delphi.endSession(endpointId.trim(), 'text')
        clearMessages()
        setUpgradeStatus(null)
    }, [clearMessages, delphi, endpointId])

    const handleUpgradeToVoice = useCallback(async () => {
        if (!endpointId.trim()) return
        setUpgradeStatus('Upgrading…')
        try {
            await delphi.upgradeToVoice({
                endpointId: endpointId.trim(),
                autoDial: true,
            })
            setUpgradeStatus('Voice call active — you can keep chatting in text while speaking.')
        } catch (error) {
            setUpgradeStatus(error instanceof Error ? error.message : String(error))
        }
    }, [delphi, endpointId])

    const handleEndVoice = useCallback(async () => {
        await delphi.endCall()
        setUpgradeStatus(null)
    }, [delphi])

    return (
        <div className="rounded-xl border border-emerald-200 bg-white p-5 shadow-sm space-y-4">
            <header className="space-y-1">
                <h2 className="text-lg font-semibold text-gray-900">Text chat + voice upgrade</h2>
                <p className="text-sm text-gray-500">
                    Opens a TelAPI text FlowEngine session (
                    <code className="font-mono text-xs bg-gray-100 rounded px-1.5 py-0.5">
                        mode: &apos;text&apos;
                    </code>
                    ), runs your app&apos;s <code className="font-mono text-xs">web_chat</code>{' '}
                    flow, then optionally upgrades to WebRTC on the same session.
                </p>
            </header>

            <label className="block">
                <span className="text-xs font-medium text-gray-700">
                    Browser endpoint ID (web_chat flow)
                </span>
                <input
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="d9de8bf4-b8ee-462e-8d45-…"
                    value={endpointId}
                    onChange={(e) => setEndpointId(e.target.value)}
                />
            </label>

            <div className="flex flex-wrap gap-2 text-xs">
                <span
                    className={`rounded-full px-2.5 py-1 font-medium ${
                        connected
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-gray-100 text-gray-600'
                    }`}
                >
                    {connected ? 'Channel connected' : 'Connecting…'}
                </span>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 max-h-64 overflow-y-auto p-3 space-y-2 text-sm">
                {chatMessages.length === 0 ? (
                    <p className="text-gray-500 italic">
                        Send a message to start the conversation.
                    </p>
                ) : (
                    chatMessages.map((message) => (
                        <div
                            key={message.messageId}
                            className={
                                message.chat?.role === 'user' ? 'text-right' : 'text-left'
                            }
                        >
                            <span
                                className={`inline-block rounded-lg px-3 py-1.5 max-w-[85%] ${
                                    message.chat?.role === 'user'
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-white border border-gray-200 text-gray-900'
                                }`}
                            >
                                {message.chat?.content}
                            </span>
                        </div>
                    ))
                )}
            </div>

            <div className="flex gap-2">
                <input
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Type a message…"
                    value={chatInput}
                    disabled={!connected}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSend()
                        }
                    }}
                />
                <button
                    type="button"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    disabled={!connected || !chatInput.trim()}
                    onClick={handleSend}
                >
                    Send
                </button>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                    onClick={() => void handleEndTextSession()}
                >
                    End text session
                </button>
                <button
                    type="button"
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    disabled={!connected}
                    onClick={() => void handleUpgradeToVoice()}
                >
                    Upgrade to voice
                </button>
                <button
                    type="button"
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                    onClick={() => void handleEndVoice()}
                >
                    End voice call
                </button>
            </div>

            {upgradeStatus && (
                <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{upgradeStatus}</p>
            )}

            <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
        </div>
    )
}
