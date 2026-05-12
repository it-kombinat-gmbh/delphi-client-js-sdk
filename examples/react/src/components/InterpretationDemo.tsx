import { useCallback, useEffect, useRef, useState } from 'react'

import { useDelphiClientContext, useDelphiSession } from '../../../../src/react'
import type { BrowserAudioEvent, ChatPayload } from '../../../../src/react'

export function InterpretationDemo() {
    const delphi = useDelphiClientContext()
    const [endpointId, setEndpointId] = useState(
        () => (import.meta.env['VITE_DEFAULT_ENDPOINT_ID'] as string | undefined)?.trim() ?? '',
    )
    const [identifier, setIdentifier] = useState('default')
    const [targetLanguage, setTargetLanguage] = useState('en')
    const [listenerOpen, setListenerOpen] = useState(false)
    const [listenPending, setListenPending] = useState(false)
    const [captions, setCaptions] = useState<string[]>([])
    const [audioEvents, setAudioEvents] = useState<BrowserAudioEvent[]>([])
    const [speakerStatus, setSpeakerStatus] = useState<string>('idle')
    const [listenerStatus, setListenerStatus] = useState<string>('idle')
    const activeListenKeyRef = useRef<string | null>(null)
    const normalizedEndpointId = endpointId.trim()
    const normalizedIdentifier = identifier.trim()
    const normalizedTargetLanguage = targetLanguage.trim()
    const listenerActive = listenerOpen || listenPending

    const listener = useDelphiSession({
        endpointId: listenerOpen ? normalizedEndpointId || null : null,
        mode: 'listen',
        onChat: (chat: ChatPayload) => {
            if (chat.metadata?.['interpretation']) {
                setCaptions((current) => [...current.slice(-9), chat.content])
            }
        },
        onAudio: (audio) => {
            setAudioEvents((current) => [...current.slice(-4), audio])
        },
    })

    const startSpeaker = useCallback(async () => {
        if (!normalizedEndpointId || !normalizedIdentifier) return
        setSpeakerStatus('starting')
        try {
            await delphi.startCall({
                endpointId: normalizedEndpointId,
                autoDial: true,
                browserContext: {
                    identifier: normalizedIdentifier,
                    role: 'speaker',
                    sourceLanguage: 'de',
                    source: 'interpretation_speaker',
                    metadata: {
                        interpretationScope: normalizedEndpointId,
                    },
                },
            })
            setSpeakerStatus('speaking')
        } catch (error) {
            setSpeakerStatus(error instanceof Error ? error.message : String(error))
        }
    }, [delphi, normalizedEndpointId, normalizedIdentifier])

    const stopSpeaker = useCallback(async () => {
        await delphi.endCall()
        setSpeakerStatus('idle')
    }, [delphi])

    const startListening = useCallback(() => {
        if (!normalizedEndpointId || !normalizedIdentifier || !normalizedTargetLanguage) return
        if (listenerOpen) {
            setListenerStatus('already listening - stop before starting another subscription')
            return
        }
        setCaptions([])
        setAudioEvents([])
        setListenerStatus('connecting')
        setListenPending(true)
        setListenerOpen(true)
    }, [listenerOpen, normalizedEndpointId, normalizedIdentifier, normalizedTargetLanguage])

    const stopListening = useCallback(async () => {
        activeListenKeyRef.current = null
        setListenPending(false)
        setListenerOpen(false)
        setListenerStatus('idle')
        await listener.close()
    }, [listener])

    useEffect(() => {
        if (!listenerOpen || !listenPending || !listener.serverReady) return
        const listenerIdentifier = normalizedIdentifier
        const language = normalizedTargetLanguage
        if (!listenerIdentifier || !language || !normalizedEndpointId) return
        const listenKey = `${normalizedEndpointId}:${listenerIdentifier}:${language}`

        if (activeListenKeyRef.current === listenKey) {
            setListenPending(false)
            return
        }

        activeListenKeyRef.current = listenKey

        const contextSent = listener.setBrowserContext({
            identifier: listenerIdentifier,
            role: 'listener',
            targetLanguage: language,
            source: 'interpretation_listener',
            metadata: {
                interpretationScope: normalizedEndpointId,
            },
        })
        const listenSent = listener.listen({
            identifier: listenerIdentifier,
            targetLanguage: language,
            endpointId: normalizedEndpointId,
            scope: normalizedEndpointId,
            startMode: 'closest_to_now',
        })

        if (contextSent && listenSent) {
            setListenPending(false)
            setListenerStatus(
                `listening to ${normalizedEndpointId}/${listenerIdentifier}/${language}`,
            )
        } else {
            activeListenKeyRef.current = null
            setListenerStatus('listener session not ready yet')
        }
    }, [
        listenPending,
        listener,
        listener.connected,
        listener.serverReady,
        listenerOpen,
        normalizedEndpointId,
        normalizedIdentifier,
        normalizedTargetLanguage,
    ])

    return (
        <div className="rounded-xl border border-teal-200 bg-white p-5 shadow-sm space-y-4">
            <header>
                <h2 className="text-lg font-semibold text-gray-900">
                    Interpretation speaker/listener
                </h2>
                <p className="text-sm text-gray-500">
                    Speaker and listener use the same endpoint ID. The difference is the SDK mode:
                    speaker starts a WebRTC voice call, listener subscribes to the interpretation
                    stream for the same endpoint, identifier, and language.
                </p>
            </header>

            <div className="grid gap-3 sm:grid-cols-3">
                <label className="block sm:col-span-3">
                    <span className="text-xs font-medium text-gray-700">Endpoint ID</span>
                    <input
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                        value={endpointId}
                        onChange={(event) => setEndpointId(event.target.value)}
                        disabled={listenerActive}
                    />
                </label>
                <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-700">Identifier</span>
                    <input
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        value={identifier}
                        onChange={(event) => setIdentifier(event.target.value)}
                        disabled={listenerActive}
                    />
                </label>
                <label className="block">
                    <span className="text-xs font-medium text-gray-700">Listen language</span>
                    <input
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        value={targetLanguage}
                        onChange={(event) => setTargetLanguage(event.target.value)}
                        disabled={listenerActive}
                    />
                </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                    <h3 className="text-sm font-semibold">Speaker</h3>
                    <div className="flex gap-2">
                        <button
                            className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                            disabled={
                                !normalizedEndpointId ||
                                !normalizedIdentifier ||
                                speakerStatus === 'speaking'
                            }
                            onClick={startSpeaker}
                        >
                            Start speaker call
                        </button>
                        <button
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            onClick={stopSpeaker}
                        >
                            Stop
                        </button>
                    </div>
                    <p className="text-xs text-gray-500">Status: {speakerStatus}</p>
                </div>

                <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                    <h3 className="text-sm font-semibold">Listener</h3>
                    <div className="flex gap-2">
                        <button
                            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                            disabled={
                                !normalizedEndpointId ||
                                !normalizedIdentifier ||
                                !normalizedTargetLanguage ||
                                listenerActive
                            }
                            onClick={startListening}
                        >
                            {listenPending
                                ? 'Connecting...'
                                : listenerOpen
                                  ? 'Listening'
                                  : 'Listen'}
                        </button>
                        <button
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            onClick={stopListening}
                        >
                            Stop
                        </button>
                    </div>
                    <p className="text-xs text-gray-500">
                        Connected: {listener.connected ? 'yes' : 'no'} · session:{' '}
                        {listener.sessionId ?? 'none'}
                    </p>
                    <p className="text-xs text-gray-500">
                        Server ready: {listener.serverReady ? 'yes' : 'no'}
                    </p>
                    <p className="text-xs text-gray-500">Status: {listenerStatus}</p>
                </div>
            </div>

            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                <h3 className="text-sm font-semibold text-gray-900">Captions</h3>
                {captions.length === 0 ? (
                    <p className="text-xs text-gray-500">No interpretation captions yet.</p>
                ) : (
                    <ul className="mt-2 space-y-1 text-sm text-gray-700">
                        {captions.map((caption, index) => (
                            <li key={`${index}-${caption}`}>{caption}</li>
                        ))}
                    </ul>
                )}
                {audioEvents.length > 0 && (
                    <p className="mt-2 text-xs text-gray-500">
                        Audio events received: {audioEvents.length}
                    </p>
                )}
            </div>
        </div>
    )
}
