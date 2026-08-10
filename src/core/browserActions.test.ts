import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBrowserActionHandler, executeBrowserAction } from './browserActions'

function installWindowMock() {
    const open = vi.fn(() => null)
    const pushState = vi.fn()
    const dispatchEvent = vi.fn(() => true)
    const location = { origin: 'http://localhost:5173', href: 'http://localhost:5173/demo/home' }
    ;(globalThis as unknown as { window: unknown }).window = {
        open,
        history: { pushState },
        dispatchEvent,
        location,
    }
    ;(globalThis as unknown as { PopStateEvent: unknown }).PopStateEvent = class PopStateEvent {
        type: string
        constructor(type: string) {
            this.type = type
        }
    }
    return { open, pushState, dispatchEvent, location }
}

describe('executeBrowserAction navigation (BTA)', () => {
    let mocks: ReturnType<typeof installWindowMock>

    beforeEach(() => {
        mocks = installWindowMock()
    })

    afterEach(() => {
        vi.restoreAllMocks()
        // @ts-expect-error cleanup
        delete globalThis.window
    })

    it('navigate opens a new tab by default', async () => {
        const result = await executeBrowserAction({
            name: 'navigate',
            parameters: { url: 'https://example.com/x' },
        })
        expect(result).toEqual({
            success: true,
            data: { url: 'https://example.com/x', target: '_blank', method: 'window_open' },
        })
        expect(mocks.open).toHaveBeenCalledWith('https://example.com/x', '_blank')
    })

    it('navigate with target _self uses SPA onNavigate', async () => {
        const onNavigate = vi.fn()
        const result = await executeBrowserAction(
            {
                name: 'navigate',
                parameters: { url: '/demo/products', target: '_self' },
            },
            { onNavigate },
        )
        expect(mocks.open).not.toHaveBeenCalled()
        expect(onNavigate).toHaveBeenCalledWith('/demo/products')
        expect(result).toMatchObject({
            success: true,
            data: { url: '/demo/products', method: 'callback' },
        })
    })

    it('navigate_current uses onNavigate for internal paths', async () => {
        const onNavigate = vi.fn()
        const result = await executeBrowserAction(
            {
                name: 'navigate_current',
                parameters: { url: '/demo/home' },
            },
            { onNavigate },
        )
        expect(onNavigate).toHaveBeenCalledWith('/demo/home')
        expect(result).toMatchObject({ success: true, data: { method: 'callback' } })
    })

    it('navigate_current falls back to history when no onNavigate', async () => {
        const result = await executeBrowserAction({
            name: 'navigate_current',
            parameters: { url: '/demo/home' },
        })
        expect(mocks.pushState).toHaveBeenCalled()
        expect(mocks.dispatchEvent).toHaveBeenCalled()
        expect(result).toMatchObject({ success: true, data: { method: 'history' } })
    })

    it('customHandlers run for named custom actions', async () => {
        const run_search = vi.fn(async () => ({ success: true, data: { hits: 2 } }))
        const result = await executeBrowserAction(
            { name: 'run_search', parameters: { query: 'widgets' } },
            { customHandlers: { run_search } },
        )
        expect(run_search).toHaveBeenCalled()
        expect(result).toEqual({ success: true, data: { hits: 2 } })
    })

    it('createBrowserActionHandler wraps executeBrowserAction', async () => {
        const onNavigate = vi.fn()
        const handler = createBrowserActionHandler({ onNavigate })
        await handler({ name: 'navigate_current', parameters: { url: '/x' } })
        expect(onNavigate).toHaveBeenCalledWith('/x')
    })
})
