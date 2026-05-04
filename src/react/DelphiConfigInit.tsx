'use client'

import { useEffect } from 'react'

import type { DelphiConfig } from '../core/types'

import { useDelphiClientContext } from './context'

/**
 * Syncs `config` into the nearest `DelphiClient` from context.
 *
 * This is a zero-render component — place it once near the root of your
 * authenticated layout. It must be a descendant of `<DelphiClientProvider>`.
 *
 * Useful when the config (e.g. `apiKey`) is only available after the user has
 * authenticated, so it cannot be passed to the provider directly.
 *
 * @example
 * ```tsx
 * <DelphiClientProvider>
 *   <DelphiConfigInit config={config} />
 *   <App />
 * </DelphiClientProvider>
 * ```
 */
export function DelphiConfigInit({ config }: { config: DelphiConfig }) {
    const client = useDelphiClientContext()

    useEffect(() => {
        client.updateConfig(config)
    }, [client, config])

    return null
}
