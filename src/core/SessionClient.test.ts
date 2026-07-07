import { afterEach, describe, expect, it, vi } from "vitest";

import type { AudioPayload, ChannelMessage } from "./channelTypes";
import { SessionClient } from "./SessionClient";

class MockAudio {
  static instances: MockAudio[] = [];

  readonly listeners = new Map<string, Set<() => void>>();
  play = vi.fn(async () => {});
  pause = vi.fn();
  currentTime = 0;
  src: string;

  constructor(src = "") {
    this.src = src;
    MockAudio.instances.push(this);
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

describe("SessionClient audio handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    MockAudio.instances = [];
  });

  it("waits for the final segment before resolving default audio waiters", async () => {
    const client = new SessionClient({ autoPlayAudio: false });
    let resolved: BrowserAudioResult | undefined;
    const done = client.audioDone().then((event) => {
      resolved = event;
      return event;
    });

    emitAudio(client, {
      event: "start",
      responseId: "response-0",
      requestId: "request-1",
      segmentIndex: 0,
      segmentCount: 2,
    });
    emitAudio(client, {
      event: "delta",
      responseId: "response-0",
      requestId: "request-1",
      segmentIndex: 0,
      segmentCount: 2,
      delta: "Zmlyc3Q=",
    });
    emitAudio(client, {
      event: "done",
      responseId: "response-0",
      requestId: "request-1",
      segmentIndex: 0,
      segmentCount: 2,
      isFinal: false,
    });

    await Promise.resolve();
    expect(resolved).toBeUndefined();

    emitAudio(client, {
      event: "start",
      responseId: "response-1",
      requestId: "request-1",
      segmentIndex: 1,
      segmentCount: 2,
    });
    emitAudio(client, {
      event: "delta",
      responseId: "response-1",
      requestId: "request-1",
      segmentIndex: 1,
      segmentCount: 2,
      delta: "c2Vjb25k",
    });
    emitAudio(client, {
      event: "done",
      responseId: "response-1",
      requestId: "request-1",
      segmentIndex: 1,
      segmentCount: 2,
      isFinal: true,
    });

    await expect(done).resolves.toMatchObject({
      responseId: "response-1",
      requestId: "request-1",
      segmentIndex: 1,
      segmentCount: 2,
      isFinal: true,
    });
    expect(resolved?.segments?.map((segment) => segment.responseId)).toEqual([
      "response-0",
      "response-1",
    ]);
  });

  it("queues completed MP3 segments instead of replacing active playback", async () => {
    vi.stubGlobal("Audio", MockAudio);
    const client = new SessionClient();

    emitCompleteAudio(client, {
      responseId: "response-0",
      requestId: "request-1",
      segmentIndex: 0,
      segmentCount: 2,
      isFinal: false,
      delta: "Zmlyc3Q=",
    });
    emitCompleteAudio(client, {
      responseId: "response-1",
      requestId: "request-1",
      segmentIndex: 1,
      segmentCount: 2,
      isFinal: true,
      delta: "c2Vjb25k",
    });

    await Promise.resolve();
    expect(MockAudio.instances).toHaveLength(1);
    expect(MockAudio.instances[0]?.src).toContain("Zmlyc3Q=");

    MockAudio.instances[0]?.emit("ended");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(MockAudio.instances).toHaveLength(2);
    expect(MockAudio.instances[1]?.src).toContain("c2Vjb25k");
  });
});

type BrowserAudioResult = Awaited<ReturnType<SessionClient["audioDone"]>>;
type AudioSegmentInput = Omit<AudioPayload, "event"> & { responseId: string };

function emitCompleteAudio(
  client: SessionClient,
  input: AudioSegmentInput,
): void {
  emitAudio(client, { ...input, event: "start", delta: undefined });
  emitAudio(client, { ...input, event: "delta" });
  emitAudio(client, { ...input, event: "done", delta: undefined });
}

function emitAudio(client: SessionClient, audio: AudioPayload): void {
  const message: ChannelMessage = {
    type: "audio",
    sessionId: "session-1",
    messageId: `message-${audio.responseId ?? "audio"}`,
    timestamp: Date.now(),
    direction: "to_browser",
    audio,
  };
  (
    client as unknown as {
      _handleAudio: (payload: AudioPayload, message: ChannelMessage) => void;
    }
  )._handleAudio(audio, message);
}
