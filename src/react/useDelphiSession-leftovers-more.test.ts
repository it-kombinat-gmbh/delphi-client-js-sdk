import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  BrowserActionPayload,
  ChannelMessage,
} from "../core/channelTypes";
import type { BrowserAudioEvent, SessionState } from "../core/SessionClient";
import type { SessionMode } from "../core/types";

const leftoverHooks = vi.hoisted(() => {
  const cleanups: Array<(() => void) | undefined> = [];
  return {
    runEffect(effect: () => void | (() => void)) {
      const cleanup = effect();
      cleanups.push(typeof cleanup === "function" ? cleanup : undefined);
    },
    flushEffects() {
      while (cleanups.length > 0) {
        cleanups.pop()?.();
      }
    },
  };
});

function leftoverSessionState(
  overrides: Partial<SessionState> = {},
): SessionState {
  return {
    connectionState: "disconnected",
    connected: false,
    serverReady: false,
    sessionId: null,
    endpointId: null,
    mode: null,
    textChatEnabled: false,
    messages: [],
    lastError: null,
    audioRequestPending: false,
    audioPlaying: false,
    lastActivityAt: 0,
    ...overrides,
  };
}

function leftoverChannelMessage(): ChannelMessage {
  return {
    type: "chat",
    sessionId: "session-leftover",
    messageId: "message-leftover",
    timestamp: 1_725_000_000_000,
    direction: "to_browser",
    chat: { content: "leftover chat", role: "assistant" },
  };
}

function leftoverAudioEvent(): BrowserAudioEvent {
  return {
    responseId: "response-leftover",
    mimeType: "audio/mpeg",
    dataUrl: "data:audio/mpeg;base64,YQ==",
  };
}

function createLeftoverSession(stateOverrides: Partial<SessionState> = {}) {
  const state = leftoverSessionState(stateOverrides);
  return {
    subscribe: vi.fn((cb: () => void) => {
      return () => {
        void cb;
      };
    }),
    getState: vi.fn(() => state),
    updateOptions: vi.fn(),
    sendChat: vi.fn().mockReturnValue(true),
    sendContextUpdate: vi.fn().mockReturnValue(true),
    setBrowserContext: vi.fn().mockReturnValue(true),
    setSelectionContext: vi.fn().mockReturnValue(true),
    sendTextChat: vi.fn().mockReturnValue(true),
    sendReadAloud: vi.fn().mockReturnValue(true),
    sendBrowserAction: vi.fn().mockReturnValue(true),
    listen: vi.fn().mockReturnValue(true),
    enableTextChat: vi.fn().mockReturnValue(true),
    disableTextChat: vi.fn().mockReturnValue(true),
    setResponseMode: vi.fn().mockReturnValue(true),
    sendAsyncActionResult: vi.fn().mockReturnValue(true),
    sendActionProgress: vi.fn().mockReturnValue(true),
    sendActionUpdateChat: vi.fn().mockReturnValue(true),
    sendMessage: vi.fn().mockReturnValue(true),
    audioDone: vi.fn().mockResolvedValue(leftoverAudioEvent()),
    close: vi.fn().mockResolvedValue(undefined),
    clearMessages: vi.fn(),
  };
}

function createLeftoverDelphi(
  session: ReturnType<typeof createLeftoverSession> | null = null,
) {
  return {
    subscribe: vi.fn((cb: () => void) => {
      return () => {
        void cb;
      };
    }),
    getSession: vi.fn((_endpointId: string, _mode: SessionMode) => {
      void _endpointId;
      void _mode;
      return session;
    }),
    openSession: vi.fn().mockResolvedValue(session ?? createLeftoverSession()),
  };
}

let leftoverDelphi = createLeftoverDelphi();

