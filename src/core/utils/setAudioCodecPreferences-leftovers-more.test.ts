import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLogger } from "./sdkLogger";
import { setAudioCodecPreferences } from "./setAudioCodecPreferences";

const leftoverLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const leftoverGetCapabilities = vi.fn();

type LeftoverTrack = { kind: string } | null | undefined;

function leftoverTransceiver(
  senderTrack: LeftoverTrack,
  receiverTrack: LeftoverTrack = undefined,
) {
  return {
    sender: { track: senderTrack },
    receiver: { track: receiverTrack },
    setCodecPreferences: vi.fn(),
  };
}

function leftoverPeerConnection(
  transceivers: ReturnType<typeof leftoverTransceiver>[],
): RTCPeerConnection {
  return {
    getTransceivers: vi.fn(() => transceivers),
  } as unknown as RTCPeerConnection;
}

beforeEach(() => {
  leftoverLogger.debug.mockReset();
  leftoverLogger.info.mockReset();
  leftoverLogger.warn.mockReset();
  leftoverLogger.error.mockReset();
  leftoverGetCapabilities.mockReset();
  setLogger(leftoverLogger);
  vi.stubGlobal("RTCRtpSender", { getCapabilities: leftoverGetCapabilities });
});

afterEach(() => {
  setLogger(undefined);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("setAudioCodecPreferences leftovers-more preferPcma", () => {
  it("returns leftover-more immediately when preferPcma is false", () => {
    const getTransceivers = vi.fn();
    const pc = { getTransceivers } as unknown as RTCPeerConnection;

    setAudioCodecPreferences(pc, false);

    expect(getTransceivers).not.toHaveBeenCalled();
    expect(leftoverGetCapabilities).not.toHaveBeenCalled();
    expect(leftoverLogger.debug).not.toHaveBeenCalled();
    expect(leftoverLogger.warn).not.toHaveBeenCalled();
  });

  it("defaults leftover-more omitted preferPcma to true and applies PCMA", () => {
    const audio = leftoverTransceiver({ kind: "audio" });
    leftoverGetCapabilities.mockReturnValue({
      codecs: [{ mimeType: "audio/opus" }, { mimeType: "audio/PCMA" }],
    });

    setAudioCodecPreferences(leftoverPeerConnection([audio]));

    expect(leftoverGetCapabilities).toHaveBeenCalledWith("audio");
    expect(audio.setCodecPreferences).toHaveBeenCalledWith([
      { mimeType: "audio/PCMA" },
    ]);
    expect(leftoverLogger.debug).toHaveBeenCalledWith(
      "[DelphiClient]",
      "Setting audio codec preferences:",
      ["audio/PCMA"],
    );
  });
});

describe("setAudioCodecPreferences leftovers-more transceiver selection", () => {
  it("skips leftover-more connections with no audio transceiver", () => {
    const video = leftoverTransceiver({ kind: "video" }, { kind: "video" });
    const empty = leftoverPeerConnection([]);
    const videoOnly = leftoverPeerConnection([video]);

    setAudioCodecPreferences(empty);
    setAudioCodecPreferences(videoOnly);

    expect(leftoverGetCapabilities).not.toHaveBeenCalled();
    expect(video.setCodecPreferences).not.toHaveBeenCalled();
    expect(leftoverLogger.debug).toHaveBeenCalledWith(
      "[DelphiClient]",
      "No audio transceiver found, skipping codec preferences",
    );
    expect(leftoverLogger.debug).toHaveBeenCalledTimes(2);
  });

  it("selects leftover-more audio from the sender track", () => {
    const video = leftoverTransceiver({ kind: "video" });
    const audio = leftoverTransceiver({ kind: "audio" }, { kind: "video" });
    leftoverGetCapabilities.mockReturnValue({
      codecs: [{ mimeType: "audio/PCMA" }],
    });

    setAudioCodecPreferences(leftoverPeerConnection([video, audio]));

    expect(audio.setCodecPreferences).toHaveBeenCalledTimes(1);
    expect(video.setCodecPreferences).not.toHaveBeenCalled();
  });

  it("selects leftover-more audio from the receiver when the sender has none", () => {
    const audio = leftoverTransceiver(null, { kind: "audio" });
    leftoverGetCapabilities.mockReturnValue({
      codecs: [{ mimeType: "audio/telephone-event" }],
    });

    setAudioCodecPreferences(leftoverPeerConnection([audio]));

    expect(audio.setCodecPreferences).toHaveBeenCalledWith([
      { mimeType: "audio/telephone-event" },
    ]);
  });
});

describe("setAudioCodecPreferences leftovers-more capabilities", () => {
  it("skips leftover-more missing audio capabilities", () => {
    const audio = leftoverTransceiver({ kind: "audio" });
    leftoverGetCapabilities.mockReturnValue(null);

    setAudioCodecPreferences(leftoverPeerConnection([audio]));

    expect(audio.setCodecPreferences).not.toHaveBeenCalled();
    expect(leftoverLogger.debug).toHaveBeenCalledWith(
      "[DelphiClient]",
      "Could not get audio capabilities",
    );
  });

  it("skips leftover-more capabilities that have no PCMA or telephone-event", () => {
    const audio = leftoverTransceiver({ kind: "audio" });
    leftoverGetCapabilities.mockReturnValue({
      codecs: [{ mimeType: "audio/opus" }, { mimeType: "audio/PCMU" }],
    });

    setAudioCodecPreferences(leftoverPeerConnection([audio]));

    expect(audio.setCodecPreferences).not.toHaveBeenCalled();
    expect(leftoverLogger.debug).toHaveBeenCalledWith(
      "[DelphiClient]",
      "PCMA codec not available in browser capabilities",
    );
  });

  it("puts leftover-more PCMA ahead of telephone-event", () => {
    const audio = leftoverTransceiver({ kind: "audio" });
    leftoverGetCapabilities.mockReturnValue({
      codecs: [
        { mimeType: "audio/telephone-event" },
        { mimeType: "audio/opus" },
        { mimeType: "audio/PCMA" },
      ],
    });

    setAudioCodecPreferences(leftoverPeerConnection([audio]));

    expect(audio.setCodecPreferences).toHaveBeenCalledWith([
      { mimeType: "audio/PCMA" },
      { mimeType: "audio/telephone-event" },
    ]);
    expect(leftoverLogger.debug).toHaveBeenCalledWith(
      "[DelphiClient]",
      "Setting audio codec preferences:",
      ["audio/PCMA", "audio/telephone-event"],
    );
  });
});

describe("setAudioCodecPreferences leftovers-more errors", () => {
  it("warns leftover-more when getTransceivers throws", () => {
    const failure = new Error("transceivers unavailable");
    const pc = {
      getTransceivers: vi.fn(() => {
        throw failure;
      }),
    } as unknown as RTCPeerConnection;

    expect(() => setAudioCodecPreferences(pc)).not.toThrow();
    expect(leftoverGetCapabilities).not.toHaveBeenCalled();
    expect(leftoverLogger.warn).toHaveBeenCalledWith(
      "Failed to set codec preferences:",
      failure,
    );
  });

  it("warns leftover-more when setCodecPreferences throws", () => {
    const failure = new Error("codec preference rejected");
    const audio = leftoverTransceiver({ kind: "audio" });
    audio.setCodecPreferences.mockImplementation(() => {
      throw failure;
    });
    leftoverGetCapabilities.mockReturnValue({
      codecs: [{ mimeType: "audio/PCMA" }],
    });

    expect(() =>
      setAudioCodecPreferences(leftoverPeerConnection([audio])),
    ).not.toThrow();
    expect(leftoverLogger.warn).toHaveBeenCalledWith(
      "Failed to set codec preferences:",
      failure,
    );
  });
});
