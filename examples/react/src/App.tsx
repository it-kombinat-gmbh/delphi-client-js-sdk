import { DelphiClientProvider } from '@ki-kombinat/delphi-client-js-sdk/react'

import { ReadAloudDemo } from './components/ReadAloudDemo'
import { WebRTCPhone } from './components/WebRTCPhone'

/**
 * Example app demonstrating the Delphi Client JS SDK with React bindings.
 *
 * In a real app, `apiDomain` and `apiKey` would come from your server config.
 * The SDK can also accept config updates at runtime via `DelphiConfigInit`.
 */
export default function App() {
    const apiDomain = import.meta.env['VITE_API_DOMAIN'] ?? 'localhost:3001'

    const config = {
        apiDomain,
        apiKey: import.meta.env['VITE_API_KEY'] ?? '',
        // Note: the WebRTC gateway URL is *not* configured here — it is
        // returned by the server in the session-token response. The server
        // is the single source of truth.
        // Optional: STUN/TURN servers for ICE.
        // If omitted the browser uses its default policy (no STUN/TURN).
        // iceServers: [
        //   { urls: `stun:${apiDomain}:3478` },
        //   {
        //     urls: [
        //       `turn:${apiDomain}:3478?transport=udp`,
        //       `turn:${apiDomain}:3478?transport=tcp`,
        //     ],
        //     username: import.meta.env['VITE_TURN_USERNAME'],
        //     credential: import.meta.env['VITE_TURN_CREDENTIAL'],
        //   },
        // ],
    }

    return (
        <DelphiClientProvider config={config}>
            <div className="min-h-screen bg-gray-100 p-8">
                <header className="max-w-2xl mx-auto mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">
                        Delphi Client SDK – React Example
                    </h1>
                    <p className="text-gray-500 mt-2">
                        A minimal Vite + React + Tailwind demo of the headless WebRTC softphone.
                    </p>
                    {!config.apiKey && (
                        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                            <strong>Config required:</strong> Set{' '}
                            <code className="font-mono">VITE_API_DOMAIN</code> and{' '}
                            <code className="font-mono">VITE_API_KEY</code> in a{' '}
                            <code className="font-mono">.env</code> file to connect to your TelAPI.
                        </div>
                    )}
                </header>
                <main className="max-w-2xl mx-auto space-y-6">
                    <ReadAloudDemo />
                    <WebRTCPhone />
                </main>
            </div>
        </DelphiClientProvider>
    )
}
