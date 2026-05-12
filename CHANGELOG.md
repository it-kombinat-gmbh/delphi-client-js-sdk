# Changelog

All notable changes to `@ki-kombinat/delphi-client-js-sdk` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2026-05-12

### Changed

- **Session map is keyed by `endpointId` + `SessionMode`** — the same endpoint
  can hold a `voice_conversation` speaker and a `listen` subscriber at once,
  each with its own token, `sessionId`, and channel WebSocket. `getSession` now
  accepts an optional `mode`; omitting it returns an arbitrary match for that
  endpoint (avoid when multiple modes are open). `endSession(endpointId)` still
  closes every mode for that endpoint; pass `endSession(endpointId, mode)` to
  close one.

### Fixed

- **Voice session open** — `telproDomain` and `webrtcGatewayUrl` are required
  and validated **before** the client caches a `voice_conversation` entry, so
  failed token responses do not wedge retries. `startCall` clears preparing
  state when `openSession` throws; if runtime state is missing gateway
  metadata (e.g. after upgrading from an older SDK), `startCall` attempts
  recovery via `endCall` before surfacing errors.

### Updated

- **React** — `useDelphiSession` resolves `getSession(endpointId, mode)` so hooks
  align with the mode-specific map.
- **Examples** — interpretation listener avoids duplicate `listen` subscriptions
  on repeated clicks; read-aloud “End session” closes `audio_playback` only.

## [0.1.2] - 2026-05-10

### Added

- **Interpretation speaker / listener** — `SessionMode` `'listen'`,
  `DelphiClient.listen()`, `SessionClient.listen()`, and `ListenOptions` for
  subscribing to TelPhi interpretation streams (replay + live). Speaker side
  uses `voice_conversation` with `BrowserContext.role: 'speaker'`; listener
  uses `'listen'` with `role: 'listener'` and matching `identifier` / scope.

Published under the npm scope **`@ki-kombinat`**.

## [0.1.0]

Initial release. See the [README](./README.md) for the full API surface.
