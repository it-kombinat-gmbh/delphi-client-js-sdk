import { useCallback, useEffect, useMemo, useState } from 'react'

import type { BrowserContext, BrowserNavigationCatalog } from '../../../../src/core'
import { publishBrowserContext } from '../../../../src/core'

export type DemoRoute = '/demo/home' | '/demo/products'

const DEMO_LINKS: BrowserNavigationCatalog['links'] = [
    {
        id: 'home',
        url: '/demo/home',
        title: 'Demo Home',
        description: 'Landing page for the BTA navigation demo',
    },
    {
        id: 'products',
        url: '/demo/products',
        title: 'Demo Products',
        description: 'Product list with searchable items',
    },
]

const PRODUCT_CATALOG = [
    { id: 'widget', title: 'Widget Pro', url: '/demo/products#widget', snippet: 'Flagship widget' },
    {
        id: 'gadget',
        title: 'Gadget Lite',
        url: '/demo/products#gadget',
        snippet: 'Lightweight gadget',
    },
    { id: 'sensor', title: 'Sensor Hub', url: '/demo/products#sensor', snippet: 'IoT sensor hub' },
]

function pathFromLocation(): DemoRoute {
    const path = window.location.pathname
    if (path === '/demo/products') return '/demo/products'
    return '/demo/home'
}

function titleFor(route: DemoRoute): string {
    return route === '/demo/products' ? 'Demo Products' : 'Demo Home'
}

export interface BtaDemoSitesProps {
    /** Publish durable browser context to the active voice session (optional). */
    setBrowserContext?: (ctx: BrowserContext) => boolean
    /** Latest search results shown in the UI */
    searchResults?: Array<{ id?: string; title?: string; url: string; snippet?: string }>
    onSearchResultsClear?: () => void
}

/**
 * Two-page SPA demo for Browser Targeted Actions (BTA):
 * - publishes url / title / readyState / navigation.links on route change
 * - responds to History API / onNavigate from the SDK
 */
