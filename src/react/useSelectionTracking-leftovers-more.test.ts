import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLogger } from "../core/utils/sdkLogger";

const leftoverHooks = vi.hoisted(() => {
  let effectCleanup: (() => void) | undefined;
  return {
    runEffect(effect: () => void | (() => void)) {
      effectCleanup?.();
      const cleanup = effect();
      effectCleanup = typeof cleanup === "function" ? cleanup : undefined;
    },
    flushEffect() {
      effectCleanup?.();
      effectCleanup = undefined;
    },
  };
});

type LeftoverVoiceCall = { inCall: boolean };

type LeftoverClientState = {
  voiceCall: LeftoverVoiceCall;
  selectedText: string;
};

function leftoverClientState(
  overrides: Partial<LeftoverClientState> = {},
): LeftoverClientState {
  return {
    voiceCall: { inCall: false, ...overrides.voiceCall },
    selectedText: overrides.selectedText ?? "",
  };
}

function createLeftoverClient(initial: Partial<LeftoverClientState> = {}) {
  let state = leftoverClientState(initial);
  return {
    subscribe: vi.fn((cb: () => void) => {
      return () => {
        void cb;
      };
    }),
    getState: vi.fn(() => state),
    setSelectedText: vi.fn((text: string) => {
      state = { ...state, selectedText: text };
    }),
    replaceState(next: Partial<LeftoverClientState>) {
      state = leftoverClientState({ ...state, ...next });
    },
  };
}

let leftoverClient = createLeftoverClient();

vi.mock("./context", () => ({
  useDelphiClientContext: () => leftoverClient,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: <T extends (...args: never[]) => unknown>(fn: T) => fn,
    useSyncExternalStore: <T>(
      subscribe: (onStoreChange: () => void) => () => void,
      getSnapshot: () => T,
    ) => {
      subscribe(() => undefined);
      return getSnapshot();
    },
    useEffect: (effect: () => void | (() => void)) => {
      leftoverHooks.runEffect(effect);
    },
  };
});

import { useSelectionTracking } from "./useSelectionTracking";

const leftoverLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

class LeftoverHtmlInput {
  value = "";
  selectionStart: number | null = 0;
  selectionEnd: number | null = 0;
}

class LeftoverHtmlTextarea extends LeftoverHtmlInput {}

type LeftoverListener = EventListenerOrEventListenerObject;

function leftoverTextNode(
  value: string,
  parent: { nodeType: number; parentNode: null },
) {
  return {
    nodeType: 3,
    nodeValue: value,
    parentNode: parent,
  };
}

function installLeftoverDom() {
  const listeners = new Map<string, Set<LeftoverListener>>();
  const leftoverElement = { nodeType: 1, parentNode: null };
  let walkerNodes: Array<ReturnType<typeof leftoverTextNode>> = [];
  const createdRange = {
    setStart: vi.fn(),
    setEnd: vi.fn(),
  };
  const selection = {
    rangeCount: 0,
    isCollapsed: true,
    toString: vi.fn(() => ""),
    removeAllRanges: vi.fn(),
    addRange: vi.fn(),
    getRangeAt: vi.fn(),
  };

  const leftoverDocument = {
    activeElement: null as object | null,
    addEventListener: vi.fn((type: string, handler: LeftoverListener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(handler);
    }),
    removeEventListener: vi.fn((type: string, handler: LeftoverListener) => {
      listeners.get(type)?.delete(handler);
    }),
    createTreeWalker: vi.fn(() => {
      let index = -1;
      return {
        nextNode: () => {
          index += 1;
          return walkerNodes[index] ?? null;
        },
      };
    }),
    createRange: vi.fn(() => createdRange),
  };

  vi.stubGlobal("HTMLInputElement", LeftoverHtmlInput);
  vi.stubGlobal("HTMLTextAreaElement", LeftoverHtmlTextarea);
  vi.stubGlobal("Node", { ELEMENT_NODE: 1, TEXT_NODE: 3 });
  vi.stubGlobal("NodeFilter", { SHOW_TEXT: 4 });
  vi.stubGlobal("document", leftoverDocument);
  vi.stubGlobal("window", {
    getSelection: vi.fn(() => selection),
  });

  return {
    leftoverDocument,
    leftoverElement,
    createdRange,
    selection,
    listeners,
    setWalkerNodes(nodes: Array<ReturnType<typeof leftoverTextNode>>) {
      walkerNodes = nodes;
    },
    fire(type: string) {
      for (const handler of listeners.get(type) ?? []) {
        if (typeof handler === "function") handler(new Event(type));
      }
    },
  };
}

