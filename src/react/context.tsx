'use client'

import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'

import { DelphiClient } from '../core/DelphiClient'
import type { DelphiConfig } from '../core/types'

// =============================================================================
// Context
// =============================================================================

const DelphiClientContext = createContext<DelphiClient | null>(null)

// =============================================================================
// Provider
// =============================================================================

export interface DelphiClientProviderProps {
    /** Initial configuration. Can be omitted when using `DelphiConfigInit` to push config later. */
    config?: DelphiConfig
    children: ReactNode
}

/**
 * Provides a `DelphiClient` instance to the React tree.
 *
 * Mount this once at the root (or around the part of the tree that needs the
 * phone). The client is created on mount, kept stable across re-renders (even
 * if `config` changes reference), and destroyed on unmount.
 *
 * @example
 * ```tsx
 * <DelphiClientProvider config={{ apiDomain, apiKey }}>
 *   <App />
 * </DelphiClientProvider>
 * ```
 */
export function DelphiClientProvider({ config, children }: DelphiClientProviderProps) {
    // Create the client once — use a ref so it survives StrictMode double-mount
    const clientRef = useRef<DelphiClient | null>(null)
    if (!clientRef.current) {
        clientRef.current = new DelphiClient(config ?? {})
    }
    const client = clientRef.current

    // Keep config in sync without recreating the client
    useEffect(() => {
        if (config) client.updateConfig(config)
    }, [client, config])

    // Destroy on unmount
    useEffect(() => {
        return () => {
            client.destroy()
            clientRef.current = null
        }
    }, [])

    // Stable value reference (client object is stable)
    const value = useMemo(() => client, [client])

    return <DelphiClientContext.Provider value={value}>{children}</DelphiClientContext.Provider>
}

// =============================================================================
// Consumer hook
// =============================================================================

/**
 * Returns the nearest `DelphiClient` from context.
 * Must be used inside `<DelphiClientProvider>`.
 */
export function useDelphiClientContext(): DelphiClient {
    const client = useContext(DelphiClientContext)
    if (!client) {
        throw new Error(
            '[delphi-sdk] useDelphiClientContext must be used inside <DelphiClientProvider>',
        )
    }
    return client
}
