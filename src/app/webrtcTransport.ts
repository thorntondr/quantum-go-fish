import type { PeerId, SessionMessage } from "./sessionTypes.js";
import type { SessionTransport } from "./sessionTransport.js";
import { encodeMessage, parseMessage } from "./sessionProtocol.js";

export interface CandidateBundle {
  candidates: RTCIceCandidateInit[];
}

function defaultRtcConfig(): RTCConfiguration {
  return {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  };
}

function serializeCandidates(candidates: RTCIceCandidateInit[]): string {
  return JSON.stringify({ candidates } satisfies CandidateBundle, null, 2);
}

function parseCandidates(raw: string): RTCIceCandidateInit[] {
  if (!raw.trim()) {
    return [];
  }
  const parsed = JSON.parse(raw) as Partial<CandidateBundle>;
  if (!parsed.candidates || !Array.isArray(parsed.candidates)) {
    throw new Error("Invalid ICE candidate payload.");
  }
  return parsed.candidates;
}

interface HostPeerConnection {
  pc: RTCPeerConnection;
  channel?: RTCDataChannel;
  localIce: RTCIceCandidateInit[];
}

export class HostWebRtcTransport implements SessionTransport {
  private readonly peers = new Map<PeerId, HostPeerConnection>();
  private messageHandler: (from: PeerId, message: SessionMessage) => void = () => {};
  private peerStateHandler: (
    peerId: PeerId,
    status: "new" | "connecting" | "open" | "closed" | "error"
  ) => void = () => {};

  createOffer(peerId: PeerId): Promise<string> {
    if (this.peers.has(peerId)) {
      throw new Error(`Peer ${peerId} already exists.`);
    }
    const pc = new RTCPeerConnection(defaultRtcConfig());
    const state: HostPeerConnection = { pc, localIce: [] };
    this.peers.set(peerId, state);
    this.peerStateHandler(peerId, "new");

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        state.localIce.push(event.candidate.toJSON());
      }
    };
    pc.onconnectionstatechange = () => {
      const status =
        pc.connectionState === "connected"
          ? "open"
          : pc.connectionState === "connecting"
            ? "connecting"
            : pc.connectionState === "failed"
              ? "error"
              : pc.connectionState === "disconnected" || pc.connectionState === "closed"
                ? "closed"
                : "new";
      this.peerStateHandler(peerId, status);
    };

    const channel = pc.createDataChannel("qgf-session", { ordered: true });
    state.channel = channel;
    channel.onopen = () => this.peerStateHandler(peerId, "open");
    channel.onclose = () => this.peerStateHandler(peerId, "closed");
    channel.onerror = () => this.peerStateHandler(peerId, "error");
    channel.onmessage = (event) => {
      const parsed = parseMessage(String(event.data));
      this.messageHandler(peerId, parsed);
    };

    return pc
      .createOffer()
      .then((offer) => pc.setLocalDescription(offer).then(() => offer.sdp ?? ""))
      .then((sdp) => {
        if (!sdp) {
          throw new Error("Failed to create host offer.");
        }
        return sdp;
      });
  }

  async acceptAnswer(peerId: PeerId, answerSdp: string): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) {
      throw new Error(`Unknown peer ${peerId}.`);
    }
    await peer.pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
  }

  drainLocalIce(peerId: PeerId): string {
    const peer = this.peers.get(peerId);
    if (!peer) {
      throw new Error(`Unknown peer ${peerId}.`);
    }
    const copy = [...peer.localIce];
    peer.localIce.length = 0;
    return serializeCandidates(copy);
  }

  async addRemoteIce(peerId: PeerId, rawCandidates: string): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) {
      throw new Error(`Unknown peer ${peerId}.`);
    }
    const candidates = parseCandidates(rawCandidates);
    for (const candidate of candidates) {
      await peer.pc.addIceCandidate(candidate);
    }
  }

  send(to: PeerId, message: SessionMessage): void {
    const peer = this.peers.get(to);
    if (!peer || !peer.channel) {
      throw new Error(`Cannot send to unknown peer ${to}.`);
    }
    if (peer.channel.readyState !== "open") {
      throw new Error(`Peer channel ${to} is not open.`);
    }
    peer.channel.send(encodeMessage(message));
  }

  broadcast(message: SessionMessage): void {
    for (const peerId of this.peers.keys()) {
      try {
        this.send(peerId, message);
      } catch {
        // Best-effort broadcast to open channels only.
      }
    }
  }

  listPeers(): PeerId[] {
    return [...this.peers.keys()];
  }

  onMessage(handler: (from: PeerId, message: SessionMessage) => void): void {
    this.messageHandler = handler;
  }

  onPeerState(
    handler: (peerId: PeerId, status: "new" | "connecting" | "open" | "closed" | "error") => void
  ): void {
    this.peerStateHandler = handler;
  }

  close(): void {
    for (const peer of this.peers.values()) {
      peer.channel?.close();
      peer.pc.close();
    }
    this.peers.clear();
  }
}

