import { describe, expect, it } from "vitest";

import type { AudioPayload, ChannelMessage } from "./channelTypes";
import { SessionClient } from "./SessionClient";

type LeftoverAudioInput = Omit<AudioPayload, "event"> & { responseId: string };

function leftoverMessage(audio: AudioPayload): ChannelMessage {
  return {
    type: "audio",
    sessionId: "session-leftover",
    messageId: `message-${audio.responseId ?? "audio"}`,
    timestamp: Date.now(),
    direction: "to_browser",
    audio,
  };
}

function emitLeftoverAudio(client: SessionClient, audio: AudioPayload): void {
  (
    client as unknown as {
      _handleAudio: (payload: AudioPayload, message: ChannelMessage) => void;
    }
  )._handleAudio(audio, leftoverMessage(audio));
}

function emitLeftoverCompleteAudio(
  client: SessionClient,
  input: LeftoverAudioInput,
): void {
  emitLeftoverAudio(client, { ...input, event: "start", delta: undefined });
  emitLeftoverAudio(client, { ...input, event: "delta" });
  emitLeftoverAudio(client, { ...input, event: "done", delta: undefined });
}

describe("SessionClient leftover-more metadata helpers", () => {
  it("reads leftover-more requestId, segment fields, and isFinal from metadata when top-level fields are omitted", async () => {
    const client = new SessionClient({ autoPlayAudio: false });
    const done = client.audioDone();

    emitLeftoverCompleteAudio(client, {
      responseId: "response-leftover-meta",
      delta: "bGVmdG92ZXI=",
      metadata: {
        requestId: "request-from-metadata",
        segmentIndex: 0,
        segmentCount: 1,
        isFinal: true,
      },
    });

    await expect(done).resolves.toMatchObject({
      responseId: "response-leftover-meta",
      requestId: "request-from-metadata",
      segmentIndex: 0,
      segmentCount: 1,
      isFinal: true,
    });
  });

  it("treats leftover-more empty and non-string requestId metadata as missing", async () => {
    const client = new SessionClient({ autoPlayAudio: false });
    const emptyDone = client.audioDone();

    emitLeftoverCompleteAudio(client, {
      responseId: "response-empty-request",
      delta: "YQ==",
      metadata: { requestId: "" },
    });

    const emptyEvent = await emptyDone;
    expect(emptyEvent.requestId).toBeUndefined();
    expect(emptyEvent.isFinal).toBe(true);

    const nonStringDone = client.audioDone();
    emitLeftoverCompleteAudio(client, {
      responseId: "response-nonstring-request",
      delta: "YQ==",
      metadata: { requestId: 42 },
    });

    const nonStringEvent = await nonStringDone;
    expect(nonStringEvent.requestId).toBeUndefined();
  });

  it("ignores leftover-more non-finite and non-number segment metadata", async () => {
    const client = new SessionClient({ autoPlayAudio: false });
    const done = client.audioDone();

    emitLeftoverCompleteAudio(client, {
      responseId: "response-bad-numbers",
      delta: "YQ==",
      metadata: {
        requestId: "request-bad-numbers",
        segmentIndex: Number.NaN,
        segmentCount: Number.POSITIVE_INFINITY,
        isFinal: true,
      },
    });

    const event = await done;
    expect(event.requestId).toBe("request-bad-numbers");
    expect(event.segmentIndex).toBeUndefined();
    expect(event.segmentCount).toBe(1);
    expect(event.isFinal).toBe(true);
  });

  it("ignores leftover-more string segment counts and non-boolean isFinal metadata", async () => {
    const client = new SessionClient({ autoPlayAudio: false });
    const done = client.audioDone();

    emitLeftoverCompleteAudio(client, {
      responseId: "response-wrong-types",
      delta: "YQ==",
      metadata: {
        segmentIndex: "0",
        segmentCount: "1",
        isFinal: "true",
      },
    });

    const event = await done;
    expect(event.segmentIndex).toBeUndefined();
    expect(event.segmentCount).toBeUndefined();
    expect(event.isFinal).toBe(true);
  });

  it("keeps leftover-more false isFinal from metadata so grouped waiters stay pending", async () => {
    const client = new SessionClient({ autoPlayAudio: false });
    let resolved: Awaited<ReturnType<SessionClient["audioDone"]>> | undefined;
    const done = client.audioDone().then((event) => {
      resolved = event;
      return event;
    });

    emitLeftoverCompleteAudio(client, {
      responseId: "response-not-final",
      delta: "Zmlyc3Q=",
      metadata: {
        requestId: "request-grouped",
        segmentIndex: 0,
        segmentCount: 2,
        isFinal: false,
      },
    });

    await Promise.resolve();
    expect(resolved).toBeUndefined();

    emitLeftoverCompleteAudio(client, {
      responseId: "response-final",
      delta: "c2Vjb25k",
      metadata: {
        requestId: "request-grouped",
        segmentIndex: 1,
        segmentCount: 2,
        isFinal: true,
      },
    });

    await expect(done).resolves.toMatchObject({
      responseId: "response-final",
      requestId: "request-grouped",
      segmentIndex: 1,
      segmentCount: 2,
      isFinal: true,
    });
    expect(resolved?.segments?.map((segment) => segment.responseId)).toEqual([
      "response-not-final",
      "response-final",
    ]);
  });

  it("prefers leftover-more top-level audio fields over metadata fallbacks", async () => {
    const client = new SessionClient({ autoPlayAudio: false });
    const done = client.audioDone();

    emitLeftoverCompleteAudio(client, {
      responseId: "response-toplevel-wins",
      requestId: "request-toplevel",
      segmentIndex: 0,
      segmentCount: 1,
      isFinal: true,
      delta: "YQ==",
      metadata: {
        requestId: "request-metadata",
        segmentIndex: 9,
        segmentCount: 9,
        isFinal: false,
      },
    });

    await expect(done).resolves.toMatchObject({
      requestId: "request-toplevel",
      segmentIndex: 0,
      segmentCount: 1,
      isFinal: true,
    });
  });

  it("fills leftover-more missing start fields from later delta metadata", async () => {
    const client = new SessionClient({ autoPlayAudio: false });
    const done = client.audioDone();

    emitLeftoverAudio(client, {
      event: "start",
      responseId: "response-delta-meta",
    });
    emitLeftoverAudio(client, {
      event: "delta",
      responseId: "response-delta-meta",
      delta: "YQ==",
      metadata: {
        requestId: "request-from-delta",
        segmentIndex: 0,
        segmentCount: 1,
        isFinal: true,
      },
    });
    emitLeftoverAudio(client, {
      event: "done",
      responseId: "response-delta-meta",
    });

    await expect(done).resolves.toMatchObject({
      responseId: "response-delta-meta",
      requestId: "request-from-delta",
      segmentIndex: 0,
      segmentCount: 1,
      isFinal: true,
    });
  });

  it("leaves leftover-more omitted metadata keys undefined", async () => {
    const client = new SessionClient({ autoPlayAudio: false });
    const done = client.audioDone();

    emitLeftoverCompleteAudio(client, {
      responseId: "response-empty-meta",
      delta: "YQ==",
      metadata: {},
    });

    const event = await done;
    expect(event.requestId).toBeUndefined();
    expect(event.segmentIndex).toBeUndefined();
    expect(event.segmentCount).toBeUndefined();
    expect(event.isFinal).toBe(true);
  });
});
