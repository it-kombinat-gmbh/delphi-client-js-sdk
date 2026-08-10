import type { BrowserContext, BrowserNavigationCatalog } from './channelTypes'

/**
 * Merge helper for partial browser-context updates.
 * Host apps typically call `session.setBrowserContext(publishBrowserContext(...))`.
 */
export function publishBrowserContext(
    partial: BrowserContext,
    previous?: BrowserContext | null,
): BrowserContext {
    const prevNav = previous?.navigation
    const nextNav = partial.navigation
    const navigation: BrowserNavigationCatalog | undefined =
        nextNav || prevNav
            ? {
                  links: nextNav?.links ?? prevNav?.links,
                  searchQuery:
                      nextNav && 'searchQuery' in nextNav
                          ? nextNav.searchQuery
                          : prevNav?.searchQuery,
                  searchResults:
                      nextNav && 'searchResults' in nextNav
                          ? nextNav.searchResults
                          : prevNav?.searchResults,
              }
            : undefined

    return {
        ...previous,
        ...partial,
        ...(navigation ? { navigation } : {}),
        metadata: {
            ...previous?.metadata,
            ...partial.metadata,
        },
    }
}

/**
 * Convenience: build a context update that only refreshes the navigation catalog.
 */
export function setNavigationCatalog(
    catalog: BrowserNavigationCatalog,
    base?: Omit<BrowserContext, 'navigation'>,
): BrowserContext {
    return publishBrowserContext({
        ...base,
        source: base?.source ?? 'navigation_catalog',
        navigation: catalog,
    })
}