export class PeerWebRtcTransport implements SessionTransport {
  private readonly pc = new RTCPeerConnection(defaultRtcConfig());
  private channel?: RTCDataChannel;
  private readonly localIce: RTCIceCandidateInit[] = [];
  private messageHandler: (from: PeerId, message: SessionMessage) => void = () => {};
  private peerStateHandler: (
    peerId: PeerId,
    status: "new" | "connecting" | "open" | "closed" | "error"
  ) => void = () => {};
  private readonly hostPeerId = "host";

  constructor() {
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.localIce.push(event.candidate.toJSON());
      }
    };
    this.pc.onconnectionstatechange = () => {
      const status =
        this.pc.connectionState === "connected"
          ? "open"
          : this.pc.connectionState === "connecting"
            ? "connecting"
            : this.pc.connectionState === "failed"
              ? "error"
              : this.pc.connectionState === "disconnected" || this.pc.connectionState === "closed"
                ? "closed"
                : "new";
      this.peerStateHandler(this.hostPeerId, status);
    };
    this.pc.ondatachannel = (event) => {
      this.channel = event.channel;
      this.channel.onopen = () => this.peerStateHandler(this.hostPeerId, "open");
      this.channel.onclose = () => this.peerStateHandler(this.hostPeerId, "closed");
      this.channel.onerror = () => this.peerStateHandler(this.hostPeerId, "error");
      this.channel.onmessage = (messageEvent) => {
        const parsed = parseMessage(String(messageEvent.data));
        this.messageHandler(this.hostPeerId, parsed);
      };
    };
  }

  async acceptOfferAndCreateAnswer(offerSdp: string): Promise<string> {
    await this.pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    if (!answer.sdp) {
      throw new Error("Failed to create peer answer.");
    }
    return answer.sdp;
  }

  drainLocalIce(): string {
    const copy = [...this.localIce];
    this.localIce.length = 0;
    return serializeCandidates(copy);
  }

  async addRemoteIce(rawCandidates: string): Promise<void> {
    const candidates = parseCandidates(rawCandidates);
    for (const candidate of candidates) {
      await this.pc.addIceCandidate(candidate);
    }
  }

  send(to: PeerId, message: SessionMessage): void {
    if (to !== this.hostPeerId) {
      throw new Error("Peer transport can only send to host.");
    }
    if (!this.channel || this.channel.readyState !== "open") {
      throw new Error("Peer channel is not open.");
    }
    this.channel.send(encodeMessage(message));
  }

  broadcast(message: SessionMessage): void {
    this.send(this.hostPeerId, message);
  }

  listPeers(): PeerId[] {
    return [this.hostPeerId];
  }

  onMessage(handler: (from: PeerId, message: SessionMessage) => void): void {
    this.messageHandler = handler;
  }

  onPeerState(
    handler: (peerId: PeerId, status: "new" | "connecting" | "open" | "closed" | "error") => void
  ): void {
    this.peerStateHandler = handler;
  }

  close(): void {
    this.channel?.close();
    this.pc.close();
  }
}
