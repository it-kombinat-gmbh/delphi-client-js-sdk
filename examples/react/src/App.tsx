import { useMemo, useState } from 'react'

import { DelphiClientProvider } from '../../../src/react'

import { ReadAloudDemo } from './components/ReadAloudDemo'
import { InterpretationDemo } from './components/InterpretationDemo'
import { WebRTCPhone } from './components/WebRTCPhone'

/**
 * Example app demonstrating the Delphi Client JS SDK with React bindings.
 *
 * In a real app, `apiDomain` and `apiKey` would come from your server config.
 * The SDK can also accept config updates at runtime via `DelphiConfigInit`.
 */
export default function App() {
    const envApiDomain = (import.meta.env['VITE_API_DOMAIN'] as string | undefined)?.trim()
    const envApiKey = (import.meta.env['VITE_API_KEY'] as string | undefined)?.trim()

    const [apiDomainInput, setApiDomainInput] = useState(() => envApiDomain ?? 'localhost:3001')
    const [apiKeyInput, setApiKeyInput] = useState(() => envApiKey ?? '')

    const config = useMemo(
        () => ({
            apiDomain: apiDomainInput.trim() || envApiDomain || 'localhost:3001',
            apiKey: apiKeyInput.trim() || envApiKey || '',
            // Note: the WebRTC gateway URL is *not* configured here — it is
            // returned by the server in the session-token response. The server
            // is the single source of truth.
        }),
        [apiDomainInput, apiKeyInput, envApiDomain, envApiKey],
    )

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
                </header>
                <main className="max-w-2xl mx-auto space-y-6">
                    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">TelAPI connection</h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Host and port only (no <code className="font-mono text-xs">https://</code>
                                ). Empty fields fall back to{' '}
                                <code className="font-mono text-xs">VITE_API_DOMAIN</code> /{' '}
                                <code className="font-mono text-xs">VITE_API_KEY</code> from{' '}
                                <code className="font-mono text-xs">.env</code> when set. Values stay in
                                this tab; they are not written to disk.
                            </p>
                        </div>
                        <label className="block">
                            <span className="text-xs font-medium text-gray-700">API domain</span>
                            <input
                                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="api.example.com"
                                autoComplete="off"
                                spellCheck={false}
                                value={apiDomainInput}
                                onChange={(e) => setApiDomainInput(e.target.value)}
                            />
                        </label>
                        <label className="block">
                            <span className="text-xs font-medium text-gray-700">API key</span>
                            <input
                                type="password"
                                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="sk_live_…"
                                autoComplete="off"
                                spellCheck={false}
                                value={apiKeyInput}
                                onChange={(e) => setApiKeyInput(e.target.value)}
                            />
                        </label>
                        {!config.apiKey && (
                            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                                Enter your API key above to authenticate requests to TelAPI.
                            </div>
                        )}
                    </section>
                    <ReadAloudDemo />
                    <InterpretationDemo />
                    <WebRTCPhone />
                </main>
            </div>
        </DelphiClientProvider>
    )
}
