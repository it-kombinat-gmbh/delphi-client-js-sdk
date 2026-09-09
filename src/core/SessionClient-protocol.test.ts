import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionClient } from "./SessionClient";
import {
  AudioPlayer,
  Socket,
  flush,
  installBrowser,
} from "../testing/browserHarness";
import { setLogger } from "./utils/sdkLogger";

let session: SessionClient;
let browser: ReturnType<typeof installBrowser>;
const socket = () => Socket.instances.at(-1)!;
beforeEach(() => {
  vi.useFakeTimers();
  browser = installBrowser();
  setLogger({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });
  session = new SessionClient({ pingInterval: 100, reconnectDelay: 50 });
});
afterEach(async () => {
  await session.close();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setLogger(undefined);
});
async function connect() {
  session.connect("s", "t", "wss://api.test");
  await flush();
  return socket();
}
function audio(event: string, extra: Record<string, unknown> = {}) {
  socket().receive({
    type: "audio",
    messageId: "audio",
    audio: { event, responseId: "r", ...extra },
  });
}

describe("session channel protocol", () => {
  it("resumes the last stream cursor after a transient loss and keeps the channel alive", async () => {
    browser.storage.set("channel_last_stream:s", "10-0");
    const ws = await connect();
    expect(ws.sent[0]).toMatchObject({ type: "reconnect" });
    ws.receive({
      type: "chat",
      streamId: "11-0",
      chat: { content: "response", role: "assistant" },
    });
    expect(browser.storage.get("channel_last_stream:s")).toBe("11-0");
    session.connect("s", "t");
    expect(Socket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(ws.sent.at(-1)?.type).toBe("ping");
    ws.close(1006);
    expect(session.getState().connectionState).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(50);
    await flush();
    expect(socket()).not.toBe(ws);
    expect(session.getState().serverReady).toBe(true);
    expect(socket().sent[0]).toMatchObject({
      type: "reconnect",
      reconnect: { lastReceivedMessageId: "11-0" },
    });
    session.clearMessages();
    expect(browser.storage.has("channel_last_stream:s")).toBe(false);
    session.connect("different", "new-token");
    await flush();
    expect(
      session.getState().messages.filter((m) => m.type === "chat"),
    ).toEqual([]);
  });
  it.each([1000, 4000, 4001, 4099])(
    "does not reconnect a deliberately closed/rejected channel (%i)",
    async (code) => {
      const ws = await connect();
      ws.close(code);
      await vi.advanceTimersByTimeAsync(1000);
      expect(Socket.instances).toHaveLength(1);
      expect(session.getState().connected).toBe(false);
    },
  );
  it("sends chat, context, response mode and async action progress with the session identity", async () => {
    const ws = await connect();
    expect(
      session.sendChat("hello", {
        intent: "conversation",
        responseExpected: true,
        preferredResponse: "both",
      }),
    ).toBe(true);
    expect(session.sendContextUpdate("page changed")).toBe(true);
    expect(session.setBrowserContext({ text: "page" })).toBe(true);
    expect(session.setSelectionContext({ text: "selection" })).toBe(true);
    expect(session.sendTextChat("hi")).toBe(true);
    expect(session.enableTextChat()).toBe(true);
    expect(session.getState().textChatEnabled).toBe(true);
    expect(session.disableTextChat()).toBe(true);
    expect(session.setResponseMode("voice")).toBe(true);
    expect(session.sendActionProgress("action", "executing")).toBe(true);
    expect(
      session.sendAsyncActionResult("action", true, { data: { done: true } }),
    ).toBe(true);
    expect(session.sendActionUpdateChat("action", "completed")).toBe(true);
    expect(session.sendMessage({ type: "ping" })).toBe(true);
    expect(ws.sent.every((m) => m.sessionId === "s")).toBe(true);
    expect(
      session.getState().messages.some((m) => m.chat?.content === "hello"),
    ).toBe(true);
  });
  it("routes inbound callbacks and reports transport/server errors without crashing", async () => {
    const onChat = vi.fn();
    const onStatus = vi.fn();
    const onControl = vi.fn();
    const onError = vi.fn();
    session.updateOptions({ onChat, onStatus, onControl, onError });
    const ws = await connect();
    ws.onmessage?.({ data: "invalid json" });
    ws.receive({ type: "pong" });
    ws.receive({ type: "ping" });
    ws.receive({ type: "chat", chat: { content: "hello" } });
    ws.receive({ type: "status", status: { state: "text_chat_enabled" } });
    expect(session.getState().textChatEnabled).toBe(true);
    ws.receive({ type: "status", status: { state: "text_chat_disabled" } });
    ws.receive({ type: "control", control: { action: "pause" } });
    ws.receive({ type: "error", error: { code: "DENIED", message: "denied" } });
    expect(onChat).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledTimes(3);
    expect(onControl).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "DENIED: denied" }),
    );
    ws.onerror?.();
    expect(session.getState().lastError?.message).toBe(
      "WebSocket connection error",
    );
    ws.send.mockImplementationOnce(() => {
      throw new Error("send failed");
    });
    expect(session.sendTextChat("fails")).toBe(false);
    expect(session.getState().lastError?.message).toBe("send failed");
  });
  it("acknowledges async actions, returns sync results and reports missing/throwing handlers", async () => {
    const ws = await connect();
    const message = {
      type: "action",
      action: { actionId: "a", name: "navigate", requiresResponse: true },
    };
    ws.receive(message);
    await flush();
    expect(JSON.stringify(ws.sent.at(-1))).toContain(
      "No browser action handler",
    );
    session.updateOptions({
      onAction: async () => ({ success: true, data: { location: "/home" } }),
    });
    ws.receive(message);
    await flush();
    expect(JSON.stringify(ws.sent.at(-1))).toContain("/home");
    session.updateOptions({ onAction: async () => ({ async: true }) });
    ws.receive(message);
    await flush();
    expect(ws.sent.at(-1)).toMatchObject({
      type: "action_result",
      actionResult: { status: "received" },
    });
    session.updateOptions({
      onAction: async () => {
        throw new Error("denied");
      },
    });
    ws.receive(message);
    await flush();
    expect(JSON.stringify(ws.sent.at(-1))).toContain("denied");
  });
});

