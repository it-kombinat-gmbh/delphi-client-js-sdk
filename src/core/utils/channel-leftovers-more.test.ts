import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createActionAckMessage,
  createActionMessage,
  createActionResultMessage,
  createActionUpdateChatMessage,
  createAsyncActionResultMessage,
  createAudioMessage,
  createBaseMessage,
  createBrowserActionMessage,
  createBrowserContextMessage,
  createBrowserSelectionContextMessage,
  createChatMessage,
  createContextUpdateMessage,
  createControlMessage,
  createDisableTextChatMessage,
  createEnableTextChatMessage,
  createErrorMessage,
  createMessageId,
  createPingMessage,
  createPongMessage,
  createReadAloudMessage,
  createReconnectMessage,
  createSetResponseModeMessage,
  createStatusMessage,
  createTextChatMessage,
} from "./channel";

const FIXED_NOW = 1_725_000_000_000;
const FIXED_UUID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
  vi.spyOn(crypto, "randomUUID").mockReturnValue(FIXED_UUID);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createMessageId leftovers-more", () => {
  it("returns the leftover crypto.randomUUID value", () => {
    expect(createMessageId()).toBe(FIXED_UUID);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });
});

describe("createBaseMessage leftovers-more", () => {
  it("fills leftover envelope fields for each direction", () => {
    expect(createBaseMessage("chat", "sess-1", "to_ari")).toEqual({
      type: "chat",
      sessionId: "sess-1",
      messageId: FIXED_UUID,
      timestamp: FIXED_NOW,
      direction: "to_ari",
    });
    expect(createBaseMessage("error", "sess-1", "to_browser")).toEqual({
      type: "error",
      sessionId: "sess-1",
      messageId: FIXED_UUID,
      timestamp: FIXED_NOW,
      direction: "to_browser",
    });
  });
});

describe("createActionMessage leftovers-more", () => {
  it("defaults leftover omitted requiresResponse to true", () => {
    const message = createActionMessage("sess-1", "navigate", { url: "/home" });

    expect(message.type).toBe("action");
    expect(message.direction).toBe("to_browser");
    expect(message.action).toEqual({
      actionId: FIXED_UUID,
      name: "navigate",
      parameters: { url: "/home" },
      requiresResponse: true,
      timeoutMs: undefined,
      priority: undefined,
      description: undefined,
    });
  });

  it("keeps leftover explicit false and optional action fields", () => {
    const message = createActionMessage(
      "sess-1",
      "fill_form",
      { selector: "#email" },
      {
        requiresResponse: false,
        timeoutMs: 1500,
        priority: "high",
        description: "Fill the leftover email field",
      },
    );

    expect(message.action).toEqual({
      actionId: FIXED_UUID,
      name: "fill_form",
      parameters: { selector: "#email" },
      requiresResponse: false,
      timeoutMs: 1500,
      priority: "high",
      description: "Fill the leftover email field",
    });
  });
});

describe("createActionResultMessage leftovers-more", () => {
  it("omits leftover optional result fields when options are empty", () => {
    expect(
      createActionResultMessage("sess-1", "act-1", true).actionResult,
    ).toEqual({
      actionId: "act-1",
      success: true,
      data: undefined,
      error: undefined,
      durationMs: undefined,
      isFinal: true,
    });
  });

  it("forwards leftover data, error, and duration on failure", () => {
    expect(
      createActionResultMessage("sess-1", "act-1", false, {
        data: { reason: "blocked" },
        error: "permission denied",
        durationMs: 42,
      }).actionResult,
    ).toEqual({
      actionId: "act-1",
      success: false,
      data: { reason: "blocked" },
      error: "permission denied",
      durationMs: 42,
      isFinal: true,
    });
  });
});

describe("createActionAckMessage leftovers-more", () => {
  it("defaults leftover omitted status to received", () => {
    expect(createActionAckMessage("sess-1", "act-1").actionResult).toEqual({
      actionId: "act-1",
      status: "received",
      success: true,
      isFinal: false,
    });
  });

  it("keeps leftover explicit executing status", () => {
    expect(
      createActionAckMessage("sess-1", "act-1", "executing").actionResult,
    ).toEqual({
      actionId: "act-1",
      status: "executing",
      success: true,
      isFinal: false,
    });
  });
});