let leftoverDom: ReturnType<typeof installLeftoverDom>;

function leftoverTracking(
  overrides: {
    sendReadAloud?: (text: string) => void;
    channelConnected?: boolean;
    forceEnable?: boolean;
    omitForceEnable?: boolean;
  } = {},
) {
  const sendReadAloud = overrides.sendReadAloud ?? vi.fn();
  if (overrides.omitForceEnable) {
    return {
      sendReadAloud,
      ...useSelectionTracking({
        sendReadAloud,
        channelConnected: overrides.channelConnected ?? false,
      }),
    };
  }
  return {
    sendReadAloud,
    ...useSelectionTracking({
      sendReadAloud,
      channelConnected: overrides.channelConnected ?? false,
      forceEnable: overrides.forceEnable ?? false,
    }),
  };
}

beforeEach(() => {
  leftoverClient = createLeftoverClient();
  leftoverDom = installLeftoverDom();
  leftoverLogger.debug.mockReset();
  leftoverLogger.info.mockReset();
  leftoverLogger.warn.mockReset();
  leftoverLogger.error.mockReset();
  setLogger(leftoverLogger);
});

afterEach(() => {
  leftoverHooks.flushEffect();
  setLogger(undefined);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useSelectionTracking leftovers-more enablement", () => {
  it("disables leftover-more tracking when forceEnable is omitted and the call is idle", () => {
    leftoverClient.replaceState({ voiceCall: { inCall: false } });

    const tracking = leftoverTracking({
      channelConnected: true,
      omitForceEnable: true,
    });

    expect(tracking.showReadAloudFab).toBe(false);
    expect(leftoverLogger.info).toHaveBeenCalledWith(
      "[SelectionTracking] Disabled",
      {
        inCall: false,
        channelConnected: true,
        forceEnable: false,
      },
    );
    expect(leftoverClient.setSelectedText).toHaveBeenCalledWith("");
    expect(
      leftoverDom.leftoverDocument.addEventListener,
    ).not.toHaveBeenCalled();
  });

  it("enables leftover-more tracking when in a connected call", () => {
    leftoverClient.replaceState({ voiceCall: { inCall: true } });

    leftoverTracking({ channelConnected: true });

    expect(leftoverLogger.info).toHaveBeenCalledWith(
      "[SelectionTracking] Enabled",
      {
        inCall: true,
        channelConnected: true,
        forceEnable: false,
      },
    );
    expect(leftoverDom.leftoverDocument.addEventListener).toHaveBeenCalledWith(
      "selectionchange",
      expect.any(Function),
    );
    expect(leftoverDom.leftoverDocument.addEventListener).toHaveBeenCalledWith(
      "select",
      expect.any(Function),
      true,
    );
    expect(leftoverDom.leftoverDocument.addEventListener).toHaveBeenCalledWith(
      "mouseup",
      expect.any(Function),
    );
    expect(leftoverDom.leftoverDocument.addEventListener).toHaveBeenCalledWith(
      "keyup",
      expect.any(Function),
    );
  });

  it("enables leftover-more tracking via forceEnable without an in-call session", () => {
    leftoverClient.replaceState({ voiceCall: { inCall: false } });

    leftoverTracking({ channelConnected: false, forceEnable: true });

    expect(leftoverLogger.info).toHaveBeenCalledWith(
      "[SelectionTracking] Enabled",
      {
        inCall: false,
        channelConnected: false,
        forceEnable: true,
      },
    );
    expect(leftoverDom.leftoverDocument.addEventListener).toHaveBeenCalledTimes(
      4,
    );
  });

  it("removes leftover-more listeners when the enabled effect is flushed", () => {
    leftoverTracking({ forceEnable: true });
    leftoverHooks.flushEffect();

    expect(
      leftoverDom.leftoverDocument.removeEventListener,
    ).toHaveBeenCalledWith("selectionchange", expect.any(Function));
    expect(
      leftoverDom.leftoverDocument.removeEventListener,
    ).toHaveBeenCalledWith("select", expect.any(Function), true);
    expect(
      leftoverDom.leftoverDocument.removeEventListener,
    ).toHaveBeenCalledWith("mouseup", expect.any(Function));
    expect(
      leftoverDom.leftoverDocument.removeEventListener,
    ).toHaveBeenCalledWith("keyup", expect.any(Function));
  });
});

