import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { leftoverPlayDtmfTone } = vi.hoisted(() => ({
  leftoverPlayDtmfTone: vi.fn(),
}));

vi.mock("./utils/playDtmfTone", () => ({
  playDtmfTone: leftoverPlayDtmfTone,
}));

import {
  CapabilityNotSupportedError,
  DelphiClient,
  ReadAloudCapabilityNotFoundError,
} from "./DelphiClient";
import type { RuntimeCapabilities, RuntimeInteractionMode } from "./types";
import { SESSION_STATE_STORAGE_KEY } from "./utils/constants";
import { setLogger } from "./utils/sdkLogger";

const FIXED_NOW = 1_725_000_000_000;

const leftoverLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function leftoverCapabilities(
  modes: Partial<Record<RuntimeInteractionMode, boolean>> = {},
  overrides: Partial<RuntimeCapabilities> = {},
): RuntimeCapabilities {
  return {
    endpointId: "ep-leftover",
    flowDefinitionId: null,
    runtime: {
      sessionContinuity: "supported",
      migration: [],
    },
    interactionModes: {
      text: false,
      audio_playback: false,
      voice_conversation: false,
      browser_actions: false,
      listen: false,
      ...modes,
    },
    transports: {
      preferred: ["websocket"],
      available: ["websocket"],
    },
    flows: {
      entryPoints: [],
      responseModes: [],
      sideFlows: [],
      browserActions: [],
    },
    ...overrides,
  };
}

function leftoverJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function leftoverFailedJsonResponse(body: unknown, status = 400): Response {
  return leftoverJsonResponse(body, status);
}

function leftoverUnparseableResponse(status = 502): Response {
  return {
    ok: false,
    status,
    json: vi.fn().mockRejectedValue(new Error("not-json")),
  } as unknown as Response;
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
let leftoverFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  leftoverStorage = installLeftoverSessionStorage();
  leftoverPlayDtmfTone.mockReset();
  leftoverLogger.debug.mockReset();
  leftoverLogger.info.mockReset();
  leftoverLogger.warn.mockReset();
  leftoverLogger.error.mockReset();
  leftoverFetch = vi.fn();
  vi.stubGlobal("fetch", leftoverFetch);
  setLogger(leftoverLogger);
  vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
});

