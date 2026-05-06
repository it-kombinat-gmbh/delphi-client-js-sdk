# @ki-kombinat/delphi-client-js-sdk

[![npm version](https://img.shields.io/npm/v/@ki-kombinat/delphi-client-js-sdk.svg)](https://www.npmjs.com/package/@kikombinat.com/delphi-client-js-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Headless TypeScript SDK for the **Delphi voice-AI platform**. Open AI-runtime
sessions from the browser, send/receive realtime messages, trigger browser
actions, stream TTS audio, and place full WebRTC voice calls — all through one
unified API.

- **One client, all flows** — text chat, read-aloud, browser actions, voice
  calls all run through the same session abstraction.
- **Session-first** — every interaction is wrapped in a server-issued session
  for accounting, rate limiting, and conversation history.
- **Long-lived sessions** — sessions are find-or-create per endpoint, so
  repeated `readAloud` calls reuse the same WebSocket and conversation context.
- **Tree-shakeable** — pure ESM/CJS dual build, `sideEffects: false`.
- **Zero runtime dependencies** in the core; React bindings are an optional
  sub-path that depends only on `react`.

```bash
npm install @ki-kombinat/delphi-client-js-sdk
# or pnpm / yarn / bun
```

## Sub-paths

```ts
// Core (works in any browser, no React required)
import { DelphiClient, SessionClient } from '@ki-kombinat/delphi-client-js-sdk'

// React bindings
import {
    DelphiClientProvider,
    useDelphiSession,
    useDelphiClientContext,
} from '@ki-kombinat/delphi-client-js-sdk/react'
```

`react` (>=18) is a `peerDependency` and only required when you import the
`/react` sub-path.

## Concepts

### Sessions

A **session** is a server-issued realtime context (`sessionId`) that scopes
rate limiting, conversation history, and audio routing. Every action
(`readAloud`, `sendBrowserAction`, voice call, …) runs inside a session.

Sessions come in modes:

| Mode                  | Used for                                          | Audio routing                |
| --------------------- | ------------------------------------------------- | ---------------------------- |
| `text`                | Pure text chat                                    | None                         |
| `audio_playback`      | TTS / read-aloud / non-call voice replies         | Streamed over the channel WS |
| `voice_conversation`  | Full WebRTC two-way voice                         | SIP leg via WebRTC gateway   |
| `browser_actions`     | Pure BOA dispatch (no AI conversation)            | n/a                          |

The SDK keeps **one session per `endpointId`**. The first call decides the
mode; subsequent calls reuse it. Switching modes? Call
`endSession(endpointId)` first.

### Idle timeout

Non-voice sessions auto-close after `sessionIdleTimeoutMs` (default
`300_000` = **5 minutes**). The clock resets on every send and every
inbound message. Voice sessions ignore the timeout — they live until you
explicitly hang up.

## Quick start

```ts
import { DelphiClient } from '@ki-kombinat/delphi-client-js-sdk'

const delphi = new DelphiClient({
    apiDomain: 'api.example.com',
    apiKey: 'sk_live_…',
})

// One-line read-aloud. Resolves when the audio finishes playing.
await delphi.readAloud('Hello, world!', { endpointId: 'ext-100' })

// Repeated calls reuse the same session — one WS, one conversation thread.
await delphi.readAloud('How are you?', { endpointId: 'ext-100' })

// Done? Close the session (or rely on the 5-minute idle timeout).
await delphi.endSession('ext-100')
```

That's it for the simplest case. The server picks the right read-aloud
browser action; you only supply the text.

## Configuration

```ts
const delphi = new DelphiClient({
    /** TelAPI domain — used for REST + WebSocket URLs. */
    apiDomain: 'api.example.com',

    /** API key for session-token requests (optional if using sessionTokenUrl). */
    apiKey: 'sk_live_…',

    /** Same-origin proxy override for session-token requests. */
    sessionTokenUrl: '/api/proxy/sessions/token',

    /** Same-origin proxy override for runtime capability discovery. */
    runtimeCapabilitiesUrl: '/api/proxy/runtime/capabilities',

    /** Auto-close idle non-voice sessions. Default 300_000 ms (5 min). 0 = off. */
    sessionIdleTimeoutMs: 300_000,

    /** Custom ICE servers for WebRTC. If omitted, derived from the session token's telproDomain. */
    iceServers: [
        { urls: 'stun:stun.example.com:3478' },
        { urls: 'turn:turn.example.com:3478', username: 'u', credential: 'p' },
    ],

    /** Prefer PCMA over Opus (skips transcoding on the WebRTC gateway). Default true. */
    preferPcma: true,

    /** Custom logger (defaults to `console`). */
    logger: { debug, info, warn, error },
})
```

> **No `webrtcGatewayUrl` here.** For voice calls, the WebRTC gateway
> WebSocket URL is returned per-session by your backend in the
> session-token response (`SessionTokenResponse.webrtcGatewayUrl`)
> alongside `telproDomain`. This lets the server route per session
> (region, A/B, swap implementations) without an SDK config push.

## Three patterns

### 1. One-shot read-aloud (highest level)

```ts
const audio = await delphi.readAloud('Welcome back!', { endpointId: 'ext-100' })

// `audio` is the assembled BrowserAudioEvent. The SDK already played it
// (via new Audio()), but you can replay or download via `audio.dataUrl`.
console.log(audio.dataUrl, audio.mimeType, audio.metadata)
```

Options:

```ts
await delphi.readAloud('Some text', {
    endpointId: 'ext-100',

    /** Optional metadata sent alongside the BOA. */
    metadata: { from: 'highlight' },

    /** Disambiguate when an endpoint has multiple read-aloud BOAs. */
    capabilityId: 'cap_123',
    identifier: 'tts-fast',

    /** Override the BOA message-type if your runtime uses a custom one. */
    messageType: 'browser.action.readAloudFast',

    /** Cancel mid-flight. */
    signal: abortController.signal,

    /** Skip the SDK's built-in audio playback (you handle audio yourself). */
    disableAutoPlay: true,
    onAudio: (event) => myAudioPlayer.play(event.dataUrl),
})
```

### 2. Power-user: explicit session

```ts
const session = await delphi.openSession({
    endpointId: 'ext-100',
    mode: 'audio_playback',
})

// Set durable browser context the AI can reference.
session.setBrowserContext({
    text: document.querySelector('article')?.innerText ?? '',
    source: 'page',
    url: window.location.href,
})

// Trigger any browser action — `readAloud`, `transformAndRead`, custom flows.
session.sendBrowserAction({ messageType: 'browser.action.readAloud' })

// Wait for the AI's audio to finish.
const audio = await session.audioDone()

// Repeat as needed; the session stays open.
session.sendBrowserAction({
    messageType: 'browser.action.transformAndRead',
    text: 'Summarise the article.',
})
await session.audioDone()

await session.close()
```

### 3. Voice call (full WebRTC)

```ts
delphi.setRemoteAudioElement(remoteAudioRef.current)
delphi.setLocalAudioElement(localAudioRef.current)  // optional, for local mic monitoring

const session = await delphi.startCall({
    endpointId: 'ext-100',
    autoDial: true,
})

// Mid-call: read-aloud over the same SIP leg.
session.sendReadAloud('Important: your appointment is tomorrow.')

// DTMF.
await delphi.sendDtmf('5')

// Hang up.
await delphi.endCall()
```

The SDK handles WebRTC gateway session creation, SIP plugin attachment, ICE
trickle, JSEP negotiation, and reconnect-after-reload (see [Reconnect](#reconnect)).

## Capability discovery

Before opening a session, you can ask the runtime what an endpoint
supports:

```ts
const capabilities = await delphi.getCapabilities('ext-100')

if (!delphi.hasCapability(capabilities, 'voice_conversation')) {
    throw new Error('This endpoint does not support voice calls.')
}

// Or assert (throws CapabilityNotSupportedError):
delphi.assertCapability(capabilities, 'audio_playback')

// Convenience: fetch + assert in one call.
const caps = await delphi.assertEndpointCapability('ext-100', 'audio_playback')

console.log(caps.flows.browserActions)
// → [{ id, slug, label, type, messageType, voiceInvocable }, …]
```

## Errors

```ts
import {
    CapabilityNotSupportedError,
    ReadAloudCapabilityNotFoundError,
} from '@ki-kombinat/delphi-client-js-sdk'

try {
    await delphi.readAloud(text, { endpointId })
} catch (err) {
    if (err instanceof CapabilityNotSupportedError) {
        console.warn(`Endpoint missing capability: ${err.capability}`)
    } else {
        throw err
    }
}
```

## SessionClient API

`SessionClient` owns one channel WebSocket. Returned by
`delphi.openSession()` / `delphi.startCall()`; not usually constructed
directly.

| Method                                       | Purpose                                                     |
| -------------------------------------------- | ----------------------------------------------------------- |
| `getState()`                                 | Snapshot suitable for `useSyncExternalStore`.               |
| `subscribe(listener)`                        | State-change subscription.                                  |
| `setBrowserContext(ctx)`                     | Push durable page context (no AI response).                 |
| `sendChat(content, opts?)`                   | Generic chat send with full control over response behavior. |
| `sendTextChat(content)`                      | Text chat — expects a text response.                        |
| `sendReadAloud(content)`                     | Text chat — expects a voice response.                       |
| `sendContextUpdate(content)`                 | Append context, no AI response.                             |
| `sendBrowserAction(payload)`                 | Trigger a BOA side-flow.                                    |
| `enableTextChat() / disableTextChat()`       | Toggle the AI's text-chat mode.                             |
| `setResponseMode('voice'\|'text'\|'both')`   | Switch AI output modality.                                  |
| `audioDone(responseId?)`                     | Promise resolved when the next/specific audio response ends.|
| `sendAsyncActionResult(actionId, ok, opts?)` | Complete an async BOA request.                              |
| `sendActionProgress(actionId, status)`       | Progress update for in-flight BOA.                          |
| `sendMessage(partial)`                       | Send a raw `ChannelMessage` for advanced use.               |
| `clearMessages()`                            | Wipe local message history (UI only).                       |
| `touch()`                                    | Manually reset the idle timer.                              |
| `close()`                                    | Close the session (also de-registers from `DelphiClient`).  |
| `onClose(cb)`                                | Register a one-shot close callback.                         |

## Browser actions (BOA)

When the AI tells the browser to do something (`navigate`, `show_alert`,
`copy_to_clipboard`, `set_storage`, custom flows…), the SDK delivers it
via the session's `onAction` callback. The headless `executeBrowserAction`
helper covers the standard ones:

```ts
import { executeBrowserAction } from '@ki-kombinat/delphi-client-js-sdk'

const session = await delphi.openSession({ endpointId, mode: 'voice_conversation' })
session.updateOptions({
    onAction: (action) =>
        executeBrowserAction(action, {
            onNavigate: (path) => router.push(path),
            customHandlers: {
                'fill_invoice_form': async (params) => ({
                    success: true,
                    data: await fillInvoice(params),
                }),
            },
            onUnknownAction: (action) => ({
                success: false,
                error: `No handler for ${action.name}`,
            }),
        }),
})
```

Standard action names live in `StandardActions`:

```ts
import { StandardActions } from '@ki-kombinat/delphi-client-js-sdk'

StandardActions.NAVIGATE              // 'navigate'
StandardActions.NAVIGATE_CURRENT      // 'navigate_current'
StandardActions.SHOW_ALERT            // 'show_alert'
StandardActions.COPY_TO_CLIPBOARD     // 'copy_to_clipboard'
StandardActions.SCROLL_TO             // 'scroll_to'
StandardActions.SET_STORAGE           // 'set_storage'
StandardActions.GET_STORAGE           // 'get_storage'
StandardActions.CUSTOM                // 'custom'
// …and more
```

## React bindings

```tsx
import {
    DelphiClientProvider,
    DelphiConfigInit,
    useDelphiClientContext,
    useDelphiClientState,
    useDelphiSession,
    useBrowserAction,
    useSelectionTracking,
} from '@ki-kombinat/delphi-client-js-sdk/react'
```

### Provider

```tsx
<DelphiClientProvider config={{ apiDomain, apiKey }}>
    <App />
</DelphiClientProvider>
```

If config is only known after auth, omit it on the provider and push it
later with `<DelphiConfigInit config={config} />` deeper in the tree.

### useDelphiSession

Find-or-create a session for an endpoint and subscribe to its state.
Multiple components asking for the same `endpointId` share **one**
WebSocket.

```tsx
function ReadAloudWidget({ endpointId }: { endpointId: string }) {
    const { connected, sendReadAloud, audioDone } = useDelphiSession({
        endpointId,
        mode: 'audio_playback',
    })

    return (
        <button
            disabled={!connected}
            onClick={async () => {
                sendReadAloud('Hello!')
                await audioDone()
            }}
        >
            Speak
        </button>
    )
}
```

### useBrowserAction

```tsx
function CallButton() {
    const handleBrowserAction = useBrowserAction({
        onNavigate: (path) => router.push(path),
        customHandlers: { /* … */ },
    })

    const { sendReadAloud } = useDelphiSession({
        endpointId: 'ext-100',
        mode: 'voice_conversation',
        onAction: handleBrowserAction,
    })

    return <button onClick={() => sendReadAloud('Hi!')}>Read aloud</button>
}
```

### useSelectionTracking

Tracks `window.getSelection()` and lets the user trigger a read-aloud
on the highlighted text.

```tsx
const { sendReadAloud, connected } = useDelphiSession({
    endpointId: 'ext-100',
    mode: 'audio_playback',
})

const { selectedText, handleReadAloudSelected, showReadAloudFab } =
    useSelectionTracking({
        sendReadAloud,
        channelConnected: connected,
        forceEnable: true,  // disable the in-call gating
    })

return (
    <>
        <article>…</article>
        {showReadAloudFab && (
            <button onClick={handleReadAloudSelected}>🔊 Read selected</button>
        )}
    </>
)
```

### useDelphiClientState

Read the orchestrator's state directly (voice-call status, active sessions
list, selected text):

```tsx
const { state, client } = useDelphiClientState()
console.log(state.sessions)  // [{ endpointId, sessionId, mode, connected, lastActivityAt }]
console.log(state.voiceCall) // { inCall, calling, registered, telproDomain, … }
```

## Channel message envelope

```ts
interface ChannelMessage {
    type: ChannelMessageType  // 'chat' | 'browser_action' | 'action' | 'audio' | …
    sessionId: string
    messageId: string
    streamId?: string         // Redis Stream entry id (replayable)
    timestamp: number
    direction: 'to_browser' | 'to_ari'

    // One of (depending on `type`):
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
```

Builders for each message type are exported from the package root
(`createChatMessage`, `createBrowserActionMessage`, …) for tests and
custom integrations.

## Reconnect

Voice-call state is persisted to `sessionStorage` for ~20 seconds after
disconnect, so a page reload during a call automatically resumes:

```tsx
useEffect(() => {
    const stored = delphi.restorePersistedCall()
    if (stored) delphi.reconnectCall(stored).catch(console.error)
}, [delphi])
```

`SessionClient` itself auto-reconnects its WebSocket on transient
disconnects (codes 1006, 1011, etc.) with exponential backoff disabled —
configurable via `reconnectDelay`.

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                            DelphiClient                                │
│  - getCapabilities()  - openSession()  - readAloud()  - startCall()    │
│  - getSession()       - endSession()   - endAllSessions()              │
│                                                                        │
│   WebRTC gateway + SIP (only when mode === 'voice_conversation')       │
│   sessions Map<endpointId, SessionClient>                              │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                            SessionClient                               │
│  Channel WebSocket per session.                                        │
│  send/subscribe/audioDone/setBrowserContext/sendBrowserAction…         │
└────────────────────────────────────────────────────────────────────────┘
```

The two clients are independent: you can use `SessionClient` directly if
you've obtained a `sessionId` + `wsToken` some other way (e.g. server
issues them and forwards via WebSocket).

## Build & publishing

This package ships ESM + CJS dual builds with full `.d.ts` typings:

```
dist/
├── index.mjs / index.cjs       Core entry
├── react/index.mjs / .cjs      React entry
└── *.d.ts / *.d.cts            Types
```

`sideEffects: false`, so bundlers can tree-shake unused exports.

To publish:

```bash
pnpm run build              # builds ESM + CJS + d.ts
npm pack --dry-run          # inspect what will be published
npm publish --access public # publish to the public registry
```

The `prepublishOnly` script enforces lint + type-check + build before any
publish. `engines.node >= 18` is declared.

## Compatibility

- **Browsers**: any modern browser with `WebSocket`, `fetch`, and
  `RTCPeerConnection` (the latter only required for `voice_conversation`).
- **Node**: only used for builds/tests; the SDK itself is browser-only.
- **React**: `>=18` (uses `useSyncExternalStore`).
- **TypeScript**: `>=5.0` recommended.

## License

MIT — © Ki-Kombinat. See [LICENSE](LICENSE).