vi.mock("./context", () => ({
  useDelphiClientContext: () => leftoverDelphi,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: <T extends (...args: never[]) => unknown>(fn: T) => fn,
    useMemo: <T>(factory: () => T) => factory(),
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

import { useDelphiSession } from "./useDelphiSession";
import type { UseDelphiSessionOptions } from "./useDelphiSession";

async function leftoverTick() {
  await Promise.resolve();
}

function leftoverHook(overrides: Partial<UseDelphiSessionOptions> = {}) {
  return useDelphiSession({
    endpointId: "ep-leftover",
    mode: "audio_playback",
    ...overrides,
  });
}

beforeEach(() => {
  leftoverDelphi = createLeftoverDelphi();
});

afterEach(() => {
  leftoverHooks.flushEffects();
  vi.restoreAllMocks();
});

describe("useDelphiSession leftovers-more idle endpoint", () => {
  it("returns leftover-more idle bindings when endpointId is null", async () => {
    const result = leftoverHook({ endpointId: null });

    expect(leftoverDelphi.getSession).not.toHaveBeenCalled();
    expect(leftoverDelphi.openSession).not.toHaveBeenCalled();
    expect(result.session).toBeNull();
    expect(result.connectionState).toBe("disconnected");
    expect(result.connected).toBe(false);
    expect(result.serverReady).toBe(false);
    expect(result.sessionId).toBeNull();
    expect(result.textChatEnabled).toBe(false);
    expect(result.messages).toEqual([]);
    expect(result.lastError).toBeNull();
    expect(result.audioRequestPending).toBe(false);
    expect(result.audioPlaying).toBe(false);
    expect(result.sendChat("leftover")).toBe(false);
    expect(result.sendContextUpdate("leftover")).toBe(false);
    expect(result.setBrowserContext({ source: "page", text: "leftover" })).toBe(
      false,
    );
    expect(result.setSelectionContext({ text: "leftover" })).toBe(false);
    expect(result.sendTextChat("leftover")).toBe(false);
    expect(result.sendReadAloud("leftover")).toBe(false);
    expect(
      result.sendBrowserAction({
        messageType: "browser.action.readAloud",
        text: "leftover",
      } satisfies BrowserActionPayload),
    ).toBe(false);
    expect(
      result.listen({ identifier: "leftover", targetLanguage: "en" }),
    ).toBe(false);
    expect(result.enableTextChat("text")).toBe(false);
    expect(result.disableTextChat()).toBe(false);
    expect(result.setResponseMode("voice")).toBe(false);
    expect(result.sendAsyncActionResult("act-leftover", true)).toBe(false);
    expect(result.sendActionProgress("act-leftover", "received")).toBe(false);
    expect(result.sendActionUpdateChat("act-leftover", "leftover")).toBe(false);
    expect(result.sendMessage({ type: "ping" })).toBe(false);
    await expect(result.audioDone()).rejects.toThrow("No active session");
    await expect(result.close()).resolves.toBeUndefined();
    expect(() => result.clearMessages()).not.toThrow();
  });
});

describe("useDelphiSession leftovers-more openSession", () => {
  it("opens leftover-more session when the endpoint has no live client", async () => {
    leftoverDelphi.getSession.mockReturnValue(null);
    leftoverDelphi.openSession.mockResolvedValue(createLeftoverSession());
    const onError = vi.fn();

    const result = leftoverHook({
      endpointName: "Leftover Endpoint",
      appName: "Leftover App",
      onError,
    });

    expect(leftoverDelphi.getSession).toHaveBeenCalledWith(
      "ep-leftover",
      "audio_playback",
    );
    expect(leftoverDelphi.openSession).toHaveBeenCalledWith({
      endpointId: "ep-leftover",
      mode: "audio_playback",
      endpointName: "Leftover Endpoint",
      appName: "Leftover App",
    });
    expect(result.session).toBeNull();
    await leftoverTick();
    expect(onError).not.toHaveBeenCalled();
  });

  it("skips leftover-more openSession when a live session already exists", () => {
    const session = createLeftoverSession();
    leftoverDelphi = createLeftoverDelphi(session);

    leftoverHook();

    expect(leftoverDelphi.openSession).not.toHaveBeenCalled();
    expect(session.updateOptions).toHaveBeenCalledTimes(1);
  });

  it("forwards leftover-more Error rejections from openSession to onError", async () => {
    leftoverDelphi.getSession.mockReturnValue(null);
    leftoverDelphi.openSession.mockRejectedValue(
      new Error("leftover-open-failed"),
    );
    const onError = vi.fn();

    leftoverHook({ onError });
    await leftoverTick();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0]![0]!.message).toBe("leftover-open-failed");
  });

  it("wraps leftover-more non-Error openSession rejections", async () => {
    leftoverDelphi.getSession.mockReturnValue(null);
    leftoverDelphi.openSession.mockRejectedValue("leftover-string");
    const onError = vi.fn();

    leftoverHook({ onError });
    await leftoverTick();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0]![0]!.message).toBe("leftover-string");
  });

  it("swallows leftover-more openSession rejection when onError is omitted", async () => {
    leftoverDelphi.getSession.mockReturnValue(null);
    leftoverDelphi.openSession.mockRejectedValue(
      new Error("leftover-unhandled"),
    );

    leftoverHook();
    await leftoverTick();

    expect(leftoverDelphi.openSession).toHaveBeenCalledTimes(1);
  });
});