afterEach(() => {
  setLogger(undefined);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CapabilityNotSupportedError leftovers-more", () => {
  it("lists leftover-more supported interaction modes in the error message", () => {
    const capabilities = leftoverCapabilities({
      text: true,
      audio_playback: false,
      listen: true,
    });
    const error = new CapabilityNotSupportedError(
      "voice_conversation",
      capabilities,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("CapabilityNotSupportedError");
    expect(error.capability).toBe("voice_conversation");
    expect(error.capabilities).toBe(capabilities);
    expect(error.message).toBe(
      "Endpoint ep-leftover does not support 'voice_conversation'. Supported interaction modes: text, listen.",
    );
  });

  it("renders leftover-more none when every interaction mode is unsupported", () => {
    const capabilities = leftoverCapabilities();
    const error = new CapabilityNotSupportedError("text", capabilities);

    expect(error.message).toBe(
      "Endpoint ep-leftover does not support 'text'. Supported interaction modes: none.",
    );
  });
});

describe("ReadAloudCapabilityNotFoundError leftovers-more", () => {
  it("names leftover-more the endpoint that has no readAloud capability", () => {
    const error = new ReadAloudCapabilityNotFoundError("ep-read-aloud");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ReadAloudCapabilityNotFoundError");
    expect(error.message).toBe(
      "Endpoint ep-read-aloud has no readAloud browser-action capability configured.",
    );
  });
});

describe("DelphiClient leftover-more capability helpers", () => {
  it("treats leftover-more hasCapability as true only for exact true flags", () => {
    const client = new DelphiClient();
    const capabilities = leftoverCapabilities({
      text: true,
      audio_playback: false,
    });

    expect(client.hasCapability(capabilities, "text")).toBe(true);
    expect(client.hasCapability(capabilities, "audio_playback")).toBe(false);
    expect(client.hasCapability(capabilities, "voice_conversation")).toBe(
      false,
    );
    expect(
      client.hasCapability(
        {
          ...capabilities,
          interactionModes: {
            text: true,
          } as RuntimeCapabilities["interactionModes"],
        },
        "listen",
      ),
    ).toBe(false);
  });

  it("throws leftover-more CapabilityNotSupportedError from assertCapability", () => {
    const client = new DelphiClient();
    const capabilities = leftoverCapabilities({ browser_actions: true });

    expect(() =>
      client.assertCapability(capabilities, "browser_actions"),
    ).not.toThrow();
    expect(() => client.assertCapability(capabilities, "listen")).toThrow(
      CapabilityNotSupportedError,
    );
    try {
      client.assertCapability(capabilities, "listen");
    } catch (error) {
      expect(error).toMatchObject({
        name: "CapabilityNotSupportedError",
        capability: "listen",
        capabilities,
      });
    }
  });
});

describe("DelphiClient leftover-more local state", () => {
  it("starts leftover-more with the disconnected voice-call snapshot", () => {
    const client = new DelphiClient({
      apiDomain: "api.leftover.test",
      apiKey: "key-leftover",
    });

    expect(client.getConfig()).toEqual({
      apiDomain: "api.leftover.test",
      apiKey: "key-leftover",
    });
    expect(client.getState()).toEqual({
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
    });
  });

  it("notifies leftover-more subscribers from setSelectedText and stops after unsubscribe", () => {
    const client = new DelphiClient();
    const listener = vi.fn();
    const unsubscribe = client.subscribe(listener);

    client.setSelectedText("leftover selection");
    expect(client.getState().selectedText).toBe("leftover selection");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    client.setSelectedText("after unsubscribe");
    expect(client.getState().selectedText).toBe("after unsubscribe");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("replaces leftover-more runtime config through updateConfig", () => {
    const client = new DelphiClient({ apiDomain: "old.leftover.test" });
    client.updateConfig({
      apiDomain: "new.leftover.test",
      apiKey: "next-key",
      logger: leftoverLogger,
    });

    expect(client.getConfig()).toEqual({
      apiDomain: "new.leftover.test",
      apiKey: "next-key",
      logger: leftoverLogger,
    });
  });

  it("appends leftover-more DTMF digits without a gateway send when not in a call", async () => {
    const client = new DelphiClient();

    await client.sendDtmf("5");
    await client.sendDtmf("#");

    expect(leftoverPlayDtmfTone).toHaveBeenNthCalledWith(1, "5");
    expect(leftoverPlayDtmfTone).toHaveBeenNthCalledWith(2, "#");
    expect(client.getState().voiceCall.dtmfDigits).toBe("5#");

    client.clearDtmfDigits();
    expect(client.getState().voiceCall.dtmfDigits).toBe("");
  });

  it("returns leftover-more immediately from enableAudio when no remote audio element is wired", async () => {
    const client = new DelphiClient();
    await expect(client.enableAudio()).resolves.toBeUndefined();
    expect(leftoverLogger.error).not.toHaveBeenCalled();
    expect(client.getState().voiceCall.audioBlocked).toBe(false);
  });

  it("clears leftover-more audioBlocked after enableAudio play succeeds", async () => {
    const client = new DelphiClient();
    const audio = {
      play: vi.fn().mockResolvedValue(undefined),
    } as unknown as HTMLAudioElement;

    client.setRemoteAudioElement(audio);
    client.setLocalAudioElement({} as HTMLAudioElement);
    await client.enableAudio();

    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(client.getState().voiceCall.audioBlocked).toBe(false);
  });

  it("logs leftover-more enableAudio failures without flipping audioBlocked", async () => {
    const client = new DelphiClient({ logger: leftoverLogger });
    const blocked = new Error("leftover autoplay");
    const audio = {
      play: vi.fn().mockRejectedValue(blocked),
    } as unknown as HTMLAudioElement;

    client.setRemoteAudioElement(audio);
    await client.enableAudio();

    expect(leftoverLogger.error).toHaveBeenCalledWith(
      "Failed to enable audio:",
      blocked,
    );
    expect(client.getState().voiceCall.audioBlocked).toBe(false);
  });
});

describe("DelphiClient leftover-more session lookups", () => {
  it("returns leftover-more null and no-ops when no sessions are open", async () => {
    const client = new DelphiClient();

    expect(client.getSession("ep-leftover")).toBeNull();
    expect(client.getSession("ep-leftover", "text")).toBeNull();
    await expect(client.endSession("ep-leftover")).resolves.toBeUndefined();
    await expect(
      client.endSession("ep-leftover", "audio_playback"),
    ).resolves.toBeUndefined();
    await expect(client.endAllSessions()).resolves.toBeUndefined();
    await expect(client.endCall()).resolves.toBeUndefined();
  });
});

describe("DelphiClient leftover-more getSessionToken", () => {
  it("rejects leftover-more missing apiDomain and apiKey unless sessionTokenUrl is set", async () => {
    await expect(
      new DelphiClient().getSessionToken("ep-leftover", "text"),
    ).rejects.toThrow("apiDomain not configured");
    await expect(
      new DelphiClient({ apiDomain: "api.leftover.test" }).getSessionToken(
        "ep-leftover",
        "text",
      ),
    ).rejects.toThrow("apiKey not configured");

    leftoverFetch.mockResolvedValue(
      leftoverJsonResponse({
        sessionId: "sess-leftover",
        wsToken: "ws-leftover",
        wsTokenExpiresIn: 60,
        expiresIn: 120,
      }),
    );

    const token = await new DelphiClient({
      sessionTokenUrl: "https://proxy.leftover.test/token",
    }).getSessionToken("ep leftover/1", "audio_playback");

    expect(leftoverFetch).toHaveBeenCalledWith(
      "https://proxy.leftover.test/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpointId: "ep leftover/1",
          mode: "audio_playback",
        }),
      },
    );
    expect(token.sessionId).toBe("sess-leftover");
  });

  it("posts leftover-more to the default token URL and forwards X-API-Key", async () => {
    leftoverFetch.mockResolvedValue(
      leftoverJsonResponse({
        sessionId: "sess-default",
        wsToken: "ws-default",
        wsTokenExpiresIn: 30,
        expiresIn: 90,
      }),
    );

    const token = await new DelphiClient({
      apiDomain: "api.leftover.test",
      apiKey: "key-leftover",
      logger: leftoverLogger,
    }).getSessionToken("ep-leftover", "listen");

    expect(leftoverFetch).toHaveBeenCalledWith(
      "https://api.leftover.test/api/v1/sessions/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "key-leftover",
        },
        body: JSON.stringify({ endpointId: "ep-leftover", mode: "listen" }),
      },
    );
    expect(token.wsToken).toBe("ws-default");
  });

  it("surfaces leftover-more token error strings and falls back for empty or unparseable bodies", async () => {
    leftoverFetch.mockResolvedValueOnce(
      leftoverFailedJsonResponse({ error: "quota leftover" }, 429),
    );
    await expect(
      new DelphiClient({
        apiDomain: "api.leftover.test",
        apiKey: "key-leftover",
      }).getSessionToken("ep-leftover", "text"),
    ).rejects.toThrow("quota leftover");

    leftoverFetch.mockResolvedValueOnce(leftoverFailedJsonResponse({}, 503));
    await expect(
      new DelphiClient({
        apiDomain: "api.leftover.test",
        apiKey: "key-leftover",
      }).getSessionToken("ep-leftover", "text"),
    ).rejects.toThrow("Failed to get session token: 503");

    leftoverFetch.mockResolvedValueOnce(leftoverUnparseableResponse(502));
    await expect(
      new DelphiClient({
        apiDomain: "api.leftover.test",
        apiKey: "key-leftover",
      }).getSessionToken("ep-leftover", "text"),
    ).rejects.toThrow("Unknown error");
  });
});

