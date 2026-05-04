import { useCallback, useState } from 'react'

import { useDelphiClientContext } from '@ki-kombinat/delphi-client-js-sdk/react'

/**
 * Read-aloud quickstart — mirrors the README example exactly:
 *
 *   await delphi.readAloud(text, { endpointId })
 *
 * The SDK find-or-creates an `audio_playback` session, sends a
 * `browser.action.readAloud` BOA with the supplied text, streams the
 * synthesised audio back over the channel WebSocket, and plays it
 * automatically. The promise resolves with the assembled
 * `BrowserAudioEvent` once playback finishes.
 */
export function ReadAloudDemo() {
    const delphi = useDelphiClientContext()

    const [endpointId, setEndpointId] = useState<string>(
        import.meta.env['VITE_DEFAULT_ENDPOINT_ID'] ?? '',
    )
    const [text, setText] = useState<string>('Hello from the Delphi SDK!')
    const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
    const [error, setError] = useState<string | null>(null)
    const [lastAudio, setLastAudio] = useState<{
        mimeType?: string
        dataUrl?: string
    } | null>(null)

    const handleReadAloud = useCallback(async () => {
        if (!endpointId.trim() || !text.trim()) return
        setStatus('loading')
        setError(null)
        setLastAudio(null)
        try {
            const audio = await delphi.readAloud(text.trim(), {
                endpointId: endpointId.trim(),
            })
            setLastAudio({ mimeType: audio.mimeType, dataUrl: audio.dataUrl })
            setStatus('done')
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e))
            setStatus('error')
        }
    }, [delphi, endpointId, text])

    const handleEndSession = useCallback(async () => {
        if (!endpointId.trim()) return
        try {
            await delphi.endSession(endpointId.trim())
            setStatus('idle')
            setError(null)
            setLastAudio(null)
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e))
        }
    }, [delphi, endpointId])

    const isReady = endpointId.trim().length > 0 && text.trim().length > 0
    const isLoading = status === 'loading'

    return (
        <div className="rounded-xl border border-purple-200 bg-white p-5 shadow-sm space-y-4">
            <header className="space-y-1">
                <h2 className="text-lg font-semibold text-gray-900">Read-aloud quickstart</h2>
                <p className="text-sm text-gray-500">
                    Mirrors the README quickstart exactly:{' '}
                    <code className="font-mono text-xs bg-gray-100 rounded px-1.5 py-0.5">
                        await delphi.readAloud(text, &#123; endpointId &#125;)
                    </code>
                </p>
            </header>

            <div className="space-y-3">
                <label className="block">
                    <span className="text-xs font-medium text-gray-700">Endpoint ID</span>
                    <input
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="d9de8bf4-b8ee-462e-8d45-…"
                        value={endpointId}
                        onChange={(e) => setEndpointId(e.target.value)}
                        spellCheck={false}
                    />
                </label>

                <label className="block">
                    <span className="text-xs font-medium text-gray-700">Text to read aloud</span>
                    <textarea
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        rows={3}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                    />
                </label>
            </div>

            <div className="flex gap-2">
                <button
                    onClick={handleReadAloud}
                    disabled={!isReady || isLoading}
                    className="flex-1 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-40"
                >
                    {isLoading ? 'Streaming audio…' : '🔊 Read aloud'}
                </button>
                <button
                    onClick={handleEndSession}
                    disabled={!endpointId.trim()}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    title="Close the audio_playback session for this endpoint"
                >
                    End session
                </button>
            </div>

            {status === 'done' && lastAudio && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800 space-y-1">
                    <div>
                        ✓ Played. <span className="text-green-600">mimeType:</span>{' '}
                        <code className="font-mono">{lastAudio.mimeType ?? 'unknown'}</code>
                    </div>
                    {lastAudio.dataUrl && (
                        <div className="text-green-700">
                            audio.dataUrl: {Math.round(lastAudio.dataUrl.length / 1024)} KB (base64)
                        </div>
                    )}
                </div>
            )}

            {status === 'error' && error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    <div className="font-semibold mb-1">readAloud failed</div>
                    <code className="font-mono break-all">{error}</code>
                </div>
            )}

            <details className="text-xs text-gray-500">
                <summary className="cursor-pointer hover:text-gray-700">
                    What happens under the hood
                </summary>
                <ol className="mt-2 ml-4 list-decimal space-y-1">
                    <li>
                        SDK calls{' '}
                        <code className="font-mono">POST /api/v1/sessions/token</code> with{' '}
                        <code className="font-mono">
                            &#123; endpointId, mode: 'audio_playback' &#125;
                        </code>
                        .
                    </li>
                    <li>
                        Opens{' '}
                        <code className="font-mono">
                            wss://&#123;apiDomain&#125;/ws/session?sessionId=…&token=…
                        </code>
                        .
                    </li>
                    <li>
                        Sends a <code className="font-mono">browser_action</code> envelope with{' '}
                        <code className="font-mono">browser.action.readAloud</code>.
                    </li>
                    <li>
                        Server streams audio chunks back; SDK reassembles and plays via{' '}
                        <code className="font-mono">new Audio()</code>.
                    </li>
                    <li>
                        Subsequent calls for the same{' '}
                        <code className="font-mono">endpointId</code> reuse the session (one WS,
                        one conversation thread) until the 5-minute idle timer fires.
                    </li>
                </ol>
            </details>
        </div>
    )
}