describe("useSelectionTracking leftovers-more getCurrentSelectedText", () => {
  it("reads leftover-more input selection and trims it", () => {
    leftoverTracking({ forceEnable: true });
    const input = new LeftoverHtmlInput();
    input.value = "  leftover selected  ";
    input.selectionStart = 2;
    input.selectionEnd = 19;
    leftoverDom.leftoverDocument.activeElement = input;

    leftoverDom.fire("keyup");

    expect(leftoverClient.setSelectedText).toHaveBeenCalledWith(
      "leftover selected",
    );
    expect(leftoverLogger.info).toHaveBeenCalledWith(
      "[SelectionTracking] Captured selected text",
      {
        source: "keyup",
        textLength: 17,
        preview: "leftover selected",
      },
    );
  });

  it("reads leftover-more textarea selection with reversed start/end", () => {
    leftoverTracking({ forceEnable: true });
    const textarea = new LeftoverHtmlTextarea();
    textarea.value = "leftover reversed";
    textarea.selectionStart = 17;
    textarea.selectionEnd = 9;
    leftoverDom.leftoverDocument.activeElement = textarea;

    leftoverDom.fire("select");

    expect(leftoverClient.setSelectedText).toHaveBeenCalledWith("reversed");
    expect(leftoverLogger.info).toHaveBeenCalledWith(
      "[SelectionTracking] Captured selected text",
      {
        source: "select",
        textLength: 8,
        preview: "reversed",
      },
    );
  });

  it("falls through leftover-more collapsed or null input selection to window.getSelection", () => {
    leftoverTracking({ forceEnable: true });
    const input = new LeftoverHtmlInput();
    input.value = "leftover";
    input.selectionStart = 3;
    input.selectionEnd = 3;
    leftoverDom.leftoverDocument.activeElement = input;
    leftoverDom.selection.toString.mockReturnValue("  window leftover  ");

    leftoverDom.fire("selectionchange");

    expect(leftoverClient.setSelectedText).toHaveBeenCalledWith(
      "window leftover",
    );

    leftoverClient.setSelectedText.mockClear();
    leftoverLogger.info.mockClear();
    input.selectionStart = null;
    leftoverDom.selection.toString.mockReturnValue("");
    leftoverClient.replaceState({ selectedText: "previous leftover" });

    leftoverDom.fire("selectionchange");

    expect(leftoverClient.setSelectedText).toHaveBeenCalledWith("");
    expect(leftoverLogger.info).toHaveBeenCalledWith(
      "[SelectionTracking] Cleared selected text",
      {
        source: "selectionchange",
      },
    );
  });

  it("returns leftover-more empty text when window.getSelection is missing", () => {
    leftoverTracking({ forceEnable: true });
    leftoverDom.leftoverDocument.activeElement = { kind: "div" };
    vi.mocked(window.getSelection).mockReturnValue(null);

    leftoverDom.fire("keyup");

    expect(leftoverClient.setSelectedText).toHaveBeenCalledWith("");
    expect(leftoverLogger.info).not.toHaveBeenCalledWith(
      "[SelectionTracking] Captured selected text",
      expect.anything(),
    );
  });

  it("previews leftover-more captured text at 120 characters", () => {
    leftoverTracking({ forceEnable: true });
    leftoverDom.leftoverDocument.activeElement = { kind: "div" };
    const leftoverLong = "L".repeat(125);
    leftoverDom.selection.toString.mockReturnValue(leftoverLong);

    leftoverDom.fire("keyup");

    expect(leftoverClient.setSelectedText).toHaveBeenCalledWith(leftoverLong);
    expect(leftoverLogger.info).toHaveBeenCalledWith(
      "[SelectionTracking] Captured selected text",
      {
        source: "keyup",
        textLength: 125,
        preview: "L".repeat(120),
      },
    );
  });
});

