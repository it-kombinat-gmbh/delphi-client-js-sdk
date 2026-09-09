import { describe, expect, it } from "vitest";

import { publishBrowserContext, setNavigationCatalog } from "./browserContext";
import type { BrowserContext, BrowserNavigationCatalog } from "./channelTypes";

const leftoverPrevNav: BrowserNavigationCatalog = {
  links: [{ url: "/prev", title: "Previous leftover" }],
  searchQuery: "prev-query",
  searchResults: [
    { url: "/prev-hit", title: "Prev hit", snippet: "old", score: 0.2 },
  ],
};

const leftoverNextNav: BrowserNavigationCatalog = {
  links: [{ url: "/next", title: "Next leftover", id: "n1" }],
  searchQuery: "next-query",
  searchResults: [
    { url: "/next-hit", title: "Next hit", snippet: "new", score: 0.9 },
  ],
};

function leftoverPrevious(
  overrides: Partial<BrowserContext> = {},
): BrowserContext {
  return {
    url: "/prev-page",
    title: "Prev title",
    source: "page_ready",
    readyState: "ready",
    navigation: leftoverPrevNav,
    metadata: { from: "previous", keep: true },
    ...overrides,
  };
}

describe("publishBrowserContext leftovers-more", () => {
  it("omits leftover navigation when neither partial nor previous advertise a catalog", () => {
    expect(
      publishBrowserContext({ url: "/solo", title: "Solo leftover" }),
    ).toEqual({
      url: "/solo",
      title: "Solo leftover",
      metadata: {},
    });
    expect(publishBrowserContext({ url: "/solo" }, null)).toEqual({
      url: "/solo",
      metadata: {},
    });
  });

  it("keeps leftover previous navigation when the partial update has none", () => {
    expect(
      publishBrowserContext({ url: "/updated" }, leftoverPrevious()),
    ).toEqual({
      url: "/updated",
      title: "Prev title",
      source: "page_ready",
      readyState: "ready",
      navigation: leftoverPrevNav,
      metadata: { from: "previous", keep: true },
    });
  });

  it("uses leftover next navigation when previous is unused", () => {
    expect(
      publishBrowserContext({
        url: "/fresh",
        navigation: leftoverNextNav,
      }),
    ).toEqual({
      url: "/fresh",
      navigation: leftoverNextNav,
      metadata: {},
    });
  });

  it("prefers leftover next links and falls through omitted next links to previous", () => {
    expect(
      publishBrowserContext({ navigation: leftoverNextNav }, leftoverPrevious())
        .navigation?.links,
    ).toEqual(leftoverNextNav.links);

    expect(
      publishBrowserContext(
        { navigation: { searchQuery: "only-query" } },
        leftoverPrevious(),
      ).navigation?.links,
    ).toEqual(leftoverPrevNav.links);

    expect(
      publishBrowserContext({ navigation: { links: [] } }, leftoverPrevious())
        .navigation?.links,
    ).toEqual([]);
  });

  it("keeps leftover previous searchQuery when next navigation omits that key", () => {
    expect(
      publishBrowserContext(
        { navigation: { links: leftoverNextNav.links } },
        leftoverPrevious(),
      ).navigation,
    ).toEqual({
      links: leftoverNextNav.links,
      searchQuery: leftoverPrevNav.searchQuery,
      searchResults: leftoverPrevNav.searchResults,
    });
  });

  it("overwrites leftover previous searchQuery when the next key is present", () => {
    expect(
      publishBrowserContext(
        { navigation: { searchQuery: "replaced" } },
        leftoverPrevious(),
      ).navigation?.searchQuery,
    ).toBe("replaced");

    expect(
      publishBrowserContext(
        { navigation: { searchQuery: undefined } },
        leftoverPrevious(),
      ).navigation?.searchQuery,
    ).toBeUndefined();
  });

  it("keeps leftover previous searchResults when next navigation omits that key", () => {
    expect(
      publishBrowserContext(
        { navigation: { searchQuery: "replaced" } },
        leftoverPrevious(),
      ).navigation?.searchResults,
    ).toEqual(leftoverPrevNav.searchResults);
  });

  it("overwrites leftover previous searchResults when the next key is present", () => {
    expect(
      publishBrowserContext(
        { navigation: { searchResults: leftoverNextNav.searchResults } },
        leftoverPrevious(),
      ).navigation?.searchResults,
    ).toEqual(leftoverNextNav.searchResults);

    expect(
      publishBrowserContext(
        { navigation: { searchResults: undefined } },
        leftoverPrevious(),
      ).navigation?.searchResults,
    ).toBeUndefined();
  });

  it("merges leftover metadata and overwrites colliding keys from the partial", () => {
    expect(
      publishBrowserContext(
        { metadata: { from: "partial", extra: 1 } },
        leftoverPrevious(),
      ).metadata,
    ).toEqual({ from: "partial", keep: true, extra: 1 });

    expect(
      publishBrowserContext({ url: "/no-meta" }, leftoverPrevious()).metadata,
    ).toEqual({ from: "previous", keep: true });
  });

  it("overwrites leftover previous page fields from the partial", () => {
    expect(
      publishBrowserContext(
        {
          url: "/next-page",
          title: "Next title",
          source: "route_change",
          readyState: "loading",
          identifier: "sel-leftover",
        },
        leftoverPrevious(),
      ),
    ).toMatchObject({
      url: "/next-page",
      title: "Next title",
      source: "route_change",
      readyState: "loading",
      identifier: "sel-leftover",
    });
  });
});

describe("setNavigationCatalog leftovers-more", () => {
  it("defaults leftover omitted base source to navigation_catalog", () => {
    expect(setNavigationCatalog(leftoverNextNav)).toEqual({
      source: "navigation_catalog",
      navigation: leftoverNextNav,
      metadata: {},
    });
  });

  it("keeps leftover explicit base source and page fields", () => {
    expect(
      setNavigationCatalog(leftoverNextNav, {
        url: "/catalog",
        title: "Catalog leftover",
        source: "search",
        metadata: { catalog: true },
      }),
    ).toEqual({
      url: "/catalog",
      title: "Catalog leftover",
      source: "search",
      navigation: leftoverNextNav,
      metadata: { catalog: true },
    });
  });

  it("falls through leftover missing base source while keeping other base fields", () => {
    expect(
      setNavigationCatalog(
        { links: leftoverNextNav.links },
        { url: "/catalog" },
      ),
    ).toEqual({
      url: "/catalog",
      source: "navigation_catalog",
      navigation: {
        links: leftoverNextNav.links,
        searchQuery: undefined,
        searchResults: undefined,
      },
      metadata: {},
    });
  });
});
