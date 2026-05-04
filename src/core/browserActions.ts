import type { ActionPayload } from './channelTypes'
import { logDebug } from './utils/sdkLogger'

export type BrowserActionName =
    | 'show_alert'
    | 'show_confirm'
    | 'show_prompt'
    | 'show_notification'
    | 'navigate'
    | 'navigate_current'
    | 'copy_to_clipboard'
    | 'set_storage'
    | 'get_storage'
    | 'scroll_to'
    | 'click_element'
    | 'fill_form'
    | 'custom'

export interface NavigateActionParameters {
    url: string
}

export interface ShowAlertActionParameters {
    message: string
    title?: string
}

export interface CustomBrowserActionParameters {
    type?: string
    [key: string]: unknown
}

/**
 * Synchronous return value from a browser action.
 */
export interface BrowserActionSyncResult {
    success: boolean
    data?: unknown
    error?: string
}

/**
 * Async indicator — the action will complete later.
 * Call `sendAsyncActionResult()` on the `SessionClient` once done.
 */
export interface BrowserActionAsyncResult {
    async: true
    message?: string
}

export type BrowserActionResult = BrowserActionSyncResult | BrowserActionAsyncResult

export type BrowserActionHandler = (
    action: Pick<ActionPayload, 'name' | 'parameters'>,
) => Promise<BrowserActionResult> | BrowserActionResult

/**
 * Optional callback for SPA-router navigation.
 * When not provided, the `navigate_current` action falls back to the History API.
 */
export type NavigateCallback = (path: string) => void

export interface ExecuteBrowserActionOptions {
    onNavigate?: NavigateCallback
    customHandlers?: Record<string, BrowserActionHandler>
    onUnknownAction?: BrowserActionHandler
}

function normalizeOptions(
    optionsOrNavigate?: ExecuteBrowserActionOptions | NavigateCallback,
): ExecuteBrowserActionOptions {
    return typeof optionsOrNavigate === 'function'
        ? { onNavigate: optionsOrNavigate }
        : (optionsOrNavigate ?? {})
}

function customActionKey(action: Pick<ActionPayload, 'name' | 'parameters'>): string {
    const type = action.parameters['type']
    return typeof type === 'string' && type.trim().length > 0 ? type : action.name
}

/**
 * Execute a browser action dispatched by the AI.
 *
 * This is a pure function with no React or store dependencies — pass it directly
 * to `SessionClient` as the `onAction` callback, or call it manually.
 *
 * @param action     - The action payload from the AI
 * @param onNavigate - Optional SPA-router callback used by `navigate_current`
 */