describe("DelphiClient leftover-more session upgrade and downgrade", () => {
  it("strips leftover-more trailing /token from sessionTokenUrl before /upgrade", async () => {
    leftoverFetch.mockResolvedValue(
      leftoverJsonResponse({
        sessionId: "sess-up",
        wsToken: "ws-up",
        wsTokenExpiresIn: 10,
        expiresIn: 20,
      }),
    );

    await new DelphiClient({
      sessionTokenUrl: "https://proxy.leftover.test/api/token/",
      apiKey: "key-leftover",
    }).requestSessionUpgrade("sess-leftover", "ep-leftover");

    expect(leftoverFetch).toHaveBeenCalledWith(
      "https://proxy.leftover.test/api/upgrade",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "key-leftover",
        },
        body: JSON.stringify({
          sessionId: "sess-leftover",
          endpointId: "ep-leftover",
        }),
      },
    );
  });

  it("builds leftover-more default upgrade and downgrade URLs from apiDomain", async () => {
    leftoverFetch.mockResolvedValue(
      leftoverJsonResponse({
        sessionId: "sess-move",
        wsToken: "ws-move",
        wsTokenExpiresIn: 10,
        expiresIn: 20,
      }),
    );
    const client = new DelphiClient({
      apiDomain: "api.leftover.test",
      apiKey: "key-leftover",
    });

    await client.requestSessionUpgrade("sess-leftover", "ep-leftover");
    await client.requestSessionDowngrade("sess-leftover", "ep-leftover");

    expect(leftoverFetch).toHaveBeenNthCalledWith(
      1,
      "https://api.leftover.test/api/v1/sessions/upgrade",
      expect.objectContaining({ method: "POST" }),
    );
    expect(leftoverFetch).toHaveBeenNthCalledWith(
      2,
      "https://api.leftover.test/api/v1/sessions/downgrade",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("parses leftover-more nested upgrade and downgrade error messages", async () => {
    leftoverFetch.mockResolvedValueOnce(
      leftoverFailedJsonResponse(
        { error: { message: "upgrade leftover" } },
        409,
      ),
    );
    await expect(
      new DelphiClient({
        apiDomain: "api.leftover.test",
        apiKey: "key-leftover",
      }).requestSessionUpgrade("sess-leftover", "ep-leftover"),
    ).rejects.toThrow("upgrade leftover");

    leftoverFetch.mockResolvedValueOnce(
      leftoverFailedJsonResponse({ error: "downgrade leftover" }, 409),
    );
    await expect(
      new DelphiClient({
        sessionTokenUrl: "https://proxy.leftover.test/sessions",
        apiKey: "key-leftover",
      }).requestSessionDowngrade("sess-leftover", "ep-leftover"),
    ).rejects.toThrow("downgrade leftover");

    leftoverFetch.mockResolvedValueOnce(leftoverFailedJsonResponse({}, 500));
    await expect(
      new DelphiClient({
        apiDomain: "api.leftover.test",
        apiKey: "key-leftover",
      }).requestSessionDowngrade("sess-leftover", "ep-leftover"),
    ).rejects.toThrow("Failed to downgrade session: 500");
  });

  it("rejects leftover-more upgrade and downgrade when domain or key are missing", async () => {
    await expect(
      new DelphiClient().requestSessionUpgrade("s", "e"),
    ).rejects.toThrow("apiDomain not configured");
    await expect(
      new DelphiClient({
        apiDomain: "api.leftover.test",
      }).requestSessionDowngrade("s", "e"),
    ).rejects.toThrow("apiKey not configured");
  });
});

describe("DelphiClient leftover-more getCapabilities", () => {
  it("rejects leftover-more missing apiDomain and apiKey unless runtimeCapabilitiesUrl is set", async () => {
    await expect(
      new DelphiClient().getCapabilities("ep-leftover"),
    ).rejects.toThrow("apiDomain not configured");
    await expect(
      new DelphiClient({ apiDomain: "api.leftover.test" }).getCapabilities(
        "ep-leftover",
      ),
    ).rejects.toThrow("apiKey not configured");
  });

  it("encodes leftover-more endpointId and chooses ? versus & from the capabilities URL", async () => {
    leftoverFetch.mockResolvedValue(
      leftoverJsonResponse(leftoverCapabilities({ text: true })),
    );
    const client = new DelphiClient({
      apiDomain: "api.leftover.test",
      apiKey: "key-leftover",
    });

    await client.getCapabilities("ep leftover/1");
    expect(leftoverFetch).toHaveBeenCalledWith(
      "https://api.leftover.test/api/v1/runtime/capabilities?endpointId=ep%20leftover%2F1",
      { method: "GET", headers: { "X-API-Key": "key-leftover" } },
    );

    leftoverFetch.mockResolvedValue(
      leftoverJsonResponse(leftoverCapabilities({ listen: true })),
    );
    await new DelphiClient({
      runtimeCapabilitiesUrl: "https://proxy.leftover.test/caps?team=9",
    }).getCapabilities("ep-leftover");
    expect(leftoverFetch).toHaveBeenLastCalledWith(
      "https://proxy.leftover.test/caps?team=9&endpointId=ep-leftover",
      { method: "GET", headers: {} },
    );
  });

  it("surfaces leftover-more capability fetch errors and assertEndpointCapability support", async () => {
    leftoverFetch.mockResolvedValueOnce(
      leftoverFailedJsonResponse({ error: { message: "caps leftover" } }, 404),
    );
    await expect(
      new DelphiClient({
        apiDomain: "api.leftover.test",
        apiKey: "key-leftover",
      }).getCapabilities("ep-leftover"),
    ).rejects.toThrow("caps leftover");

    leftoverFetch.mockResolvedValueOnce(leftoverFailedJsonResponse({}, 500));
    await expect(
      new DelphiClient({
        apiDomain: "api.leftover.test",
        apiKey: "key-leftover",
      }).getCapabilities("ep-leftover"),
    ).rejects.toThrow("Failed to get capabilities: 500");

    leftoverFetch.mockResolvedValueOnce(
      leftoverJsonResponse(leftoverCapabilities({ text: true })),
    );
    const client = new DelphiClient({
      apiDomain: "api.leftover.test",
      apiKey: "key-leftover",
    });
    await expect(
      client.assertEndpointCapability("ep-leftover", "text"),
    ).resolves.toEqual(leftoverCapabilities({ text: true }));

    leftoverFetch.mockResolvedValueOnce(
      leftoverJsonResponse(leftoverCapabilities({ text: true })),
    );
    await expect(
      client.assertEndpointCapability("ep-leftover", "listen"),
    ).rejects.toBeInstanceOf(CapabilityNotSupportedError);
  });
});

describe("DelphiClient leftover-more reconnect helpers", () => {
  it("returns leftover-more null from restorePersistedCall when storage is empty", () => {
    const client = new DelphiClient();
    expect(client.restorePersistedCall()).toBeNull();
  });

  it("returns leftover-more persisted voice state when it is still fresh", () => {
    leftoverStorage.store.set(
      SESSION_STATE_STORAGE_KEY,
      JSON.stringify({
        sessionId: "sess-leftover",
        endpointId: "ep-leftover",
        mode: "voice_conversation",
        startedAt: FIXED_NOW,
        wsToken: "ws-leftover",
      }),
    );

    expect(new DelphiClient().restorePersistedCall()).toEqual({
      sessionId: "sess-leftover",
      endpointId: "ep-leftover",
      mode: "voice_conversation",
      startedAt: FIXED_NOW,
      wsToken: "ws-leftover",
    });
  });

  it("rejects leftover-more reconnectCall for non-voice and missing persisted fields", async () => {
    const client = new DelphiClient();

    await expect(
      client.reconnectCall({
        sessionId: "sess-leftover",
        endpointId: "ep-leftover",
        mode: "text",
        startedAt: FIXED_NOW,
      }),
    ).rejects.toThrow(
      "reconnectCall only supports voice_conversation sessions",
    );

    await expect(
      client.reconnectCall({
        sessionId: "sess-leftover",
        endpointId: "ep-leftover",
        mode: "voice_conversation",
        startedAt: FIXED_NOW,
      }),
    ).rejects.toThrow("telproDomain not available in persisted state");
    expect(client.getState().voiceCall.reconnecting).toBe(true);
    expect(client.getState().status).toBe("Reconnecting…");

    await expect(
      client.reconnectCall({
        sessionId: "sess-leftover",
        endpointId: "ep-leftover",
        mode: "voice_conversation",
        startedAt: FIXED_NOW,
        telproDomain: "telpro.leftover.test",
      }),
    ).rejects.toThrow("webrtcGatewayUrl not available in persisted state");

    await expect(
      client.reconnectCall({
        sessionId: "sess-leftover",
        endpointId: "ep-leftover",
        mode: "voice_conversation",
        startedAt: FIXED_NOW,
        telproDomain: "telpro.leftover.test",
        webrtcGatewayUrl: "wss://gw.leftover.test",
      }),
    ).rejects.toThrow("wsToken not available in persisted state");
  });

  it("clears leftover-more reconnecting state through cancelReconnect", () => {
    leftoverStorage.store.set(SESSION_STATE_STORAGE_KEY, '{"leftover":true}');
    const client = new DelphiClient();

    client.cancelReconnect();

    expect(leftoverStorage.store.has(SESSION_STATE_STORAGE_KEY)).toBe(false);
    expect(client.getState().status).toBe("Disconnected");
    expect(client.getState().voiceCall.reconnecting).toBe(false);
  });
});

describe("DelphiClient leftover-more destroy", () => {
  it("clears leftover-more subscribers after destroy teardown notifications", () => {
    const client = new DelphiClient();
    const listener = vi.fn();
    client.subscribe(listener);

    client.destroy();
    const teardownCalls = listener.mock.calls.length;
    expect(teardownCalls).toBeGreaterThan(0);

    client.setSelectedText("after destroy");
    expect(listener).toHaveBeenCalledTimes(teardownCalls);
    expect(client.getState().selectedText).toBe("after destroy");
  });
});
