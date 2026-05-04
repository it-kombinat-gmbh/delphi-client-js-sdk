import type { Logger } from '../types'

const defaultLogger: Logger = {
    debug: (...args) => console.debug(...args),
    info: (...args) => console.info(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
}

let _debug = defaultLogger.debug
let _info = defaultLogger.info
let _warn = defaultLogger.warn
let _error = defaultLogger.error

/**
 * Module-level singleton logger used throughout the SDK.
 * Routes to the logger supplied in `DelphiConfig.logger`, falling back to `console`.
 */
export const logger: Logger = {
    debug: (...args) => _debug(...args),
    info: (...args) => _info(...args),
    warn: (...args) => _warn(...args),
    error: (...args) => _error(...args),
}

/**
 * Update the SDK logger. Called automatically when config is updated.
 * Pass `undefined` to revert to the default `console` logger.
 */
export function setLogger(customLogger: Logger | undefined): void {
    _debug = customLogger?.debug ?? defaultLogger.debug
    _info = customLogger?.info ?? defaultLogger.info
    _warn = customLogger?.warn ?? defaultLogger.warn
    _error = customLogger?.error ?? defaultLogger.error
}

/** Routes through the configured SDK logger with a `[DelphiClient]` prefix */
export const logDebug = (...args: unknown[]) => logger.debug('[DelphiClient]', ...args)