export async function executeBrowserAction(
    action: Pick<ActionPayload, 'name' | 'parameters'>,
    optionsOrNavigate?: ExecuteBrowserActionOptions | NavigateCallback,
): Promise<BrowserActionResult> {
    const options = normalizeOptions(optionsOrNavigate)
    logDebug('Browser action received:', action.name, action.parameters)

    switch (action.name) {
        // ===================================================================
        // Alert / Notification actions
        // ===================================================================
        case 'show_alert': {
            const message = (action.parameters['message'] as string) || 'Alert'
            const title = action.parameters['title'] as string | undefined
            alert(title ? `${title}\n\n${message}` : message)
            return { success: true, data: { dismissed: true } }
        }

        case 'show_confirm': {
            const message = (action.parameters['message'] as string) || 'Confirm?'
            const confirmed = confirm(message)
            return { success: true, data: { confirmed } }
        }

        case 'show_prompt': {
            const message = (action.parameters['message'] as string) || 'Enter value:'
            const defaultValue = (action.parameters['defaultValue'] as string) ?? ''
            const result = prompt(message, defaultValue)
            return { success: true, data: { value: result, cancelled: result === null } }
        }

        case 'show_notification': {
            const msg = action.parameters['message'] as string
            alert(msg)
            return { success: true }
        }

        // ===================================================================
        // Navigation actions
        // ===================================================================
        case 'navigate': {
            const url = action.parameters['url'] as string
            if (!url) return { success: false, error: 'No URL provided' }
            window.open(url, '_blank')
            return { success: true, data: { url } }
        }

        case 'navigate_current': {
            const url = action.parameters['url'] as string
            if (!url) return { success: false, error: 'No URL provided' }

            const isInternal = url.startsWith('/') || url.startsWith(window.location.origin)

            if (isInternal) {
                const path = url.startsWith('/') ? url : url.replace(window.location.origin, '')

                if (options.onNavigate) {
                    options.onNavigate(path)
                    return { success: true, data: { url: path, method: 'callback' } }
                }
                // Fallback to History API (works with most SPA routers)
                window.history.pushState({}, '', path)
                window.dispatchEvent(new PopStateEvent('popstate'))
                return { success: true, data: { url: path, method: 'history' } }
            }

            window.location.href = url
            return { success: true, data: { url, method: 'full' } }
        }

        // ===================================================================
        // Clipboard actions
        // ===================================================================
        case 'copy_to_clipboard': {
            const text = action.parameters['text'] as string
            if (!text) return { success: false, error: 'No text provided' }
            try {
                await navigator.clipboard.writeText(text)
                return { success: true, data: { copied: true } }
            } catch {
                // Fallback for environments without clipboard API
                const el = document.createElement('textarea')
                el.value = text
                document.body.appendChild(el)
                el.select()
                document.execCommand('copy')
                document.body.removeChild(el)
                return { success: true, data: { copied: true, method: 'fallback' } }
            }
        }

        // ===================================================================
        // Storage actions
        // ===================================================================
        case 'set_storage': {
            const key = action.parameters['key'] as string
            const value = action.parameters['value'] as string
            const storageType = (action.parameters['storageType'] as string) || 'local'
            if (!key) return { success: false, error: 'No key provided' }

            const storage = storageType === 'session' ? sessionStorage : localStorage
            storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
            return { success: true, data: { key, storageType } }
        }

        case 'get_storage': {
            const key = action.parameters['key'] as string
            const storageType = (action.parameters['storageType'] as string) || 'local'
            if (!key) return { success: false, error: 'No key provided' }

            const storage = storageType === 'session' ? sessionStorage : localStorage
            const value = storage.getItem(key)
            return { success: true, data: { key, value, found: value !== null } }
        }

        // ===================================================================
        // Page interaction
        // ===================================================================
        case 'scroll_to': {
            const selector = action.parameters['selector'] as string
            const behavior =
                (action.parameters['behavior'] as ScrollBehavior | undefined) ?? 'smooth'

            if (selector) {
                const el = document.querySelector(selector)
                if (el) {
                    el.scrollIntoView({ behavior })
                    return { success: true, data: { selector } }
                }
                return { success: false, error: `Element not found: ${selector}` }
            }

            // Fallback: scroll to top / bottom
            const position = action.parameters['position'] as string | undefined
            const top = position === 'bottom' ? document.body.scrollHeight : 0
            window.scrollTo({ top, behavior })
            return { success: true, data: { position: position ?? 'top' } }
        }

        case 'click_element': {
            const selector = action.parameters['selector'] as string
            if (!selector) return { success: false, error: 'No selector provided' }

            const el = document.querySelector<HTMLElement>(selector)
            if (!el) return { success: false, error: `Element not found: ${selector}` }

            el.click()
            return { success: true, data: { selector } }
        }

        case 'fill_form': {
            const fields = action.parameters['fields'] as Record<string, string> | undefined
            if (!fields) return { success: false, error: 'No fields provided' }

            let filledCount = 0
            const errors: string[] = []

            for (const [selector, value] of Object.entries(fields)) {
                const el = document.querySelector<
                    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
                >(selector)
                if (el) {
                    el.value = value
                    el.dispatchEvent(new Event('input', { bubbles: true }))
                    el.dispatchEvent(new Event('change', { bubbles: true }))
                    filledCount++
                } else {
                    errors.push(`Not found: ${selector}`)
                }
            }

            return {
                success: errors.length === 0,
                data: { filledCount, errors },
            }
        }

        case 'custom': {
            const key = customActionKey(action)
            const handler = options.customHandlers?.[key] ?? options.customHandlers?.custom
            if (handler) return handler(action)
            return {
                success: false,
                error: `Unsupported custom browser action: ${key}`,
            }
        }

        // ===================================================================
        // Unknown action
        // ===================================================================
        default:
            {
                const handler = options.customHandlers?.[action.name]
                if (handler) return handler(action)
            }
            if (options.onUnknownAction) {
                return options.onUnknownAction(action)
            }
            logDebug(`Unknown browser action: ${action.name}`)
            return {
                success: false,
                error: `Unknown action: ${action.name}`,
            }
    }
}