describe("streamed audio lifecycle", () => {
  it("assembles segmented requests in order and resolves the final logical response", async () => {
    session.updateOptions({ autoPlayAudio: false });
    await connect();
    expect(session.sendReadAloud("hello")).toBe(true);
    expect(session.getState().audioRequestPending).toBe(true);
    const done = session.audioDone("request");
    for (const index of [0, 1]) {
      const meta = {
        responseId: `r${index}`,
        requestId: "request",
        segmentIndex: index,
        segmentCount: 2,
      };
      audio("start", meta);
      audio("delta", { ...meta, delta: "YQ==", mimeType: "audio/wav" });
      audio("done", meta);
    }
    await expect(done).resolves.toMatchObject({
      isFinal: true,
      segments: [{ responseId: "r0" }, { responseId: "r1" }],
    });
    expect(session.getState().audioRequestPending).toBe(false);
  });
  it("plays received audio and updates pending/playing state through completion", async () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();
    session.updateOptions({
      onAudioPlaybackStart: onStart,
      onAudioPlaybackEnd: onEnd,
    });
    await connect();
    session.sendReadAloud("speak");
    const done = session.audioDone();
    audio("delta", { delta: "YQ==" });
    audio("done");
    await done;
    await flush();
    const player = AudioPlayer.instances.at(-1)!;
    expect(player.src).toBe("data:audio/mpeg;base64,YQ==");
    expect(session.getState()).toMatchObject({
      audioPlaying: true,
      audioRequestPending: false,
    });
    player.dispatchEvent(new Event("playing"));
    expect(onStart).toHaveBeenCalledTimes(1);
    player.dispatchEvent(new Event("ended"));
    await flush();
    expect(onEnd).toHaveBeenCalledOnce();
    expect(session.getState().audioPlaying).toBe(false);
  });
  it("cancels active playback and rejects unfinished responses when closed", async () => {
    await connect();
    session.sendReadAloud("first");
    audio("done");
    await flush();
    const player = AudioPlayer.instances.at(-1)!;
    session.stopAudioPlayback();
    await flush();
    expect(player.pause).toHaveBeenCalledOnce();
    expect(player.src).toBe("");
    expect(session.getState().audioPlaying).toBe(false);
    const pending = expect(session.audioDone()).rejects.toThrow(
      "Session closed",
    );
    const onClose = vi.fn();
    session.onClose(onClose);
    await session.close();
    await pending;
    await session.close();
    expect(onClose).toHaveBeenCalledOnce();
    session.connect("new", "t");
    expect(Socket.instances).toHaveLength(1);
  });
  it("reports browser playback errors through onError", async () => {
    const onError = vi.fn();
    session.updateOptions({ onError });
    await connect();
    audio("done");
    await flush();
    AudioPlayer.instances.at(-1)!.dispatchEvent(new Event("error"));
    await flush();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Failed to load browser audio response",
      }),
    );
    expect(session.getState().audioPlaying).toBe(false);
  });
});
