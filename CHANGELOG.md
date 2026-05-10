# Changelog

All notable changes to `@ki-kombinat/delphi-client-js-sdk` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