describe("createAsyncActionResultMessage leftovers-more", () => {
  it("maps leftover success true to completed", () => {
    expect(
      createAsyncActionResultMessage("sess-1", "act-1", true).actionResult,
    ).toEqual({
      actionId: "act-1",
      status: "completed",
      success: true,
      data: undefined,
      error: undefined,
      durationMs: undefined,
      isFinal: true,
    });
  });

  it("maps leftover success false to failed and forwards options", () => {
    expect(
      createAsyncActionResultMessage("sess-1", "act-1", false, {
        data: { ok: false },
        error: "timeout",
        durationMs: 9,
      }).actionResult,
    ).toEqual({
      actionId: "act-1",
      status: "failed",
      success: false,
      data: { ok: false },
      error: "timeout",
      durationMs: 9,
      isFinal: true,
    });
  });
});

describe("createEnableTextChatMessage leftovers-more", () => {
  it("defaults leftover omitted responseMode to text", () => {
    expect(createEnableTextChatMessage("sess-1").control).toEqual({
      command: "enable_text_chat",
      settings: { responseMode: "text" },
      metadata: undefined,
    });
  });

  it("keeps leftover explicit voice and both modes", () => {
    expect(createEnableTextChatMessage("sess-1", "voice").control).toEqual({
      command: "enable_text_chat",
      settings: { responseMode: "voice" },
      metadata: undefined,
    });
    expect(createEnableTextChatMessage("sess-1", "both").control).toEqual({
      command: "enable_text_chat",
      settings: { responseMode: "both" },
      metadata: undefined,
    });
  });
});

describe("createControlMessage leftovers-more", () => {
  it("forwards leftover settings and metadata when provided", () => {
    expect(
      createControlMessage(
        "sess-1",
        "set_response_mode",
        { responseMode: "both", sessionTimeout: 30 },
        { reason: "leftover" },
      ).control,
    ).toEqual({
      command: "set_response_mode",
      settings: { responseMode: "both", sessionTimeout: 30 },
      metadata: { reason: "leftover" },
    });
  });

  it("omits leftover settings and metadata when they are unused", () => {
    expect(createDisableTextChatMessage("sess-1").control).toEqual({
      command: "disable_text_chat",
      settings: undefined,
      metadata: undefined,
    });
    expect(createSetResponseModeMessage("sess-1", "voice").control).toEqual({
      command: "set_response_mode",
      settings: { responseMode: "voice" },
      metadata: undefined,
    });
  });
});

describe("createBrowserContextMessage leftovers-more", () => {
  it("uses leftover identifier when text is omitted", () => {
    expect(
      createBrowserContextMessage("sess-1", { identifier: "sel-9" }).chat,
    ).toEqual({
      role: "user",
      content: "sel-9",
      intent: "browser_context",
      responseExpected: false,
      metadata: { browserContext: { identifier: "sel-9" } },
    });
  });

  it("falls through leftover missing text and identifier to empty content", () => {
    expect(
      createBrowserContextMessage("sess-1", { url: "/page" }).chat?.content,
    ).toBe("");
  });

  it("keeps leftover empty text instead of falling through to identifier", () => {
    expect(
      createBrowserContextMessage("sess-1", { text: "", identifier: "sel-9" })
        .chat?.content,
    ).toBe("");
  });

  it("prefers leftover text over identifier", () => {
    expect(
      createBrowserContextMessage("sess-1", {
        text: "highlighted",
        identifier: "sel-9",
      }).chat?.content,
    ).toBe("highlighted");
  });
});

describe("createBrowserSelectionContextMessage leftovers-more", () => {
  it("defaults leftover omitted source to selection", () => {
    const message = createBrowserSelectionContextMessage("sess-1", {
      text: "picked",
    });

    expect(message.chat?.content).toBe("picked");
    expect(message.chat?.metadata).toEqual({
      browserContext: { text: "picked", source: "selection" },
    });
  });

  it("keeps leftover explicit source", () => {
    const message = createBrowserSelectionContextMessage("sess-1", {
      text: "picked",
      source: "route_change",
    });

    expect(message.chat?.metadata).toEqual({
      browserContext: { text: "picked", source: "route_change" },
    });
  });
});

