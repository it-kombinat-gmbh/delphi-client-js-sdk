import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DelphiClient } from "../core/DelphiClient";
import type { DelphiConfig } from "../core/types";
import { setLogger } from "../core/utils/sdkLogger";

const leftoverHooks = vi.hoisted(() => {
  const cleanups: Array<(() => void) | undefined> = [];
  const clientRef: { current: DelphiClient | null } = { current: null };
  let contextValue: DelphiClient | null = null;
  return {
    clientRef,
    getContextValue() {
      return contextValue;
    },
    setContextValue(value: DelphiClient | null) {
      contextValue = value;
    },
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

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useRef: <T>(_initial: T) => {
      void _initial;
      return leftoverHooks.clientRef as { current: T };
    },
    useMemo: <T>(factory: () => T) => factory(),
    useContext: () => leftoverHooks.getContextValue(),
    useEffect: (effect: () => void | (() => void)) => {
      leftoverHooks.runEffect(effect);
    },
  };
});

import { DelphiClientProvider, useDelphiClientContext } from "./context";

const leftoverLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function leftoverConfig(overrides: DelphiConfig = {}): DelphiConfig {
  return {
    apiDomain: "api.leftover.test",
    apiKey: "key-leftover",
    ...overrides,
  };
}

function leftoverProvider(
  config?: DelphiConfig,
  children: string = "leftover-child",
) {
  return DelphiClientProvider({ config, children });
}

beforeEach(() => {
  leftoverHooks.resetRef();
  leftoverHooks.setContextValue(null);
  leftoverLogger.debug.mockReset();
  leftoverLogger.info.mockReset();
  leftoverLogger.warn.mockReset();
  leftoverLogger.error.mockReset();
  setLogger(leftoverLogger);
});

afterEach(() => {
  leftoverHooks.flushEffects();
  leftoverHooks.resetRef();
  leftoverHooks.setContextValue(null);
  setLogger(undefined);
  vi.restoreAllMocks();
});

describe("DelphiClientProvider leftovers-more construct", () => {
  it("constructs leftover-more a DelphiClient from leftover config and provides it", () => {
    const config = leftoverConfig({
      sessionTokenUrl: "/leftover/session-token",
      preferPcma: false,
    });

    expect(leftoverHooks.clientRef.current).toBeNull();

    const element = leftoverProvider(config);

    expect(leftoverHooks.clientRef.current).toBeInstanceOf(DelphiClient);
    expect(leftoverHooks.clientRef.current?.getConfig()).toEqual(config);
    expect(element.props.value).toBe(leftoverHooks.clientRef.current);
    expect(element.props.children).toBe("leftover-child");
  });

  it("falls leftover-more back to an empty config when leftover config is omitted", () => {
    const updateConfig = vi.spyOn(DelphiClient.prototype, "updateConfig");

    leftoverProvider(undefined);

    expect(leftoverHooks.clientRef.current).toBeInstanceOf(DelphiClient);
    expect(leftoverHooks.clientRef.current?.getConfig()).toEqual({});
    expect(updateConfig).not.toHaveBeenCalled();
  });
});

describe("DelphiClientProvider leftovers-more updateConfig", () => {
  it("forwards leftover-more a provided leftover config through updateConfig", () => {
    const updateConfig = vi.spyOn(DelphiClient.prototype, "updateConfig");
    const config = leftoverConfig({
      runtimeCapabilitiesUrl: "/leftover/capabilities",
      sessionIdleTimeoutMs: 0,
      logger: leftoverLogger,
    });

    leftoverProvider(config);

    expect(updateConfig).toHaveBeenCalledTimes(1);
    expect(updateConfig).toHaveBeenCalledWith(config);
    expect(leftoverHooks.clientRef.current?.getConfig()).toEqual(config);
  });

  it("still leftover-more calls updateConfig for an empty leftover config object", () => {
    const updateConfig = vi.spyOn(DelphiClient.prototype, "updateConfig");

    leftoverProvider({});

    expect(updateConfig).toHaveBeenCalledTimes(1);
    expect(updateConfig).toHaveBeenCalledWith({});
    expect(leftoverHooks.clientRef.current?.getConfig()).toEqual({});
  });
});

describe("DelphiClientProvider leftovers-more reuse", () => {
  it("reuses leftover-more the same leftover client when the leftover ref is already populated", () => {
    const firstConfig = leftoverConfig({ apiDomain: "first.leftover.test" });
    leftoverProvider(firstConfig);
    const firstClient = leftoverHooks.clientRef.current;
    const updateConfig = vi.spyOn(firstClient!, "updateConfig");

    const secondConfig = leftoverConfig({
      apiDomain: "second.leftover.test",
      apiKey: "key-leftover-2",
      logger: leftoverLogger,
    });
    const second = leftoverProvider(secondConfig);

    expect(leftoverHooks.clientRef.current).toBe(firstClient);
    expect(second.props.value).toBe(firstClient);
    expect(updateConfig).toHaveBeenCalledTimes(1);
    expect(updateConfig).toHaveBeenCalledWith(secondConfig);
    expect(firstClient?.getConfig()).toEqual(secondConfig);
  });
});

describe("DelphiClientProvider leftovers-more destroy", () => {
  it("destroys leftover-more the leftover client and clears the leftover ref on leftover unmount", () => {
    const destroy = vi.spyOn(DelphiClient.prototype, "destroy");
    leftoverProvider(leftoverConfig());
    const client = leftoverHooks.clientRef.current;

    expect(destroy).not.toHaveBeenCalled();
    expect(client).toBeInstanceOf(DelphiClient);

    leftoverHooks.flushEffects();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(leftoverHooks.clientRef.current).toBeNull();
  });

  it("constructs leftover-more a new leftover client after leftover destroy clears the leftover ref", () => {
    leftoverProvider(leftoverConfig({ apiDomain: "old.leftover.test" }));
    const firstClient = leftoverHooks.clientRef.current;

    leftoverHooks.flushEffects();
    expect(leftoverHooks.clientRef.current).toBeNull();

    leftoverProvider(leftoverConfig({ apiDomain: "new.leftover.test" }));
    const secondClient = leftoverHooks.clientRef.current;

    expect(secondClient).toBeInstanceOf(DelphiClient);
    expect(secondClient).not.toBe(firstClient);
    expect(secondClient?.getConfig()).toEqual(
      leftoverConfig({ apiDomain: "new.leftover.test" }),
    );
  });
});

describe("useDelphiClientContext leftovers-more", () => {
  it("returns leftover-more the leftover client when leftover context is populated", () => {
    const client = new DelphiClient(
      leftoverConfig({ apiDomain: "ctx.leftover.test" }),
    );
    leftoverHooks.setContextValue(client);

    expect(useDelphiClientContext()).toBe(client);
    expect(useDelphiClientContext().getConfig()).toEqual(
      leftoverConfig({ apiDomain: "ctx.leftover.test" }),
    );

    client.destroy();
  });

  it("throws leftover-more when leftover context is missing", () => {
    leftoverHooks.setContextValue(null);

    expect(() => useDelphiClientContext()).toThrow(
      "[delphi-sdk] useDelphiClientContext must be used inside <DelphiClientProvider>",
    );
    expect(() => useDelphiClientContext()).toThrow(Error);
  });
});
