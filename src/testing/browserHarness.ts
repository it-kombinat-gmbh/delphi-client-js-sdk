import { vi, type Mock } from "vitest";

/** In-memory transport boundary: exercises SDK protocol handling without a server. */
export class Socket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: Socket[] = [];
  static autoOpen = true;
  static nextGatewayError: unknown = null;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: Record<string, any>[] = [];
  send: Mock = vi.fn((text: string) => {
    const msg = JSON.parse(text);
    this.sent.push(msg);
    if (!this.protocol || ["trickle", "keepalive"].includes(msg.janus)) return;
    queueMicrotask(() => {
      if (Socket.nextGatewayError !== null) {
        const error = Socket.nextGatewayError;
        Socket.nextGatewayError = null;
        this.receive({ janus: "error", transaction: msg.transaction, error });
        return;
      }
      this.receive({
        janus: "success",
        transaction: msg.transaction,
        data: { id: msg.janus === "create" ? 100 : 200 },
      });
      if (msg.body?.request === "register") this.sip("registered");
    });
  });
  constructor(
    public url: string,
    public protocol?: string,
  ) {
    Socket.instances.push(this);
    if (Socket.autoOpen) queueMicrotask(() => this.open());
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
    if (!this.protocol)
      this.receive({ type: "status", status: { state: "connected" } });
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  sip(event: string, extra: Record<string, unknown> = {}, jsep?: unknown) {
    this.receive({
      janus: "event",
      plugindata: { data: { result: { event, ...extra } } },
      jsep,
    });
  }
  close: Mock = vi.fn((code = 1000, reason = "") => {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  });
}

export class Peer {
  static instances: Peer[] = [];
  iceConnectionState = "connected";
  ontrack: ((event: any) => void) | null = null;
  onicecandidate: ((event: any) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  createOffer: Mock = vi
    .fn()
    .mockResolvedValue({ type: "offer", sdp: "v=0\r\n" });
  setLocalDescription: Mock = vi.fn().mockResolvedValue(undefined);
  setRemoteDescription: Mock = vi.fn().mockResolvedValue(undefined);
  addIceCandidate: Mock = vi.fn().mockResolvedValue(undefined);
  addTrack: Mock = vi.fn();
  getTransceivers: Mock = vi.fn(() => []);
  close: Mock = vi.fn();
  constructor(public configuration: unknown) {
    Peer.instances.push(this);
  }
}

export class AudioPlayer extends EventTarget {
  static instances: AudioPlayer[] = [];
  currentTime = 0;
  srcObject: unknown = null;
  play: Mock = vi.fn().mockResolvedValue(undefined);
  pause: Mock = vi.fn();
  constructor(public src = "") {
    super();
    AudioPlayer.instances.push(this);
  }
}

export async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
export function installBrowser(): {
  storage: Map<string, string>;
  track: { kind: string; stop: Mock };
  stream: { getTracks: () => Array<{ kind: string; stop: Mock }> };
  getUserMedia: Mock;
} {
  Socket.instances = [];
  Socket.autoOpen = true;
  Socket.nextGatewayError = null;
  Peer.instances = [];
  AudioPlayer.instances = [];
  const storage = new Map<string, string>();
  const track = { kind: "audio", stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("RTCPeerConnection", Peer);
  vi.stubGlobal(
    "MediaStream",
    class {
      getTracks = () => [track];
    },
  );
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("Audio", AudioPlayer);
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  return { storage, track, stream, getUserMedia };
}
