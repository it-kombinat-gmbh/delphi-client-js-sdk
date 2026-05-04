'use client'

import { useCallback } from 'react'

import { executeBrowserAction } from '../core/browserActions'
import type { ExecuteBrowserActionOptions, NavigateCallback } from '../core/browserActions'
import type { ActionResult } from '../core/SessionClient'
import type { ActionPayload } from '../core/channelTypes'

/**
 * Returns a stable `onAction` callback that delegates browser-action execution
 * to `executeBrowserAction` from the headless core.
 *
 * Pass the returned handler directly to a `SessionClient`'s `onAction` option
 * or to `useDelphiSession({ onAction })`.
 *
 * @example
 * ```tsx
 * const handleBrowserAction = useBrowserAction(router.push)
 * const { session } = useDelphiSession({ endpointId, mode: 'voice_conversation', onAction: handleBrowserAction })
 * ```
 */
export function useBrowserAction(
    optionsOrNavigate?: ExecuteBrowserActionOptions | NavigateCallback,
): (action: ActionPayload) => Promise<ActionResult> {
    return useCallback(
        (action: ActionPayload): Promise<ActionResult> =>
            executeBrowserAction(action, optionsOrNavigate),
        [optionsOrNavigate],
    )
}
