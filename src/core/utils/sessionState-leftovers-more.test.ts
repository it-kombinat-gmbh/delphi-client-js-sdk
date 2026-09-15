import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PersistedSessionState } from "../types";
import { SESSION_STATE_STORAGE_KEY } from "./constants";
import { setLogger } from "./sdkLogger";
import {
  clearSessionState,
  loadSessionState,
  saveSessionState,
} from "./sessionState";

const FIXED_NOW = 1_725_000_000_000;
const MAX_SESSION_AGE_MS = 20_000;

const leftoverLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function leftoverState(
  overrides: Partial<PersistedSessionState> = {},
): PersistedSessionState {
  return {
    sessionId: "sess-leftover",
    endpointId: "ep-leftover",
    mode: "voice_conversation",
    startedAt: FIXED_NOW,
    ...overrides,
  };
}

function installLeftoverSessionStorage() {
  const store = new Map<string, string>();
  const sessionStorage = {
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
  };

  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    writable: true,
    value: sessionStorage,
  });

  return { store, sessionStorage };
}

let leftoverStorage: ReturnType<typeof installLeftoverSessionStorage>;

beforeEach(() => {
  leftoverStorage = installLeftoverSessionStorage();
  leftoverLogger.debug.mockReset();
  leftoverLogger.info.mockReset();
  leftoverLogger.warn.mockReset();
  leftoverLogger.error.mockReset();
  setLogger(leftoverLogger);
  vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
});

afterEach(() => {
  setLogger(undefined);
  vi.restoreAllMocks();
});

describe("saveSessionState leftovers-more", () => {
  it("persists leftover optional reconnect fields under the session storage key", () => {
    const state = leftoverState({
      endpointName: "Voice leftover",
      appName: "leftover-app",
      wsToken: "ws-leftover",
      telproDomain: "telpro.leftover.example",
      webrtcGatewayUrl: "wss://gw.leftover.example/ws",
    });

    saveSessionState(state);

    expect(leftoverStorage.sessionStorage.setItem).toHaveBeenCalledWith(
      SESSION_STATE_STORAGE_KEY,
      JSON.stringify(state),
    );
    expect(leftoverStorage.store.get(SESSION_STATE_STORAGE_KEY)).toBe(
      JSON.stringify(state),
    );
    expect(leftoverLogger.debug).toHaveBeenCalledWith(
      "[DelphiClient]",
      "Session state saved:",
      state,
    );
    expect(leftoverLogger.error).not.toHaveBeenCalled();
  });

  it("logs leftover quota failures without throwing", () => {
    const quota = new Error("quota exceeded");
    leftoverStorage.sessionStorage.setItem.mockImplementation(() => {
      throw quota;
    });

    expect(() => saveSessionState(leftoverState())).not.toThrow();
    expect(leftoverLogger.error).toHaveBeenCalledWith(
      "Failed to save session state:",
      quota,
    );
    expect(leftoverStorage.store.size).toBe(0);
  });
});

describe("loadSessionState leftovers-more", () => {
  it("returns leftover null when storage is empty or blank", () => {
    expect(loadSessionState()).toBeNull();

    leftoverStorage.store.set(SESSION_STATE_STORAGE_KEY, "");
    expect(loadSessionState()).toBeNull();

    expect(leftoverLogger.error).not.toHaveBeenCalled();
    expect(leftoverStorage.sessionStorage.removeItem).not.toHaveBeenCalled();
  });

  it("returns leftover fresh state including optional reconnect fields", () => {
    const state = leftoverState({
      endpointName: "Voice leftover",
      appName: "leftover-app",
      wsToken: "ws-leftover",
      telproDomain: "telpro.leftover.example",
      webrtcGatewayUrl: "wss://gw.leftover.example/ws",
    });
    leftoverStorage.store.set(SESSION_STATE_STORAGE_KEY, JSON.stringify(state));

    expect(loadSessionState()).toEqual(state);
    expect(leftoverLogger.debug).toHaveBeenCalledWith(
      "[DelphiClient]",
      "Session state loaded:",
      state,
    );
    expect(leftoverStorage.sessionStorage.removeItem).not.toHaveBeenCalled();
  });

  it("keeps leftover state that is exactly 20s old", () => {
    const state = leftoverState({ startedAt: FIXED_NOW - MAX_SESSION_AGE_MS });
    leftoverStorage.store.set(SESSION_STATE_STORAGE_KEY, JSON.stringify(state));

    expect(loadSessionState()).toEqual(state);
    expect(leftoverStorage.sessionStorage.removeItem).not.toHaveBeenCalled();
  });

  it("clears leftover stale state older than 20s", () => {
    const state = leftoverState({
      startedAt: FIXED_NOW - MAX_SESSION_AGE_MS - 1,
    });
    leftoverStorage.store.set(SESSION_STATE_STORAGE_KEY, JSON.stringify(state));

    expect(loadSessionState()).toBeNull();
    expect(leftoverStorage.sessionStorage.removeItem).toHaveBeenCalledWith(
      SESSION_STATE_STORAGE_KEY,
    );
    expect(leftoverStorage.store.has(SESSION_STATE_STORAGE_KEY)).toBe(false);
    expect(leftoverLogger.debug).toHaveBeenCalledWith(
      "[DelphiClient]",
      "Stored session state is stale (>20s), clearing",
    );
    expect(leftoverLogger.debug).toHaveBeenCalledWith(
      "[DelphiClient]",
      "Session state cleared",
    );
  });

  it("returns leftover null and logs when stored JSON is unusable", () => {
    leftoverStorage.store.set(SESSION_STATE_STORAGE_KEY, "{");

    expect(loadSessionState()).toBeNull();
    expect(leftoverLogger.error).toHaveBeenCalledWith(
      "Failed to load session state:",
      expect.any(SyntaxError),
    );
    expect(leftoverStorage.sessionStorage.removeItem).not.toHaveBeenCalled();
  });

  it("returns leftover null when getItem throws", () => {
    const storageError = new Error("storage blocked");
    leftoverStorage.sessionStorage.getItem.mockImplementation(() => {
      throw storageError;
    });

    expect(loadSessionState()).toBeNull();
    expect(leftoverLogger.error).toHaveBeenCalledWith(
      "Failed to load session state:",
      storageError,
    );
  });
});

describe("clearSessionState leftovers-more", () => {
  it("removes leftover stored state without throwing", () => {
    leftoverStorage.store.set(
      SESSION_STATE_STORAGE_KEY,
      JSON.stringify(leftoverState()),
    );

    clearSessionState();

    expect(leftoverStorage.sessionStorage.removeItem).toHaveBeenCalledWith(
      SESSION_STATE_STORAGE_KEY,
    );
    expect(leftoverStorage.store.has(SESSION_STATE_STORAGE_KEY)).toBe(false);
    expect(leftoverLogger.debug).toHaveBeenCalledWith(
      "[DelphiClient]",
      "Session state cleared",
    );
    expect(leftoverLogger.error).not.toHaveBeenCalled();
  });

  it("logs leftover removeItem failures without throwing", () => {
    const blocked = new Error("storage blocked");
    leftoverStorage.sessionStorage.removeItem.mockImplementation(() => {
      throw blocked;
    });

    expect(() => clearSessionState()).not.toThrow();
    expect(leftoverLogger.error).toHaveBeenCalledWith(
      "Failed to clear session state:",
      blocked,
    );
  });
});