describe("useDelphiSession leftovers-more updateOptions", () => {
  it("omits leftover-more autoPlayAudio when the option is undefined", () => {
    const session = createLeftoverSession();
    leftoverDelphi = createLeftoverDelphi(session);
    const onAction = vi.fn();
    const onMessage = vi.fn();
    const onChat = vi.fn();
    const onStatus = vi.fn();
    const onControl = vi.fn();
    const onAudio = vi.fn();
    const onAudioPlaybackStart = vi.fn();
    const onAudioPlaybackEnd = vi.fn();
    const onConnectionChange = vi.fn();
    const onError = vi.fn();

    leftoverHook({
      onAction,
      onMessage,
      onChat,
      onStatus,
      onControl,
      onAudio,
      onAudioPlaybackStart,
      onAudioPlaybackEnd,
      onConnectionChange,
      onError,
    });

    expect(session.updateOptions).toHaveBeenCalledWith({
      onAction,
      onMessage,
      onChat,
      onStatus,
      onControl,
      onAudio,
      onAudioPlaybackStart,
      onAudioPlaybackEnd,
      onConnectionChange,
      onError,
    });
    expect(session.updateOptions.mock.calls[0]![0]).not.toHaveProperty(
      "autoPlayAudio",
    );
  });

  it("includes leftover-more autoPlayAudio false when the caller sets it", () => {
    const session = createLeftoverSession();
    leftoverDelphi = createLeftoverDelphi(session);

    leftoverHook({ autoPlayAudio: false });

    expect(session.updateOptions).toHaveBeenCalledWith(
      expect.objectContaining({ autoPlayAudio: false }),
    );
  });

  it("does not call leftover-more updateOptions while the session is still opening", () => {
    leftoverDelphi.getSession.mockReturnValue(null);

    leftoverHook({ autoPlayAudio: true });

    expect(leftoverDelphi.openSession).toHaveBeenCalledTimes(1);
  });
});

describe("useDelphiSession leftovers-more live session", () => {
  it("surfaces leftover-more session state and binds the real session methods", async () => {
    const leftoverError = new Error("leftover-last");
    const leftoverMessage = leftoverChannelMessage();
    const session = createLeftoverSession({
      connectionState: "connected",
      connected: true,
      serverReady: true,
      sessionId: "session-leftover",
      endpointId: "ep-leftover",
      mode: "audio_playback",
      textChatEnabled: true,
      messages: [leftoverMessage],
      lastError: leftoverError,
      audioRequestPending: true,
      audioPlaying: true,
      lastActivityAt: 99,
    });
    leftoverDelphi = createLeftoverDelphi(session);

    const result = leftoverHook({ mode: "audio_playback" });

    expect(result.session).toBe(session);
    expect(result.connectionState).toBe("connected");
    expect(result.connected).toBe(true);
    expect(result.serverReady).toBe(true);
    expect(result.sessionId).toBe("session-leftover");
    expect(result.textChatEnabled).toBe(true);
    expect(result.messages).toEqual([leftoverMessage]);
    expect(result.lastError).toBe(leftoverError);
    expect(result.audioRequestPending).toBe(true);
    expect(result.audioPlaying).toBe(true);

    expect(
      result.sendChat("leftover", {
        intent: "conversation",
        responseExpected: true,
        preferredResponse: "text",
        metadata: { leftover: true },
      }),
    ).toBe(true);
    expect(session.sendChat).toHaveBeenCalledWith("leftover", {
      intent: "conversation",
      responseExpected: true,
      preferredResponse: "text",
      metadata: { leftover: true },
    });
    expect(result.sendContextUpdate("leftover-context", { leftover: 1 })).toBe(
      true,
    );
    expect(session.sendContextUpdate).toHaveBeenCalledWith("leftover-context", {
      leftover: 1,
    });
    expect(result.setBrowserContext({ source: "page", text: "leftover" })).toBe(
      true,
    );
    expect(result.setSelectionContext({ text: "leftover-selection" })).toBe(
      true,
    );
    expect(result.sendTextChat("leftover-text", { leftover: "chat" })).toBe(
      true,
    );
    expect(result.sendReadAloud("leftover-aloud", { leftover: "read" })).toBe(
      true,
    );
    const leftoverAction: BrowserActionPayload = {
      messageType: "browser.action.readAloud",
      text: "leftover-boa",
    };
    expect(result.sendBrowserAction(leftoverAction)).toBe(true);
    expect(session.sendBrowserAction).toHaveBeenCalledWith(leftoverAction);
    expect(
      result.listen({
        identifier: "leftover-listen",
        targetLanguage: "de",
        startMode: "live",
      }),
    ).toBe(true);
    expect(result.enableTextChat("both")).toBe(true);
    expect(result.disableTextChat()).toBe(true);
    expect(result.setResponseMode("voice")).toBe(true);
    expect(
      result.sendAsyncActionResult("act-leftover", false, {
        error: "leftover",
      }),
    ).toBe(true);
    expect(result.sendActionProgress("act-leftover", "executing")).toBe(true);
    expect(result.sendActionUpdateChat("act-leftover", "leftover-update")).toBe(
      true,
    );
    expect(result.sendMessage({ type: "pong" })).toBe(true);
    await expect(result.audioDone("response-leftover")).resolves.toEqual(
      leftoverAudioEvent(),
    );
    expect(session.audioDone).toHaveBeenCalledWith("response-leftover");
    await expect(result.close()).resolves.toBeUndefined();
    expect(session.close).toHaveBeenCalledTimes(1);
    result.clearMessages();
    expect(session.clearMessages).toHaveBeenCalledTimes(1);
    expect(leftoverDelphi.subscribe).toHaveBeenCalled();
    expect(session.subscribe).toHaveBeenCalled();
  });
});