describe("createChat and context leftovers-more", () => {
  it("omits leftover optional metadata on chat, status, and context updates", () => {
    expect(createChatMessage("sess-1", "to_ari", "user", "hello").chat).toEqual(
      {
        role: "user",
        content: "hello",
        metadata: undefined,
      },
    );
    expect(
      createStatusMessage("sess-1", "to_browser", "connected").status,
    ).toEqual({
      state: "connected",
      metadata: undefined,
    });
    expect(createContextUpdateMessage("sess-1", "ready").chat).toEqual({
      role: "user",
      content: "ready",
      intent: "context_update",
      responseExpected: false,
      metadata: undefined,
    });
    expect(createTextChatMessage("sess-1", "hi").chat).toEqual({
      role: "user",
      content: "hi",
      intent: "conversation",
      responseExpected: true,
      metadata: undefined,
    });
    expect(createReadAloudMessage("sess-1", "read me").chat).toEqual({
      role: "user",
      content: "read me",
      intent: "read_aloud",
      responseExpected: true,
      preferredResponse: "voice",
      metadata: undefined,
    });
    expect(
      createActionUpdateChatMessage("sess-1", "act-1", "working").chat,
    ).toEqual({
      role: "user",
      content: "working",
      intent: "action_update",
      relatedActionId: "act-1",
      metadata: undefined,
    });
  });

  it("forwards leftover metadata when provided", () => {
    const metadata = { leftover: true };

    expect(
      createChatMessage("sess-1", "to_browser", "assistant", "ok", metadata)
        .chat?.metadata,
    ).toEqual(metadata);
    expect(
      createStatusMessage("sess-1", "to_ari", "call_ended", metadata).status
        ?.metadata,
    ).toEqual(metadata);
    expect(
      createContextUpdateMessage("sess-1", "ready", metadata).chat?.metadata,
    ).toEqual(metadata);
    expect(
      createTextChatMessage("sess-1", "hi", metadata).chat?.metadata,
    ).toEqual(metadata);
    expect(
      createReadAloudMessage("sess-1", "read me", metadata).chat?.metadata,
    ).toEqual(metadata);
    expect(
      createActionUpdateChatMessage("sess-1", "act-1", "working", metadata).chat
        ?.metadata,
    ).toEqual(metadata);
  });
});

describe("createErrorMessage and reconnect leftovers-more", () => {
  it("omits leftover error details and reconnect fields when unused", () => {
    expect(
      createErrorMessage("sess-1", "to_browser", "E_GONE", "missing").error,
    ).toEqual({
      code: "E_GONE",
      message: "missing",
      details: undefined,
    });
    expect(createReconnectMessage("sess-1").reconnect).toEqual({
      lastReceivedMessageId: undefined,
      sessionData: undefined,
    });
  });

  it("forwards leftover error details and reconnect fields", () => {
    expect(
      createErrorMessage("sess-1", "to_ari", "E_BAD", "bad", { field: "id" })
        .error,
    ).toEqual({
      code: "E_BAD",
      message: "bad",
      details: { field: "id" },
    });
    expect(
      createReconnectMessage("sess-1", "stream-7", { leftover: 1 }).reconnect,
    ).toEqual({
      lastReceivedMessageId: "stream-7",
      sessionData: { leftover: 1 },
    });
  });
});

describe("createBrowserActionMessage and audio leftovers-more", () => {
  it("attaches leftover browser action and audio payloads", () => {
    expect(
      createBrowserActionMessage("sess-1", {
        messageType: "readAloud",
        identifier: "cap-1",
      }).browserAction,
    ).toEqual({
      messageType: "readAloud",
      identifier: "cap-1",
    });
    expect(
      createAudioMessage("sess-1", {
        event: "delta",
        delta: "abc",
        mimeType: "audio/mpeg",
      }).audio,
    ).toEqual({
      event: "delta",
      delta: "abc",
      mimeType: "audio/mpeg",
    });
  });
});

describe("createPingMessage and createPongMessage leftovers-more", () => {
  it("uses leftover keepalive directions without extra payloads", () => {
    const ping = createPingMessage("sess-1");
    const pong = createPongMessage("sess-1");

    expect(ping).toEqual({
      type: "ping",
      sessionId: "sess-1",
      messageId: FIXED_UUID,
      timestamp: FIXED_NOW,
      direction: "to_ari",
    });
    expect(pong).toEqual({
      type: "pong",
      sessionId: "sess-1",
      messageId: FIXED_UUID,
      timestamp: FIXED_NOW,
      direction: "to_browser",
    });
    expect(ping.chat).toBeUndefined();
    expect(pong.control).toBeUndefined();
  });
});
