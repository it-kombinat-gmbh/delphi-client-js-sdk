import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createBrowserActionHandler,
  executeBrowserAction,
} from "./browserActions";

type StorageLike = {
  setItem: ReturnType<typeof vi.fn>;
  getItem: ReturnType<typeof vi.fn>;
};

function installLeftoverBrowserMocks() {
  const open = vi.fn(() => null);
  const pushState = vi.fn();
  const dispatchEvent = vi.fn(() => true);
  const scrollTo = vi.fn();
  const alertFn = vi.fn();
  const confirmFn = vi.fn(() => true);
  const promptFn = vi.fn((): string | null => "typed");
  const location = {
    origin: "http://localhost:5173",
    href: "http://localhost:5173/demo/home",
  };

  const localStore = new Map<string, string>();
  const sessionStore = new Map<string, string>();
  const localStorage: StorageLike = {
    setItem: vi.fn((key: string, value: string) => {
      localStore.set(key, value);
    }),
    getItem: vi.fn((key: string) => localStore.get(key) ?? null),
  };
  const sessionStorage: StorageLike = {
    setItem: vi.fn((key: string, value: string) => {
      sessionStore.set(key, value);
    }),
    getItem: vi.fn((key: string) => sessionStore.get(key) ?? null),
  };

  const elements = new Map<string, Record<string, unknown>>();
  const created: Array<{ value: string; select: ReturnType<typeof vi.fn> }> =
    [];
  const body = {
    appendChild: vi.fn(),
    removeChild: vi.fn(),
    scrollHeight: 2400,
  };
  const documentMock = {
    querySelector: vi.fn((selector: string) => elements.get(selector) ?? null),
    createElement: vi.fn(() => {
      const el = { value: "", select: vi.fn() };
      created.push(el);
      return el;
    }),
    body,
    execCommand: vi.fn(() => true),
  };
  const writeText = vi.fn(async () => undefined);

  const windowMock = {
    open,
    history: { pushState },
    dispatchEvent,
    location,
    scrollTo,
    alert: alertFn,
    confirm: confirmFn,
    prompt: promptFn,
  };

  vi.stubGlobal("window", windowMock);
  vi.stubGlobal("document", documentMock);
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("sessionStorage", sessionStorage);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  vi.stubGlobal("alert", alertFn);
  vi.stubGlobal("confirm", confirmFn);
  vi.stubGlobal("prompt", promptFn);
  vi.stubGlobal(
    "PopStateEvent",
    class PopStateEvent {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    },
  );

  return {
    open,
    pushState,
    dispatchEvent,
    scrollTo,
    alertFn,
    confirmFn,
    promptFn,
    location,
    localStorage,
    sessionStorage,
    documentMock,
    elements,
    created,
    body,
    writeText,
  };
}

