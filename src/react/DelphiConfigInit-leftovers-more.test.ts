import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DelphiClient } from "../core/DelphiClient";
import type { DelphiConfig } from "../core/types";
import { setLogger } from "../core/utils/sdkLogger";

const leftoverHooks = vi.hoisted(() => {
  const cleanups: Array<(() => void) | undefined> = [];
  let contextValue: DelphiClient | null = null;
  return {
    getContextValue() {
      return contextValue;
    },
    setContextValue(value: DelphiClient | null) {
      contextValue = value;
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
    useContext: () => leftoverHooks.getContextValue(),
    useEffect: (effect: () => void | (() => void)) => {
      leftoverHooks.runEffect(effect);
    },
  };
});

import { DelphiConfigInit } from "./DelphiConfigInit";

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

beforeEach(() => {
  leftoverHooks.setContextValue(null);
  leftoverLogger.debug.mockReset();
  leftoverLogger.info.mockReset();
  leftoverLogger.warn.mockReset();
  leftoverLogger.error.mockReset();
  setLogger(leftoverLogger);
});

afterEach(() => {
  leftoverHooks.flushEffects();
  leftoverHooks.setContextValue(null);
  setLogger(undefined);
  vi.restoreAllMocks();
});

describe("DelphiConfigInit leftovers-more sync", () => {
  it("forwards leftover-more leftover config through updateConfig and renders leftover-more null", () => {
    const client = new DelphiClient(
      leftoverConfig({ apiDomain: "init.leftover.test" }),
    );
    leftoverHooks.setContextValue(client);
    const updateConfig = vi.spyOn(client, "updateConfig");
    const config = leftoverConfig({
      sessionTokenUrl: "/leftover/session-token",
      preferPcma: false,
    });

    expect(DelphiConfigInit({ config })).toBeNull();
    expect(updateConfig).toHaveBeenCalledTimes(1);
    expect(updateConfig).toHaveBeenCalledWith(config);
    expect(client.getConfig()).toEqual(config);

    client.destroy();
  });

  it("still leftover-more calls updateConfig for an empty leftover config object", () => {
    const client = new DelphiClient(
      leftoverConfig({ apiDomain: "empty.leftover.test" }),
    );
    leftoverHooks.setContextValue(client);
    const updateConfig = vi.spyOn(client, "updateConfig");

    expect(DelphiConfigInit({ config: {} })).toBeNull();
    expect(updateConfig).toHaveBeenCalledTimes(1);
    expect(updateConfig).toHaveBeenCalledWith({});
    expect(client.getConfig()).toEqual({});

    client.destroy();
  });
});

describe("DelphiConfigInit leftovers-more leftover fields", () => {
  it("forwards leftover-more ice, idle, and leftover logger leftover config", () => {
    const client = new DelphiClient(leftoverConfig());
    leftoverHooks.setContextValue(client);
    const updateConfig = vi.spyOn(client, "updateConfig");
    const config = leftoverConfig({
      runtimeCapabilitiesUrl: "/leftover/capabilities",
      sessionIdleTimeoutMs: 0,
      iceServers: [
        { urls: "stun:leftover.test:3478" },
        {
          urls: ["turn:leftover.test:3478", "turns:leftover.test:5349"],
          username: "leftover-ice",
          credential: "leftover-ice-secret",
        },
      ],
      turnUsername: "leftover-turn",
      turnCredential: "leftover-turn-secret",
      logger: leftoverLogger,
    });

    expect(DelphiConfigInit({ config })).toBeNull();
    expect(updateConfig).toHaveBeenCalledTimes(1);
    expect(updateConfig).toHaveBeenCalledWith(config);
    expect(client.getConfig()).toEqual(config);

    client.destroy();
  });
});

describe("DelphiConfigInit leftovers-more replace", () => {
  it("replaces leftover-more leftover config on a second leftover render of the leftover client", () => {
    const client = new DelphiClient(
      leftoverConfig({ apiDomain: "old.leftover.test" }),
    );
    leftoverHooks.setContextValue(client);
    DelphiConfigInit({
      config: leftoverConfig({ apiDomain: "old.leftover.test" }),
    });

    const updateConfig = vi.spyOn(client, "updateConfig");
    const nextConfig = leftoverConfig({
      apiDomain: "new.leftover.test",
      apiKey: "next-key",
      logger: leftoverLogger,
    });

    expect(DelphiConfigInit({ config: nextConfig })).toBeNull();
    expect(updateConfig).toHaveBeenCalledTimes(1);
    expect(updateConfig).toHaveBeenCalledWith(nextConfig);
    expect(client.getConfig()).toEqual(nextConfig);

    leftoverHooks.flushEffects();
    expect(client.getConfig()).toEqual(nextConfig);

    client.destroy();
  });
});

describe("DelphiConfigInit leftovers-more missing context", () => {
  it("throws leftover-more when leftover context is missing", () => {
    leftoverHooks.setContextValue(null);
    const updateConfig = vi.spyOn(DelphiClient.prototype, "updateConfig");

    expect(() => DelphiConfigInit({ config: leftoverConfig() })).toThrow(
      "[delphi-sdk] useDelphiClientContext must be used inside <DelphiClientProvider>",
    );
    expect(() => DelphiConfigInit({ config: leftoverConfig() })).toThrow(Error);
    expect(updateConfig).not.toHaveBeenCalled();
  });
});
