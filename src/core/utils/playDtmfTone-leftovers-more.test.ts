import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DTMF_FREQUENCIES } from "./constants";

const leftoverLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function leftoverOscillator() {
  return {
    frequency: { value: 0 },
    type: "sine" as OscillatorType,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function leftoverGain() {
  return {
    gain: {
      value: 0,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  };
}

type LeftoverAudioContextOptions = {
  state?: AudioContextState;
  currentTime?: number;
  constructError?: Error;
  createError?: Error;
};

function leftoverAudioContext(options: LeftoverAudioContextOptions = {}) {
  const oscillators: ReturnType<typeof leftoverOscillator>[] = [];
  const gain = leftoverGain();
  const destination = { kind: "destination" };

  return {
    state: options.state ?? "running",
    currentTime: options.currentTime ?? 3.5,
    destination,
    resume: vi.fn().mockResolvedValue(undefined),
    createOscillator: vi.fn(() => {
      if (options.createError) throw options.createError;
      const oscillator = leftoverOscillator();
      oscillators.push(oscillator);
      return oscillator;
    }),
    createGain: vi.fn(() => gain),
    oscillators,
    gain,
  };
}

type LeftoverContext = ReturnType<typeof leftoverAudioContext>;

let AudioContextMock: ReturnType<typeof vi.fn>;
let latestContext: LeftoverContext | undefined;

function stubAudioContext(options: LeftoverAudioContextOptions = {}) {
  latestContext = undefined;
  AudioContextMock = vi.fn(function LeftoverAudioContext() {
    if (options.constructError) throw options.constructError;
    latestContext = leftoverAudioContext(options);
    return latestContext;
  });
  vi.stubGlobal("AudioContext", AudioContextMock);
}

async function loadPlayDtmfTone() {
  const { setLogger } = await import("./sdkLogger");
  const { playDtmfTone } = await import("./playDtmfTone");
  setLogger(leftoverLogger);
  return playDtmfTone;
}

beforeEach(() => {
  leftoverLogger.debug.mockReset();
  leftoverLogger.info.mockReset();
  leftoverLogger.warn.mockReset();
  leftoverLogger.error.mockReset();
  stubAudioContext();
  vi.resetModules();
});

afterEach(async () => {
  const { setLogger } = await import("./sdkLogger");
  setLogger(undefined);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("playDtmfTone leftovers-more unknown digits", () => {
  it("returns leftover-more without constructing AudioContext for unmapped digits", async () => {
    const playDtmfTone = await loadPlayDtmfTone();

    for (const leftover of [
      "",
      "A",
      "B",
      "C",
      "D",
      "a",
      "1 ",
      " 1",
      "10",
      "00",
      "star",
    ]) {
      playDtmfTone(leftover);
    }

    expect(AudioContextMock).not.toHaveBeenCalled();
    expect(leftoverLogger.warn).not.toHaveBeenCalled();
    expect(leftoverLogger.debug).not.toHaveBeenCalled();
  });
});

describe("playDtmfTone leftovers-more mapped digits", () => {
  it.each(Object.entries(DTMF_FREQUENCIES))(
    "plays leftover-more digit %s at [%s, %s]",
    async (digit, [lowFreq, highFreq]) => {
      const playDtmfTone = await loadPlayDtmfTone();

      playDtmfTone(digit);

      expect(AudioContextMock).toHaveBeenCalledTimes(1);
      expect(latestContext?.oscillators[0]?.frequency.value).toBe(lowFreq);
      expect(latestContext?.oscillators[1]?.frequency.value).toBe(highFreq);
      expect(latestContext?.oscillators[0]?.type).toBe("sine");
      expect(latestContext?.oscillators[1]?.type).toBe("sine");
    },
  );
});

describe("playDtmfTone leftovers-more duration and graph", () => {
  it("uses leftover-more default 150ms duration when omitted", async () => {
    stubAudioContext({ currentTime: 4 });
    const playDtmfTone = await loadPlayDtmfTone();

    playDtmfTone("5");

    expect(latestContext?.oscillators[0]?.start).toHaveBeenCalledWith(4);
    expect(latestContext?.oscillators[1]?.start).toHaveBeenCalledWith(4);
    expect(latestContext?.oscillators[0]?.stop).toHaveBeenCalledWith(4.15);
    expect(latestContext?.oscillators[1]?.stop).toHaveBeenCalledWith(4.15);
    expect(latestContext?.gain.gain.setValueAtTime).toHaveBeenCalledWith(
      0.1,
      4,
    );
    expect(
      latestContext?.gain.gain.exponentialRampToValueAtTime,
    ).toHaveBeenCalledWith(0.001, 4.15);
  });

  it("converts leftover-more custom and zero durations from ms to seconds", async () => {
    stubAudioContext({ currentTime: 1 });
    const playDtmfTone = await loadPlayDtmfTone();

    playDtmfTone("*", 400);

    expect(latestContext?.oscillators[0]?.stop).toHaveBeenCalledWith(1.4);
    expect(
      latestContext?.gain.gain.exponentialRampToValueAtTime,
    ).toHaveBeenCalledWith(0.001, 1.4);

    playDtmfTone("#", 0);

    expect(latestContext?.oscillators[2]?.stop).toHaveBeenCalledWith(1);
    expect(
      latestContext?.gain.gain.exponentialRampToValueAtTime,
    ).toHaveBeenLastCalledWith(0.001, 1);
  });

  it("connects leftover-more oscillators through the gain node to destination", async () => {
    const playDtmfTone = await loadPlayDtmfTone();

    playDtmfTone("0");

    expect(latestContext?.createOscillator).toHaveBeenCalledTimes(2);
    expect(latestContext?.createGain).toHaveBeenCalledTimes(1);
    expect(latestContext?.gain.gain.value).toBe(0.1);
    expect(latestContext?.oscillators[0]?.connect).toHaveBeenCalledWith(
      latestContext?.gain,
    );
    expect(latestContext?.oscillators[1]?.connect).toHaveBeenCalledWith(
      latestContext?.gain,
    );
    expect(latestContext?.gain.connect).toHaveBeenCalledWith(
      latestContext?.destination,
    );
  });
});

describe("playDtmfTone leftovers-more AudioContext lifecycle", () => {
  it("reuses leftover-more lazy AudioContext across mapped digits", async () => {
    const playDtmfTone = await loadPlayDtmfTone();

    playDtmfTone("1");
    playDtmfTone("2");

    expect(AudioContextMock).toHaveBeenCalledTimes(1);
    expect(latestContext?.createOscillator).toHaveBeenCalledTimes(4);
    expect(latestContext?.createGain).toHaveBeenCalledTimes(2);
  });

  it("resumes leftover-more suspended AudioContext and does not resume running or closed", async () => {
    stubAudioContext({ state: "suspended" });
    const playDtmfTone = await loadPlayDtmfTone();

    playDtmfTone("3");
    await latestContext?.resume.mock.results[0]?.value;

    expect(latestContext?.resume).toHaveBeenCalledTimes(1);

    if (latestContext) latestContext.state = "running";
    playDtmfTone("4");
    expect(latestContext?.resume).toHaveBeenCalledTimes(1);

    if (latestContext) latestContext.state = "closed";
    playDtmfTone("6");
    expect(latestContext?.resume).toHaveBeenCalledTimes(1);
  });
});

describe("playDtmfTone leftovers-more errors", () => {
  it("warns leftover-more when AudioContext construction throws", async () => {
    const failure = new Error("audio context unavailable");
    stubAudioContext({ constructError: failure });
    const playDtmfTone = await loadPlayDtmfTone();

    expect(() => playDtmfTone("7")).not.toThrow();
    expect(leftoverLogger.warn).toHaveBeenCalledWith(
      "Failed to play DTMF tone:",
      failure,
    );
    expect(leftoverLogger.debug).not.toHaveBeenCalled();
  });

  it("warns leftover-more when oscillator creation throws", async () => {
    const failure = new Error("oscillator rejected");
    stubAudioContext({ createError: failure });
    const playDtmfTone = await loadPlayDtmfTone();

    expect(() => playDtmfTone("8")).not.toThrow();
    expect(leftoverLogger.warn).toHaveBeenCalledWith(
      "Failed to play DTMF tone:",
      failure,
    );
  });
});
