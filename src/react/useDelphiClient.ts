'use client'

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

import { DelphiClient } from '../core/DelphiClient'
import type { DelphiClientState } from '../core/DelphiClient'
import type { DelphiConfig } from '../core/types'

import { useDelphiClientContext } from './context'

// =============================================================================
// useDelphiClientState — subscribe to an existing client from context
// =============================================================================

/**
 * Subscribes to the `DelphiClient` provided by `<DelphiClientProvider>` and
 * returns the current state + the client instance.
 *
 * @example
 * ```tsx
 * const { state, client } = useDelphiClientState()
 * return <button onClick={() => client.startCall({ endpointId: 'ep_1' })}>Call</button>
 * ```
 */
export function useDelphiClientState(): {
    state: Readonly<DelphiClientState>
    client: DelphiClient
} {
    const client = useDelphiClientContext()
    const subscribe = useCallback((cb: () => void) => client.subscribe(cb), [client])
    const getSnapshot = useCallback(() => client.getState(), [client])
    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    return { state, client }
}

// =============================================================================
// useDelphiClient — standalone hook (no Provider needed)
// =============================================================================

/**
 * Creates and manages a `DelphiClient` instance scoped to the calling component.
 * Use this when you don't want a context provider (e.g. self-contained phone widget).
 *
 * The client is created once (ref-stable across StrictMode) and destroyed on unmount.
 *
 * @example
 * ```tsx
 * function PhoneWidget() {
 *   const { state, client } = useDelphiClient({ apiDomain, apiKey })
 *   // ...
 * }
 * ```
 */
export function useDelphiClient(config: DelphiConfig): {
    state: Readonly<DelphiClientState>
    client: DelphiClient
} {
    const clientRef = useRef<DelphiClient | null>(null)
    if (!clientRef.current) {
        clientRef.current = new DelphiClient(config)
    }
    const client = clientRef.current

    useEffect(() => {
        client.updateConfig(config)
    }, [client, config])

    const subscribe = useCallback((cb: () => void) => client.subscribe(cb), [client])
    const getSnapshot = useCallback(() => client.getState(), [client])
    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

    return { state, client }
}
