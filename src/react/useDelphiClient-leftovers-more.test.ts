import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DelphiClient } from "../core/DelphiClient";
import type { DelphiClientState } from "../core/DelphiClient";
import type { DelphiConfig } from "../core/types";
import { setLogger } from "../core/utils/sdkLogger";

const leftoverHooks = vi.hoisted(() => {
  const cleanups: Array<(() => void) | undefined> = [];
  const clientRef: { current: unknown } = { current: null };
  return {
    clientRef,
    notifyCount: 0,
    resetRef() {
      clientRef.current = null;
    },
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

let leftoverContextClient: DelphiClient;

vi.mock("./context", () => ({
  useDelphiClientContext: () => leftoverContextClient,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useRef: <T>(_initial: T) => {
      void _initial;
      return leftoverHooks.clientRef as { current: T };
    },
    useCallback: <T extends (...args: never[]) => unknown>(fn: T) => fn,
    useSyncExternalStore: <T>(
      subscribe: (onStoreChange: () => void) => () => void,
      getSnapshot: () => T,
    ) => {
      subscribe(() => {
        leftoverHooks.notifyCount += 1;
      });
      return getSnapshot();
    },
    useEffect: (effect: () => void | (() => void)) => {
      leftoverHooks.runEffect(effect);
    },
  };
});

import { useDelphiClient, useDelphiClientState } from "./useDelphiClient";

const leftoverLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function leftoverInitialState(): DelphiClientState {
  return {
    voiceCall: {
      sessionId: null,
      endpointId: "",
      endpointName: "",
      appName: "",
      registered: false,
      calling: false,
      inCall: false,
      initialized: false,
      reconnecting: false,
      autoDialPending: false,
      telproDomain: null,
      webrtcGatewayUrl: null,
      dtmfDigits: "",
      audioBlocked: false,
    },
    status: "Disconnected",
    sessions: [],
    selectedText: "",
  };
}

function leftoverConfig(overrides: DelphiConfig = {}): DelphiConfig {
  return {
    apiDomain: "api.leftover.test",
    apiKey: "key-leftover",
    ...overrides,
  };
}

beforeEach(() => {
  leftoverHooks.resetRef();
  leftoverHooks.notifyCount = 0;
  leftoverContextClient = new DelphiClient(
    leftoverConfig({ apiDomain: "ctx.leftover.test" }),
  );
  leftoverLogger.debug.mockReset();
  leftoverLogger.info.mockReset();
  leftoverLogger.warn.mockReset();
  leftoverLogger.error.mockReset();
  setLogger(leftoverLogger);
});

afterEach(() => {
  leftoverHooks.flushEffects();
  leftoverHooks.resetRef();
  leftoverHooks.notifyCount = 0;
  leftoverContextClient.destroy();
  setLogger(undefined);
  vi.restoreAllMocks();
});

describe("useDelphiClientState leftovers-more context client", () => {
  it("returns leftover-more context client and the disconnected snapshot", () => {
    const result = useDelphiClientState();

    expect(result.client).toBe(leftoverContextClient);
    expect(result.state).toEqual(leftoverInitialState());
    expect(result.state).toBe(leftoverContextClient.getState());
  });

  it("reads leftover-more getSnapshot after leftover selectedText is set", () => {
    leftoverContextClient.setSelectedText("leftover-selected");

    const result = useDelphiClientState();

    expect(result.state.selectedText).toBe("leftover-selected");
    expect(result.state).toEqual({
      ...leftoverInitialState(),
      selectedText: "leftover-selected",
    });
  });
});

describe("useDelphiClientState leftovers-more subscribe", () => {
  it("subscribes leftover-more to the context client and notifies on leftover state writes", () => {
    const subscribe = vi.spyOn(leftoverContextClient, "subscribe");
    const getState = vi.spyOn(leftoverContextClient, "getState");

    const result = useDelphiClientState();

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(getState).toHaveBeenCalled();
    expect(leftoverHooks.notifyCount).toBe(0);

    leftoverContextClient.setSelectedText("leftover-notify");

    expect(leftoverHooks.notifyCount).toBe(1);
    expect(result.state.selectedText).toBe("");
  });
});

describe("useDelphiClient leftovers-more construct", () => {
  it("constructs leftover-more a DelphiClient when the leftover ref is empty", () => {
    const config = leftoverConfig({
      sessionTokenUrl: "/leftover/session-token",
      preferPcma: false,
    });

    expect(leftoverHooks.clientRef.current).toBeNull();

    const result = useDelphiClient(config);

    expect(result.client).toBeInstanceOf(DelphiClient);
    expect(leftoverHooks.clientRef.current).toBe(result.client);
    expect(result.client.getConfig()).toEqual(config);
    expect(result.state).toEqual(leftoverInitialState());
    expect(result.state).toBe(result.client.getState());
  });

  it("keeps leftover-more an empty leftover config on the constructed client", () => {
    const result = useDelphiClient({});

    expect(result.client.getConfig()).toEqual({});
    expect(result.state.status).toBe("Disconnected");
    expect(result.state.sessions).toEqual([]);
    expect(result.state.selectedText).toBe("");
  });
});

describe("useDelphiClient leftovers-more reuse", () => {
  it("reuses leftover-more the same client when the leftover ref is already populated", () => {
    const firstConfig = leftoverConfig({ apiDomain: "first.leftover.test" });
    const first = useDelphiClient(firstConfig);

    const secondConfig = leftoverConfig({
      apiDomain: "second.leftover.test",
      apiKey: "key-leftover-2",
      logger: leftoverLogger,
    });
    const second = useDelphiClient(secondConfig);

    expect(second.client).toBe(first.client);
    expect(leftoverHooks.clientRef.current).toBe(first.client);
    expect(second.client.getConfig()).toEqual(secondConfig);
    expect(second.state).toBe(first.state);
  });
});

describe("useDelphiClient leftovers-more updateConfig", () => {
  it("forwards leftover-more config through updateConfig after construct", () => {
    const updateConfig = vi.spyOn(DelphiClient.prototype, "updateConfig");
    const config = leftoverConfig({
      runtimeCapabilitiesUrl: "/leftover/capabilities",
      sessionIdleTimeoutMs: 0,
    });

    const result = useDelphiClient(config);

    expect(updateConfig).toHaveBeenCalledTimes(1);
    expect(updateConfig).toHaveBeenCalledWith(config);
    expect(result.client.getConfig()).toEqual(config);
  });

  it("replaces leftover-more runtime config on a reused leftover client", () => {
    const first = useDelphiClient(
      leftoverConfig({ apiDomain: "old.leftover.test" }),
    );
    const updateConfig = vi.spyOn(first.client, "updateConfig");
    const nextConfig = leftoverConfig({
      apiDomain: "new.leftover.test",
      apiKey: "next-key",
      logger: leftoverLogger,
    });

    const reused = useDelphiClient(nextConfig);

    expect(reused.client).toBe(first.client);
    expect(updateConfig).toHaveBeenCalledTimes(1);
    expect(updateConfig).toHaveBeenCalledWith(nextConfig);
    expect(first.client.getConfig()).toEqual(nextConfig);
  });
});

describe("useDelphiClient leftovers-more subscribe", () => {
  it("subscribes leftover-more to the standalone client and notifies on leftover writes", () => {
    const subscribe = vi.spyOn(DelphiClient.prototype, "subscribe");
    const getState = vi.spyOn(DelphiClient.prototype, "getState");

    const result = useDelphiClient(leftoverConfig());

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(getState).toHaveBeenCalled();
    expect(leftoverHooks.notifyCount).toBe(0);

    result.client.setSelectedText("leftover-standalone");

    expect(leftoverHooks.notifyCount).toBe(1);
    expect(result.state.selectedText).toBe("");
    expect(result.client.getState().selectedText).toBe("leftover-standalone");
  });
});