export function BtaDemoSites({
    setBrowserContext,
    searchResults,
    onSearchResultsClear,
}: BtaDemoSitesProps) {
    const [route, setRoute] = useState<DemoRoute>(() =>
        typeof window === 'undefined' ? '/demo/home' : pathFromLocation(),
    )
    const [readyState, setReadyState] = useState<'loading' | 'ready'>('ready')
    const [lastContextNote, setLastContextNote] = useState('')

    const publish = useCallback(
        (next: DemoRoute, state: 'loading' | 'ready', extra?: Partial<BrowserContext>) => {
            const ctx = publishBrowserContext({
                url: next,
                title: titleFor(next),
                readyState: state,
                source: state === 'ready' ? 'page_ready' : 'route_change',
                navigation: {
                    links: DEMO_LINKS,
                    ...(extra?.navigation ?? {}),
                },
                ...extra,
            })
            const sent = setBrowserContext?.(ctx) ?? false
            setLastContextNote(`${state} @ ${next}${sent ? ' (sent)' : ' (no active session)'}`)
        },
        [setBrowserContext],
    )

    const navigateTo = useCallback(
        (next: DemoRoute) => {
            if (next === route) return
            setReadyState('loading')
            publish(next, 'loading')
            window.history.pushState({}, '', next)
            setRoute(next)
            // Simulate SPA content becoming ready
            window.setTimeout(() => {
                setReadyState('ready')
                publish(next, 'ready')
            }, 250)
        },
        [publish, route],
    )

    // Expose for WebRTCPhone onNavigate wiring
    useEffect(() => {
        ;(
            window as unknown as { __delphiDemoNavigate?: (path: string) => void }
        ).__delphiDemoNavigate = (path: string) => {
            if (path.startsWith('/demo/products')) navigateTo('/demo/products')
            else if (path.startsWith('/demo/home') || path === '/' || path.startsWith('/demo'))
                navigateTo('/demo/home')
            else {
                window.history.pushState({}, '', path)
            }
        }
        return () => {
            delete (window as unknown as { __delphiDemoNavigate?: (path: string) => void })
                .__delphiDemoNavigate
        }
    }, [navigateTo])

    useEffect(() => {
        const onPop = () => {
            const next = pathFromLocation()
            setRoute(next)
            setReadyState('ready')
            publish(next, 'ready')
        }
        window.addEventListener('popstate', onPop)
        // Ensure we are on a demo path and publish initial context
        if (!window.location.pathname.startsWith('/demo/')) {
            window.history.replaceState({}, '', '/demo/home')
            setRoute('/demo/home')
        }
        publish(pathFromLocation(), 'ready')
        return () => window.removeEventListener('popstate', onPop)
    }, [publish])

    const products = useMemo(() => {
        if (searchResults && searchResults.length > 0) return searchResults
        return PRODUCT_CATALOG
    }, [searchResults])

    return (
        <section className="rounded-xl border border-indigo-200 bg-white p-5 shadow-sm space-y-4">
            <div>
                <h2 className="text-lg font-semibold text-gray-900">BTA demo sites</h2>
                <p className="text-sm text-gray-500 mt-1">
                    Two SPA pages for Browser Targeted Actions. The AI can{' '}
                    <code className="text-xs font-mono">navigate_current</code>,{' '}
                    <code className="text-xs font-mono">navigate</code>,{' '}
                    <code className="text-xs font-mono">show_alert</code>, or custom{' '}
                    <code className="text-xs font-mono">run_search</code>. This page publishes{' '}
                    <code className="text-xs font-mono">url</code>,{' '}
                    <code className="text-xs font-mono">readyState</code>, and{' '}
                    <code className="text-xs font-mono">navigation.links</code> via{' '}
                    <code className="text-xs font-mono">setBrowserContext</code>.
                </p>
            </div>

            <div className="flex flex-wrap gap-2 items-center text-sm">
                <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 border ${
                        route === '/demo/home'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-700 border-gray-300'
                    }`}
                    onClick={() => navigateTo('/demo/home')}
                >
                    Home
                </button>
                <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 border ${
                        route === '/demo/products'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-700 border-gray-300'
                    }`}
                    onClick={() => navigateTo('/demo/products')}
                >
                    Products
                </button>
                <span className="text-xs text-gray-500 font-mono">
                    {readyState} · {route}
                </span>
            </div>

            <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 min-h-[120px]">
                {readyState === 'loading' ? (
                    <p className="text-sm text-gray-500">Loading page…</p>
                ) : route === '/demo/home' ? (
                    <div className="space-y-2">
                        <h3 className="font-semibold text-gray-900">Demo Home</h3>
                        <p className="text-sm text-gray-600">
                            Welcome to the BTA browsing demo. Ask the voice agent to open Products,
                            show an alert, or search for a product.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="font-semibold text-gray-900">Demo Products</h3>
                            {searchResults && searchResults.length > 0 && (
                                <button
                                    type="button"
                                    className="text-xs text-indigo-600"
                                    onClick={onSearchResultsClear}
                                >
                                    Clear search
                                </button>
                            )}
                        </div>
                        <ul className="space-y-2">
                            {products.map((p) => (
                                <li
                                    key={p.id ?? p.url}
                                    className="rounded-md border border-gray-200 bg-white px-3 py-2"
                                >
                                    <div className="font-medium text-sm text-gray-900">
                                        {p.title ?? p.url}
                                    </div>
                                    {p.snippet && (
                                        <div className="text-xs text-gray-500">{p.snippet}</div>
                                    )}
                                    <div className="text-xs font-mono text-gray-400">{p.url}</div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <p className="text-xs text-gray-400 font-mono">Context: {lastContextNote || '—'}</p>
        </section>
    )
}

/** Used by customHandlers.run_search in WebRTCPhone */
export function runDemoSearch(query: string) {
    const q = query.trim().toLowerCase()
    return PRODUCT_CATALOG.filter(
        (p) =>
            !q ||
            p.title.toLowerCase().includes(q) ||
            p.snippet.toLowerCase().includes(q) ||
            p.id.includes(q),
    )
}