describe("executeBrowserAction leftovers-more", () => {
  let mocks: ReturnType<typeof installLeftoverBrowserMocks>;

  beforeEach(() => {
    mocks = installLeftoverBrowserMocks();
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("normalizeOptions leftovers-more", () => {
    it("treats a leftover bare function as onNavigate", async () => {
      const onNavigate = vi.fn();
      const handler = createBrowserActionHandler(onNavigate);

      await expect(
        handler({ name: "navigate_current", parameters: { url: "/leftover" } }),
      ).resolves.toEqual({
        success: true,
        data: { url: "/leftover", method: "callback" },
      });
      expect(onNavigate).toHaveBeenCalledWith("/leftover");
    });

    it("uses leftover omitted options as an empty object", async () => {
      await expect(
        executeBrowserAction({
          name: "navigate_current",
          parameters: { url: "/leftover" },
        }),
      ).resolves.toEqual({
        success: true,
        data: { url: "/leftover", method: "history" },
      });
      expect(mocks.pushState).toHaveBeenCalledWith({}, "", "/leftover");
    });
  });

  describe("show_alert leftovers-more", () => {
    it("defaults leftover omitted message and skips title", async () => {
      await expect(
        executeBrowserAction({ name: "show_alert", parameters: {} }),
      ).resolves.toEqual({ success: true, data: { dismissed: true } });
      expect(mocks.alertFn).toHaveBeenCalledWith("Alert");
    });

    it("prefixes leftover title when present", async () => {
      await expect(
        executeBrowserAction({
          name: "show_alert",
          parameters: { message: "body", title: "Heads up" },
        }),
      ).resolves.toEqual({ success: true, data: { dismissed: true } });
      expect(mocks.alertFn).toHaveBeenCalledWith("Heads up\n\nbody");
    });

    it("keeps leftover empty title off the prefix branch", async () => {
      await executeBrowserAction({
        name: "show_alert",
        parameters: { message: "body", title: "" },
      });
      expect(mocks.alertFn).toHaveBeenCalledWith("body");
    });
  });

  describe("show_confirm leftovers-more", () => {
    it("defaults leftover omitted message and forwards confirm result", async () => {
      mocks.confirmFn.mockReturnValueOnce(false);
      await expect(
        executeBrowserAction({ name: "show_confirm", parameters: {} }),
      ).resolves.toEqual({ success: true, data: { confirmed: false } });
      expect(mocks.confirmFn).toHaveBeenCalledWith("Confirm?");

      mocks.confirmFn.mockReturnValueOnce(true);
      await expect(
        executeBrowserAction({
          name: "show_confirm",
          parameters: { message: "Continue leftover?" },
        }),
      ).resolves.toEqual({ success: true, data: { confirmed: true } });
      expect(mocks.confirmFn).toHaveBeenCalledWith("Continue leftover?");
    });
  });

  describe("show_prompt leftovers-more", () => {
    it("defaults leftover omitted prompt text and defaultValue", async () => {
      mocks.promptFn.mockReturnValueOnce("typed");
      await expect(
        executeBrowserAction({ name: "show_prompt", parameters: {} }),
      ).resolves.toEqual({
        success: true,
        data: { value: "typed", cancelled: false },
      });
      expect(mocks.promptFn).toHaveBeenCalledWith("Enter value:", "");
    });

    it("maps leftover cancelled prompt null to cancelled true", async () => {
      mocks.promptFn.mockReturnValueOnce(null);
      await expect(
        executeBrowserAction({
          name: "show_prompt",
          parameters: { message: "Name?", defaultValue: "Ada" },
        }),
      ).resolves.toEqual({
        success: true,
        data: { value: null, cancelled: true },
      });
      expect(mocks.promptFn).toHaveBeenCalledWith("Name?", "Ada");
    });
  });

  describe("show_notification leftovers-more", () => {
    it("alerts leftover notification message", async () => {
      await expect(
        executeBrowserAction({
          name: "show_notification",
          parameters: { message: "leftover ping" },
        }),
      ).resolves.toEqual({ success: true });
      expect(mocks.alertFn).toHaveBeenCalledWith("leftover ping");
    });
  });

  describe("navigate leftovers-more", () => {
    it("rejects leftover missing navigate url", async () => {
      await expect(
        executeBrowserAction({ name: "navigate", parameters: {} }),
      ).resolves.toEqual({ success: false, error: "No URL provided" });
      expect(mocks.open).not.toHaveBeenCalled();
    });

    it("opens leftover explicit and empty targets through window.open", async () => {
      await expect(
        executeBrowserAction({
          name: "navigate",
          parameters: { url: "https://example.com/a", target: "_blank" },
        }),
      ).resolves.toEqual({
        success: true,
        data: {
          url: "https://example.com/a",
          target: "_blank",
          method: "window_open",
        },
      });
      expect(mocks.open).toHaveBeenCalledWith(
        "https://example.com/a",
        "_blank",
      );

      await expect(
        executeBrowserAction({
          name: "navigate",
          parameters: { url: "https://example.com/b", target: "" },
        }),
      ).resolves.toEqual({
        success: true,
        data: {
          url: "https://example.com/b",
          target: "_blank",
          method: "window_open",
        },
      });
      expect(mocks.open).toHaveBeenCalledWith(
        "https://example.com/b",
        "_blank",
      );
    });

    it("routes leftover _self same-origin URLs through history when onNavigate is unused", async () => {
      await expect(
        executeBrowserAction({
          name: "navigate",
          parameters: {
            url: "http://localhost:5173/demo/leftover",
            target: "_self",
          },
        }),
      ).resolves.toEqual({
        success: true,
        data: { url: "/demo/leftover", method: "history" },
      });
      expect(mocks.open).not.toHaveBeenCalled();
      expect(mocks.pushState).toHaveBeenCalledWith({}, "", "/demo/leftover");
      expect(mocks.dispatchEvent).toHaveBeenCalled();
    });
  });

  describe("navigate_current leftovers-more", () => {
    it("rejects leftover missing navigate_current url", async () => {
      await expect(
        executeBrowserAction({ name: "navigate_current", parameters: {} }),
      ).resolves.toEqual({ success: false, error: "No URL provided" });
    });

    it("assigns leftover external urls to location.href", async () => {
      await expect(
        executeBrowserAction({
          name: "navigate_current",
          parameters: { url: "https://example.com/out" },
        }),
      ).resolves.toEqual({
        success: true,
        data: { url: "https://example.com/out", method: "full" },
      });
      expect(mocks.location.href).toBe("https://example.com/out");
    });
  });

  describe("copy_to_clipboard leftovers-more", () => {
    it("rejects leftover missing clipboard text", async () => {
      await expect(
        executeBrowserAction({ name: "copy_to_clipboard", parameters: {} }),
      ).resolves.toEqual({ success: false, error: "No text provided" });
      expect(mocks.writeText).not.toHaveBeenCalled();
    });

    it("copies leftover text through the clipboard API", async () => {
      await expect(
        executeBrowserAction({
          name: "copy_to_clipboard",
          parameters: { text: "leftover-clip" },
        }),
      ).resolves.toEqual({ success: true, data: { copied: true } });
      expect(mocks.writeText).toHaveBeenCalledWith("leftover-clip");
    });

    it("falls back leftover when clipboard write rejects", async () => {
      mocks.writeText.mockRejectedValueOnce(new Error("denied"));

      await expect(
        executeBrowserAction({
          name: "copy_to_clipboard",
          parameters: { text: "fallback-clip" },
        }),
      ).resolves.toEqual({
        success: true,
        data: { copied: true, method: "fallback" },
      });

      expect(mocks.documentMock.createElement).toHaveBeenCalledWith("textarea");
      expect(mocks.created[0]?.value).toBe("fallback-clip");
      expect(mocks.created[0]?.select).toHaveBeenCalledTimes(1);
      expect(mocks.body.appendChild).toHaveBeenCalledWith(mocks.created[0]);
      expect(mocks.documentMock.execCommand).toHaveBeenCalledWith("copy");
      expect(mocks.body.removeChild).toHaveBeenCalledWith(mocks.created[0]);
    });
  });

  describe("storage leftovers-more", () => {
    it("rejects leftover missing storage keys", async () => {
      await expect(
        executeBrowserAction({
          name: "set_storage",
          parameters: { value: "x" },
        }),
      ).resolves.toEqual({ success: false, error: "No key provided" });
      await expect(
        executeBrowserAction({ name: "get_storage", parameters: {} }),
      ).resolves.toEqual({ success: false, error: "No key provided" });
    });

    it("writes leftover string values to localStorage by default", async () => {
      await expect(
        executeBrowserAction({
          name: "set_storage",
          parameters: { key: "k", value: "plain" },
        }),
      ).resolves.toEqual({
        success: true,
        data: { key: "k", storageType: "local" },
      });
      expect(mocks.localStorage.setItem).toHaveBeenCalledWith("k", "plain");
      expect(mocks.sessionStorage.setItem).not.toHaveBeenCalled();
    });

    it("stringifies leftover non-string values and uses session storage", async () => {
      await expect(
        executeBrowserAction({
          name: "set_storage",
          parameters: {
            key: "k",
            value: { leftover: true },
            storageType: "session",
          },
        }),
      ).resolves.toEqual({
        success: true,
        data: { key: "k", storageType: "session" },
      });
      expect(mocks.sessionStorage.setItem).toHaveBeenCalledWith(
        "k",
        JSON.stringify({ leftover: true }),
      );
    });

    it("reads leftover found and missing keys from the selected store", async () => {
      mocks.localStorage.getItem.mockReturnValueOnce("hit");
      await expect(
        executeBrowserAction({
          name: "get_storage",
          parameters: { key: "k" },
        }),
      ).resolves.toEqual({
        success: true,
        data: { key: "k", value: "hit", found: true },
      });

      mocks.sessionStorage.getItem.mockReturnValueOnce(null);
      await expect(
        executeBrowserAction({
          name: "get_storage",
          parameters: { key: "missing", storageType: "session" },
        }),
      ).resolves.toEqual({
        success: true,
        data: { key: "missing", value: null, found: false },
      });
    });
  });

  describe("scroll_to leftovers-more", () => {
    it("scrolls leftover matching selectors into view", async () => {
      const el = { scrollIntoView: vi.fn() };
      mocks.elements.set("#leftover", el);

      await expect(
        executeBrowserAction({
          name: "scroll_to",
          parameters: { selector: "#leftover" },
        }),
      ).resolves.toEqual({ success: true, data: { selector: "#leftover" } });
      expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth" });
    });

    it("fails leftover selectors that are not in the document", async () => {
      await expect(
        executeBrowserAction({
          name: "scroll_to",
          parameters: { selector: "#gone", behavior: "auto" },
        }),
      ).resolves.toEqual({ success: false, error: "Element not found: #gone" });
    });

    it("scrolls leftover omitted selector to top or bottom", async () => {
      await expect(
        executeBrowserAction({ name: "scroll_to", parameters: {} }),
      ).resolves.toEqual({ success: true, data: { position: "top" } });
      expect(mocks.scrollTo).toHaveBeenCalledWith({
        top: 0,
        behavior: "smooth",
      });

      await expect(
        executeBrowserAction({
          name: "scroll_to",
          parameters: { position: "bottom", behavior: "instant" },
        }),
      ).resolves.toEqual({ success: true, data: { position: "bottom" } });
      expect(mocks.scrollTo).toHaveBeenCalledWith({
        top: 2400,
        behavior: "instant",
      });
    });
  });

  describe("click_element leftovers-more", () => {
    it("rejects leftover missing and unmatched selectors", async () => {
      await expect(
        executeBrowserAction({ name: "click_element", parameters: {} }),
      ).resolves.toEqual({ success: false, error: "No selector provided" });
      await expect(
        executeBrowserAction({
          name: "click_element",
          parameters: { selector: "#gone" },
        }),
      ).resolves.toEqual({ success: false, error: "Element not found: #gone" });
    });

    it("clicks leftover matching elements", async () => {
      const el = { click: vi.fn() };
      mocks.elements.set("#go", el);

      await expect(
        executeBrowserAction({
          name: "click_element",
          parameters: { selector: "#go" },
        }),
      ).resolves.toEqual({ success: true, data: { selector: "#go" } });
      expect(el.click).toHaveBeenCalledTimes(1);
    });
  });

  describe("fill_form leftovers-more", () => {
    it("rejects leftover missing fields", async () => {
      await expect(
        executeBrowserAction({ name: "fill_form", parameters: {} }),
      ).resolves.toEqual({ success: false, error: "No fields provided" });
    });

    it("fills leftover found fields and records missing ones", async () => {
      const email = { value: "", dispatchEvent: vi.fn() };
      mocks.elements.set("#email", email);

      await expect(
        executeBrowserAction({
          name: "fill_form",
          parameters: {
            fields: { "#email": "a@b.com", "#gone": "nope" },
          },
        }),
      ).resolves.toEqual({
        success: false,
        data: { filledCount: 1, errors: ["Not found: #gone"] },
      });
      expect(email.value).toBe("a@b.com");
      expect(email.dispatchEvent).toHaveBeenCalledTimes(2);

      await expect(
        executeBrowserAction({
          name: "fill_form",
          parameters: { fields: { "#email": "only" } },
        }),
      ).resolves.toEqual({
        success: true,
        data: { filledCount: 1, errors: [] },
      });
    });
  });

  describe("custom and unknown leftovers-more", () => {
    it("uses leftover custom type when it is a non-empty string", async () => {
      const search = vi.fn(async () => ({ success: true, data: { hits: 1 } }));
      await expect(
        executeBrowserAction(
          { name: "custom", parameters: { type: "search", q: "leftover" } },
          { customHandlers: { search } },
        ),
      ).resolves.toEqual({ success: true, data: { hits: 1 } });
      expect(search).toHaveBeenCalledWith({
        name: "custom",
        parameters: { type: "search", q: "leftover" },
      });
    });

    it("falls through leftover blank type to the custom handler key", async () => {
      const custom = vi.fn(() => ({ success: true, data: { via: "custom" } }));
      await expect(
        executeBrowserAction(
          { name: "custom", parameters: { type: "   " } },
          { customHandlers: { custom } },
        ),
      ).resolves.toEqual({ success: true, data: { via: "custom" } });
    });

    it("falls through leftover missing type key to customHandlers.custom", async () => {
      const custom = vi.fn(() => ({
        success: true,
        data: { via: "fallback" },
      }));
      await expect(
        executeBrowserAction(
          { name: "custom", parameters: { type: "unregistered" } },
          { customHandlers: { custom } },
        ),
      ).resolves.toEqual({ success: true, data: { via: "fallback" } });
    });

    it("errors leftover custom actions without a handler", async () => {
      await expect(
        executeBrowserAction({
          name: "custom",
          parameters: { type: 12 },
        }),
      ).resolves.toEqual({
        success: false,
        error: "Unsupported custom browser action: custom",
      });
    });

    it("uses leftover onUnknownAction after named handlers miss", async () => {
      const onUnknownAction = vi.fn(() => ({
        success: true,
        data: { unknown: true },
      }));
      await expect(
        executeBrowserAction(
          { name: "no_such_action", parameters: { x: 1 } },
          { onUnknownAction },
        ),
      ).resolves.toEqual({ success: true, data: { unknown: true } });
      expect(onUnknownAction).toHaveBeenCalledWith({
        name: "no_such_action",
        parameters: { x: 1 },
      });
    });

    it("errors leftover unknown actions with no fallback", async () => {
      await expect(
        executeBrowserAction({ name: "no_such_action", parameters: {} }),
      ).resolves.toEqual({
        success: false,
        error: "Unknown action: no_such_action",
      });
    });
  });
});
