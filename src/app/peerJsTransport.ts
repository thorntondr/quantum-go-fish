import type { PeerId, SessionMessage } from "./sessionTypes.js";
import type { SessionTransport } from "./sessionTransport.js";
import { encodeMessage, parseMessage } from "./sessionProtocol.js";

type PeerStatus = "new" | "connecting" | "open" | "closed" | "error";

interface DataConnectionLike {
  peer: string;
  open: boolean;
  send: (data: string) => void;
  on: (event: string, handler: (...args: any[]) => void) => void;
  close: () => void;
}

interface PeerLike {
  id?: string;
  on: (event: string, handler: (...args: any[]) => void) => void;
  connect: (peerId: string, options?: { reliable?: boolean }) => DataConnectionLike;
  disconnect: () => void;
  destroy: () => void;
}

type PeerCtorLike = new (id?: string) => PeerLike;

function peerCtor(): PeerCtorLike {
  const ctor = (globalThis as { Peer?: PeerCtorLike }).Peer;
  if (!ctor) {
    throw new Error("PeerJS global not found. Load peerjs.min.js before app main module.");
  }
  return ctor;
}

export class HostPeerJsTransport implements SessionTransport {
  private readonly peer: PeerLike;
  private readonly peers = new Map<PeerId, DataConnectionLike>();
  private messageHandler: (from: PeerId, message: SessionMessage) => void = () => {};
  private peerStateHandler: (peerId: PeerId, status: PeerStatus) => void = () => {};
  private readyHandler: (peerId: PeerId) => void = () => {};

  constructor(hostPeerId?: string) {
    const Peer = peerCtor();
    this.peer = new Peer(hostPeerId);
    this.peer.on("open", (id: string) => {
      this.readyHandler(id);
      this.peerStateHandler("self", "open");
    });
    this.peer.on("connection", (conn: DataConnectionLike) => {
      const peerId = conn.peer;
      this.peers.set(peerId, conn);
      this.peerStateHandler(peerId, "connecting");
      conn.on("open", () => this.peerStateHandler(peerId, "open"));
      conn.on("close", () => {
        this.peers.delete(peerId);
        this.peerStateHandler(peerId, "closed");
      });
      conn.on("error", () => this.peerStateHandler(peerId, "error"));
      conn.on("data", (raw: unknown) => {
        const parsed = parseMessage(String(raw));
        this.messageHandler(peerId, parsed);
      });
    });
    this.peer.on("error", () => this.peerStateHandler("self", "error"));
    this.peer.on("disconnected", () => this.peerStateHandler("self", "closed"));
    this.peer.on("close", () => this.peerStateHandler("self", "closed"));
  }

  onReady(handler: (peerId: PeerId) => void): void {
    this.readyHandler = handler;
  }

  send(to: PeerId, message: SessionMessage): void {
    const conn = this.peers.get(to);
    if (!conn || !conn.open) {
      throw new Error(`Peer connection ${to} is not open.`);
    }
    conn.send(encodeMessage(message));
  }

  broadcast(message: SessionMessage): void {
    for (const peerId of this.peers.keys()) {
      try {
        this.send(peerId, message);
      } catch {
        // Best effort.
      }
    }
  }

  listPeers(): PeerId[] {
    return [...this.peers.keys()];
  }

  onMessage(handler: (from: PeerId, message: SessionMessage) => void): void {
    this.messageHandler = handler;
  }

  onPeerState(handler: (peerId: PeerId, status: PeerStatus) => void): void {
    this.peerStateHandler = handler;
  }

  close(): void {
    for (const conn of this.peers.values()) {
      conn.close();
    }
    this.peers.clear();
    this.peer.disconnect();
    this.peer.destroy();
  }
}

export class PeerPeerJsTransport implements SessionTransport {
  private readonly peer: PeerLike;
  private readonly hostRemotePeerId: PeerId;
  private readonly hostLogicalPeerId: PeerId = "host";
  private conn: DataConnectionLike | undefined;
  private messageHandler: (from: PeerId, message: SessionMessage) => void = () => {};
  private peerStateHandler: (peerId: PeerId, status: PeerStatus) => void = () => {};
  private readyHandler: (peerId: PeerId) => void = () => {};

  constructor(hostPeerId: PeerId, localPeerId?: string) {
    this.hostRemotePeerId = hostPeerId;
    const Peer = peerCtor();
    this.peer = new Peer(localPeerId);
    this.peer.on("open", (id: string) => {
      this.readyHandler(id);
      this.openHostConnection();
    });
    this.peer.on("error", () => this.peerStateHandler(this.hostLogicalPeerId, "error"));
    this.peer.on("disconnected", () => this.peerStateHandler(this.hostLogicalPeerId, "closed"));
    this.peer.on("close", () => this.peerStateHandler(this.hostLogicalPeerId, "closed"));
  }

  private openHostConnection(): void {
    this.peerStateHandler(this.hostLogicalPeerId, "connecting");
    const conn = this.peer.connect(this.hostRemotePeerId, { reliable: true });
    this.conn = conn;
    conn.on("open", () => this.peerStateHandler(this.hostLogicalPeerId, "open"));
    conn.on("close", () => this.peerStateHandler(this.hostLogicalPeerId, "closed"));
    conn.on("error", () => this.peerStateHandler(this.hostLogicalPeerId, "error"));
    conn.on("data", (raw: unknown) => {
      const parsed = parseMessage(String(raw));
      this.messageHandler(this.hostLogicalPeerId, parsed);
    });
  }

  onReady(handler: (peerId: PeerId) => void): void {
    this.readyHandler = handler;
  }

  send(to: PeerId, message: SessionMessage): void {
    if (to !== this.hostLogicalPeerId) {
      throw new Error("Peer transport can only send to host.");
    }
    if (!this.conn || !this.conn.open) {
      throw new Error("Host connection is not open.");
    }
    this.conn.send(encodeMessage(message));
  }

  broadcast(message: SessionMessage): void {
    this.send(this.hostLogicalPeerId, message);
  }

  listPeers(): PeerId[] {
    return [this.hostLogicalPeerId];
  }

  onMessage(handler: (from: PeerId, message: SessionMessage) => void): void {
    this.messageHandler = handler;
  }

  onPeerState(handler: (peerId: PeerId, status: PeerStatus) => void): void {
    this.peerStateHandler = handler;
  }

  close(): void {
    this.conn?.close();
    this.peer.disconnect();
    this.peer.destroy();
  }
}