describe("useSelectionTracking leftovers-more expandSelectionToSentence", () => {
  function leftoverSentenceRange(
    startOffset: number,
    endOffset: number,
    text = "Aaa. Bbb leftover ccc.",
  ) {
    const node = leftoverTextNode(text, leftoverDom.leftoverElement);
    leftoverDom.setWalkerNodes([node]);
    leftoverDom.selection.rangeCount = 1;
    leftoverDom.selection.isCollapsed = false;
    leftoverDom.selection.getRangeAt.mockReturnValue({
      commonAncestorContainer: node,
      startContainer: node,
      startOffset,
      endContainer: node,
      endOffset,
    });
    leftoverDom.leftoverDocument.activeElement = { kind: "div" };
    leftoverDom.selection.toString.mockReturnValue(
      text.slice(startOffset, endOffset),
    );
    return node;
  }

  it("returns leftover-more without expanding a missing, empty, or collapsed selection", () => {
    leftoverTracking({ forceEnable: true });
    leftoverDom.leftoverDocument.activeElement = { kind: "div" };
    leftoverDom.selection.toString.mockReturnValue("leftover");

    vi.mocked(window.getSelection).mockReturnValueOnce(null);
    leftoverDom.fire("mouseup");
    expect(
      leftoverDom.leftoverDocument.createTreeWalker,
    ).not.toHaveBeenCalled();

    leftoverDom.selection.rangeCount = 0;
    leftoverDom.selection.isCollapsed = false;
    leftoverDom.fire("mouseup");
    expect(
      leftoverDom.leftoverDocument.createTreeWalker,
    ).not.toHaveBeenCalled();

    leftoverDom.selection.rangeCount = 1;
    leftoverDom.selection.isCollapsed = true;
    leftoverDom.fire("mouseup");
    expect(
      leftoverDom.leftoverDocument.createTreeWalker,
    ).not.toHaveBeenCalled();
    expect(leftoverClient.setSelectedText).toHaveBeenCalledWith("leftover");
  });

  it("returns leftover-more when the walker finds no text or the range nodes are unused", () => {
    leftoverTracking({ forceEnable: true });
    leftoverDom.leftoverDocument.activeElement = { kind: "div" };
    leftoverDom.selection.rangeCount = 1;
    leftoverDom.selection.isCollapsed = false;
    leftoverDom.setWalkerNodes([]);
    leftoverDom.selection.getRangeAt.mockReturnValue({
      commonAncestorContainer: leftoverDom.leftoverElement,
      startContainer: leftoverDom.leftoverElement,
      startOffset: 0,
      endContainer: leftoverDom.leftoverElement,
      endOffset: 1,
    });

    leftoverDom.fire("mouseup");
    expect(leftoverDom.leftoverDocument.createRange).not.toHaveBeenCalled();

    const leftoverNode = leftoverTextNode(
      "leftover text",
      leftoverDom.leftoverElement,
    );
    leftoverDom.setWalkerNodes([leftoverNode]);
    leftoverDom.selection.getRangeAt.mockReturnValue({
      commonAncestorContainer: leftoverDom.leftoverElement,
      startContainer: { nodeValue: "other" },
      startOffset: 0,
      endContainer: { nodeValue: "other" },
      endOffset: 4,
    });

    leftoverDom.fire("mouseup");
    expect(leftoverDom.leftoverDocument.createRange).not.toHaveBeenCalled();
  });

  it("expands leftover-more mid-sentence selection to the surrounding sentence", () => {
    leftoverTracking({ forceEnable: true });
    leftoverSentenceRange(9, 17);

    leftoverDom.fire("mouseup");

    expect(leftoverDom.createdRange.setStart).toHaveBeenCalledWith(
      expect.anything(),
      5,
    );
    expect(leftoverDom.createdRange.setEnd).toHaveBeenCalledWith(
      expect.anything(),
      22,
    );
    expect(leftoverDom.selection.removeAllRanges).toHaveBeenCalledTimes(1);
    expect(leftoverDom.selection.addRange).toHaveBeenCalledWith(
      leftoverDom.createdRange,
    );
    expect(leftoverClient.setSelectedText).toHaveBeenCalledWith("leftover");
  });

  it("keeps leftover-more selection that is already a sentence and swaps reversed offsets", () => {
    leftoverTracking({ forceEnable: true });
    leftoverSentenceRange(5, 22);

    leftoverDom.fire("mouseup");
    expect(leftoverDom.leftoverDocument.createRange).not.toHaveBeenCalled();

    leftoverSentenceRange(17, 9);
    leftoverDom.fire("mouseup");
    expect(leftoverDom.createdRange.setStart).toHaveBeenCalledWith(
      expect.anything(),
      5,
    );
    expect(leftoverDom.createdRange.setEnd).toHaveBeenCalledWith(
      expect.anything(),
      22,
    );
  });

  it("uses leftover-more node-boundary mapping across two text nodes", () => {
    leftoverTracking({ forceEnable: true });
    const first = leftoverTextNode("Aaa. ", leftoverDom.leftoverElement);
    const second = leftoverTextNode(
      "Bbb leftover ccc.",
      leftoverDom.leftoverElement,
    );
    leftoverDom.setWalkerNodes([first, second]);
    leftoverDom.selection.rangeCount = 1;
    leftoverDom.selection.isCollapsed = false;
    leftoverDom.selection.getRangeAt.mockReturnValue({
      commonAncestorContainer: leftoverDom.leftoverElement,
      startContainer: second,
      startOffset: 4,
      endContainer: second,
      endOffset: 12,
    });
    leftoverDom.leftoverDocument.activeElement = { kind: "div" };
    leftoverDom.selection.toString.mockReturnValue("leftover");

    leftoverDom.fire("mouseup");

    expect(leftoverDom.createdRange.setStart).toHaveBeenCalledWith(second, 0);
    expect(leftoverDom.createdRange.setEnd).toHaveBeenCalledWith(second, 17);
  });

  it("falls through leftover-more empty nodeValue and expands to the full leftover text without punctuation", () => {
    leftoverTracking({ forceEnable: true });
    const empty = leftoverTextNode("", leftoverDom.leftoverElement);
    empty.nodeValue = null as unknown as string;
    const leftoverOnly = leftoverTextNode(
      "leftover words only",
      leftoverDom.leftoverElement,
    );
    leftoverDom.setWalkerNodes([empty, leftoverOnly]);
    leftoverDom.selection.rangeCount = 1;
    leftoverDom.selection.isCollapsed = false;
    leftoverDom.selection.getRangeAt.mockReturnValue({
      commonAncestorContainer: leftoverOnly,
      startContainer: leftoverOnly,
      startOffset: 0,
      endContainer: leftoverOnly,
      endOffset: 8,
    });
    leftoverDom.leftoverDocument.activeElement = { kind: "div" };
    leftoverDom.selection.toString.mockReturnValue("leftover");

    leftoverDom.fire("mouseup");

    expect(leftoverDom.createdRange.setStart).toHaveBeenCalledWith(
      leftoverOnly,
      0,
    );
    expect(leftoverDom.createdRange.setEnd).toHaveBeenCalledWith(
      leftoverOnly,
      19,
    );
  });
});

