import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DelphiClient } from "../index";
import {
  AudioPlayer,
  Peer,
  Socket,
  flush,
  installBrowser,
} from "../testing/browserHarness";
import type { SessionTokenResponse } from "./types";

const token = {
  sessionId: "session-1",
  wsToken: "token",
  telproDomain: "sip.example.test",
  webrtcGatewayUrl: "wss://gateway.example.test",
} as SessionTokenResponse;
let client: DelphiClient;
let browser: ReturnType<typeof installBrowser>;
let request: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  browser = installBrowser();
  request = vi.fn(async () => new Response(JSON.stringify(token)));
  vi.stubGlobal("fetch", request);
  client = new DelphiClient({
    apiDomain: "api.example.test",
    apiKey: "test-key",
    sessionIdleTimeoutMs: 1000,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
});
afterEach(async () => {
  client.destroy();
  await flush();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const gateway = () => Socket.instances.filter((s) => s.protocol).at(-1)!;
const channel = () => Socket.instances.filter((s) => !s.protocol).at(-1)!;

describe("session ownership and handoff", () => {
  it("reuses endpoint/mode sessions and closes inactive sessions after activity stops", async () => {
    const session = await client.openSession({
      endpointId: "ep",
      mode: "text",
    });
    await flush();
    expect(session.getState()).toMatchObject({
      connected: true,
      serverReady: true,
    });
    expect(await client.openSession({ endpointId: "ep", mode: "text" })).toBe(
      session,
    );
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(700);
    session.sendTextChat("keep alive");
    await vi.advanceTimersByTimeAsync(700);
    expect(client.getSession("ep")).toBe(session);
    await vi.advanceTimersByTimeAsync(301);
    expect(client.getSession("ep")).toBeNull();
    expect(channel().close).toHaveBeenCalled();
  });
  it("retains conversation history while upgrading to voice and downgrading to text", async () => {
    const text = await client.openSession({ endpointId: "ep", mode: "text" });
    await flush();
    text.sendTextChat("remember this");
    const voice = await client.upgradeToVoice({
      endpointId: "ep",
      browserContext: { text: "page" },
    });
    expect(client.getSession("ep", "text")).toBeNull();
    expect(
      voice.getState().messages.find((m) => m.type === "chat")?.chat?.content,
    ).toBe("remember this");
    expect(client.getState().voiceCall.registered).toBe(true);
    const down = client.downgradeToText({ endpointId: "ep" });
    await vi.advanceTimersByTimeAsync(400);
    const resumed = await down;
    expect(
      resumed.getState().messages.find((m) => m.type === "chat")?.chat?.content,
    ).toBe("remember this");
    expect(client.getSession("ep", "voice_conversation")).toBeNull();
    await client.endSession("ep");
    expect(client.getState().sessions).toEqual([]);
  });
  it("reuses supplied tokens, validates voice metadata, and cleans all modes", async () => {
    const first = await client.openSessionWithToken({
      endpointId: "ep",
      mode: "text",
      token,
    });
    expect(
      await client.openSessionWithToken({
        endpointId: "ep",
        mode: "text",
        token,
      }),
    ).toBe(first);
    await expect(
      client.openSessionWithToken({
        endpointId: "bad",
        mode: "voice_conversation",
        token: { ...token, telproDomain: "" },
      }),
    ).rejects.toThrow("webrtcGatewayUrl");
    await client.openSessionWithToken({
      endpointId: "ep",
      mode: "audio_playback",
      token,
    });
    expect(client.getState().sessions).toHaveLength(2);
    await client.endAllSessions();
    expect(client.getState().sessions).toHaveLength(0);
    expect(request).not.toHaveBeenCalled();
  });
  it("waits for server readiness before read-aloud and resolves streamed audio", async () => {
    const spoken = client.readAloud("hello", {
      endpointId: "ep",
      identifier: "read",
      disableAutoPlay: true,
      metadata: { language: "en" },
    });
    await flush();
    expect(channel().sent.at(-1)).toMatchObject({
      type: "browser_action",
      browserAction: { text: "hello" },
    });
    channel().receive({
      type: "audio",
      messageId: "a",
      audio: { event: "delta", responseId: "a", delta: "aGk=" },
    });
    channel().receive({
      type: "audio",
      messageId: "a",
      audio: { event: "done", responseId: "a" },
    });
    await expect(spoken).resolves.toMatchObject({
      dataUrl: "data:audio/mpeg;base64,aGk=",
    });
  });
  it("rejects an aborted wait and sets interpretation listener context", async () => {
    Socket.autoOpen = false;
    const controller = new AbortController();
    controller.abort();
    await expect(
      client.readAloud("cancel", {
        endpointId: "abort",
        identifier: "read",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    Socket.autoOpen = true;
    const listener = await client.listen({
      endpointId: "ep",
      identifier: "meeting",
      targetLanguage: "de",
    });
    expect(listener.getState().mode).toBe("listen");
    expect(
      channel().sent.some((m) => m.browserAction?.data.targetLanguage === "de"),
    ).toBe(true);
  });
});

describe("voice gateway and media lifecycle", () => {
  it("registers, dials, exchanges ICE, plays remote media and tears down on remote hangup", async () => {
    const audio = new AudioPlayer();
    client.setRemoteAudioElement(audio as unknown as HTMLAudioElement);
    client.setLocalAudioElement(
      new AudioPlayer() as unknown as HTMLAudioElement,
    );
    await client.startCall({
      endpointId: "ep",
      autoDial: true,
      browserContext: { text: "page" },
    });
    await vi.advanceTimersByTimeAsync(0);
    await flush();
    const gw = gateway();
    const pc = Peer.instances.at(-1)!;
    expect(
      gw.sent.some(
        (m) =>
          m.body?.request === "call" &&
          m.body.headers["X-Call-ID"] === "session-1",
      ),
    ).toBe(true);
    expect(browser.getUserMedia).toHaveBeenCalledTimes(1);
    gw.sip("calling");
    expect(client.getState().status).toBe("Calling…");
    gw.sip("ringing");
    expect(client.getState().status).toBe("Ringing…");
    gw.receive({
      janus: "trickle",
      candidate: { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 },
    });
    gw.sip("accepted", {}, { type: "answer", sdp: "v=0\r\n" });
    await flush();
    expect(pc.setRemoteDescription).toHaveBeenCalled();
    expect(pc.addIceCandidate).toHaveBeenCalledTimes(1);
    expect(client.getState().voiceCall.inCall).toBe(true);
    pc.ontrack?.({ track: browser.track, streams: [browser.stream] });
    await flush();
    expect(audio.srcObject).toBe(browser.stream);
    expect(audio.play).toHaveBeenCalled();
    pc.onicecandidate?.({
      candidate: { candidate: "candidate:2", sdpMid: "0", sdpMLineIndex: 0 },
    });
    pc.onicecandidate?.({ candidate: null });
    expect(gw.sent.at(-1)?.candidate).toEqual({ completed: true });
    pc.iceConnectionState = "failed";
    pc.oniceconnectionstatechange?.();
    await flush();
    expect(pc.createOffer).toHaveBeenCalledWith({
      iceRestart: true,
      offerToReceiveAudio: true,
    });
    await client.sendDtmf("1");
    expect(gw.sent.at(-1)?.body).toEqual({ request: "dtmf_info", digit: "1" });
    await vi.advanceTimersByTimeAsync(25_000);
    expect(gw.sent.some((m) => m.janus === "keepalive")).toBe(true);
    expect(client.restorePersistedCall()?.startedAt).toBeGreaterThan(0);
    gw.receive({ janus: "hangup" });
    await flush();
    expect(client.getSession("ep")).toBeNull();
    expect(pc.close).toHaveBeenCalled();
    expect(browser.track.stop).toHaveBeenCalled();
    expect(client.getState().voiceCall.inCall).toBe(false);
  });
  it("handles autoplay blocking and a local hangup without leaving media active", async () => {
    const audio = new AudioPlayer();
    audio.play.mockRejectedValueOnce(
      new DOMException("blocked", "NotAllowedError"),
    );
    client.setRemoteAudioElement(audio as unknown as HTMLAudioElement);
    await client.startCall({ endpointId: "ep", autoDial: true });
    await vi.advanceTimersByTimeAsync(0);
    await flush();
    Peer.instances
      .at(-1)!
      .ontrack?.({ track: browser.track, streams: [browser.stream] });
    gateway().sip("accepted");
    await flush();
    expect(client.getState().voiceCall.audioBlocked).toBe(true);
    await client.enableAudio();
    expect(client.getState().voiceCall.audioBlocked).toBe(false);
    await expect(client.startCall({ endpointId: "another" })).rejects.toThrow(
      "already active",
    );
    await client.endCall();
    expect(gateway().sent.some((m) => m.body?.request === "hangup")).toBe(true);
    expect(client.getState().sessions).toEqual([]);
  });
  it("restores a persisted call and renegotiates media after SIP registration", async () => {
    await client.reconnectCall({
      ...token,
      endpointId: "ep",
      mode: "voice_conversation",
      startedAt: Date.now(),
    });
    await flush();
    await vi.advanceTimersByTimeAsync(0);
    await flush();
    expect(client.getState().voiceCall.calling).toBe(true);
    expect(gateway().sent.some((m) => m.body?.request === "call")).toBe(true);
    const pc = Peer.instances.at(-1)!;
    pc.ontrack?.({ track: browser.track, streams: [browser.stream] });
    client.setRemoteAudioElement(
      new AudioPlayer() as unknown as HTMLAudioElement,
    );
    pc.onicecandidate?.({ candidate: null });
    pc.iceConnectionState = "disconnected";
    pc.oniceconnectionstatechange?.();
    await flush();
    expect(pc.createOffer).toHaveBeenCalledWith(
      expect.objectContaining({ iceRestart: true }),
    );
    await client.endAllSessions();
    expect(client.getState().voiceCall.sessionId).toBeNull();
  });
  it("recovers after gateway loss and reports registration failure", async () => {
    await client.startCall({ endpointId: "ep" });
    const gw = gateway();
    gw.sip("registration_failed", { reason: "denied" });
    expect(client.getState().status).toContain("denied");
    gw.receive({ janus: "error", error: { reason: "No such session" } });
    expect(client.getState().voiceCall.initialized).toBe(false);
    await client.startCall({ endpointId: "ep" });
    expect(gateway()).not.toBe(gw);
    gateway().close();
    expect(client.getState().voiceCall.registered).toBe(false);
  });
});