describe("useSelectionTracking leftovers-more read-aloud FAB", () => {
  it("does not send leftover-more read-aloud when text is empty or tracking is disabled", () => {
    leftoverClient.replaceState({ selectedText: "" });
    const empty = leftoverTracking({ forceEnable: true });
    empty.handleReadAloudSelected();
    expect(empty.sendReadAloud).not.toHaveBeenCalled();
    expect(empty.showReadAloudFab).toBe(false);

    leftoverClient.replaceState({
      selectedText: "leftover",
      voiceCall: { inCall: false },
    });
    const disabled = leftoverTracking({
      channelConnected: false,
      forceEnable: false,
    });
    disabled.handleReadAloudSelected();
    expect(disabled.sendReadAloud).not.toHaveBeenCalled();
    expect(disabled.showReadAloudFab).toBe(false);
    expect(leftoverDom.selection.removeAllRanges).not.toHaveBeenCalled();
  });

  it("sends leftover-more selected text, clears the selection, and shows the FAB when enabled", () => {
    leftoverClient.replaceState({ selectedText: "leftover aloud" });
    const tracking = leftoverTracking({ forceEnable: true });

    expect(tracking.selectedText).toBe("leftover aloud");
    expect(tracking.showReadAloudFab).toBe(true);

    tracking.handleReadAloudSelected();

    expect(tracking.sendReadAloud).toHaveBeenCalledWith("leftover aloud");
    expect(leftoverDom.selection.removeAllRanges).toHaveBeenCalledTimes(1);
    expect(leftoverClient.setSelectedText).toHaveBeenCalledWith("");
  });

  it("skips leftover-more removeAllRanges when getSelection is missing after send", () => {
    leftoverClient.replaceState({ selectedText: "leftover" });
    vi.mocked(window.getSelection).mockReturnValue(null);
    const tracking = leftoverTracking({ forceEnable: true });

    tracking.handleReadAloudSelected();

    expect(tracking.sendReadAloud).toHaveBeenCalledWith("leftover");
    expect(leftoverClient.setSelectedText).toHaveBeenCalledWith("");
  });
});
