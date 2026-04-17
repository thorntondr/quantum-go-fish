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

function describePeerJsError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : undefined;
    const message = typeof record.message === "string" ? record.message : undefined;
    if (type && message) {
      return `${type}: ${message}`;
    }
    if (message) {
      return message;
    }
    if (type) {
      return type;
    }
  }
  return String(error);
}

function peerCtor(): PeerCtorLike {
  const ctor = (globalThis as { Peer?: PeerCtorLike }).Peer;
  if (!ctor) {
    throw new Error("PeerJS global not found. Load peerjs.min.js before app main module.");
  }
  return ctor;
}

function safeCloseConnection(conn: DataConnectionLike): void {
  try {
    conn.close();
  } catch {
    // Best effort: invalid or already-closed connections should not crash teardown paths.
  }
}

function isPeerDialFailureForHost(error: unknown, hostPeerId: PeerId): boolean {
  const message = describePeerJsError(error);
  return message.includes(`Could not connect to peer ${hostPeerId}`);
}

export class HostPeerJsTransport implements SessionTransport {
  private readonly peer: PeerLike;
  private readonly peers = new Map<PeerId, DataConnectionLike>();
  private messageHandler: (from: PeerId, message: SessionMessage) => void = () => {};
  private peerStateHandler: (peerId: PeerId, status: PeerStatus) => void = () => {};
  private readyHandler: (peerId: PeerId) => void = () => {};
  private debugLogHandler: (line: string) => void = () => {};

  private debug(line: string): void {
    this.debugLogHandler(`[PeerJS host] ${line}`);
  }

  private isCurrentConnection(peerId: PeerId, conn: DataConnectionLike): boolean {
    return this.peers.get(peerId) === conn;
  }

  private rejectInvalidMessage(peerId: PeerId, conn: DataConnectionLike, error: unknown): void {
    this.debug(`failed to parse message from ${peerId}: ${describePeerJsError(error)}.`);
    if (this.isCurrentConnection(peerId, conn)) {
      this.peerStateHandler(peerId, "error");
    }
    safeCloseConnection(conn);
  }

  constructor(hostPeerId?: string) {
    const Peer = peerCtor();
    this.peer = new Peer(hostPeerId);
    this.peer.on("open", (id: string) => {
      this.debug(`local peer opened as ${id}.`);
      this.readyHandler(id);
    });
    this.peer.on("connection", (conn: DataConnectionLike) => {
      const peerId = conn.peer;
      this.debug(`incoming connection from ${peerId}.`);
      const existing = this.peers.get(peerId);
      this.peers.set(peerId, conn);
      if (existing && existing !== conn) {
        this.debug(`replacing existing connection for ${peerId}.`);
        safeCloseConnection(existing);
      }
      this.peerStateHandler(peerId, "connecting");
      conn.on("open", () => {
        if (!this.isCurrentConnection(peerId, conn)) {
          return;
        }
        this.debug(`connection ${peerId} opened.`);
        this.peerStateHandler(peerId, "open");
      });
      conn.on("close", () => {
        if (!this.isCurrentConnection(peerId, conn)) {
          return;
        }
        this.debug(`connection ${peerId} closed.`);
        this.peers.delete(peerId);
        this.peerStateHandler(peerId, "closed");
      });
      conn.on("error", (error: unknown) => {
        if (!this.isCurrentConnection(peerId, conn)) {
          return;
        }
        this.debug(`connection ${peerId} error: ${describePeerJsError(error)}.`);
        this.peerStateHandler(peerId, "error");
      });
      conn.on("data", (raw: unknown) => {
        try {
          const parsed = parseMessage(String(raw));
          if (!this.isCurrentConnection(peerId, conn)) {
            return;
          }
          this.messageHandler(peerId, parsed);
        } catch (error) {
          this.rejectInvalidMessage(peerId, conn, error);
        }
      });
    });
    this.peer.on("error", (error: unknown) => {
      this.debug(`peer error: ${describePeerJsError(error)}.`);
    });
    this.peer.on("disconnected", () => {
      this.debug("peer disconnected from signaling server.");
    });
    this.peer.on("close", () => {
      this.debug("peer closed.");
    });
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

  onDebugLog(handler: (line: string) => void): void {
    this.debugLogHandler = handler;
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
  private debugLogHandler: (line: string) => void = () => {};

  private debug(line: string): void {
    this.debugLogHandler(`[PeerJS peer] ${line}`);
  }

  private rejectInvalidHostMessage(conn: DataConnectionLike, error: unknown): void {
    this.debug(`failed to parse message from host: ${describePeerJsError(error)}.`);
    if (this.conn === conn) {
      this.peerStateHandler(this.hostLogicalPeerId, "error");
    }
    safeCloseConnection(conn);
  }

  constructor(hostPeerId: PeerId, localPeerId?: string) {
    this.hostRemotePeerId = hostPeerId;
    const Peer = peerCtor();
    this.peer = new Peer(localPeerId);
    this.peer.on("open", (id: string) => {
      this.debug(`local peer opened as ${id}; connecting to host ${this.hostRemotePeerId}.`);
      this.readyHandler(id);
      this.openHostConnection();
    });
    this.peer.on("error", (error: unknown) => {
      this.debug(`peer error: ${describePeerJsError(error)}.`);
      if (this.conn && !this.conn.open && isPeerDialFailureForHost(error, this.hostRemotePeerId)) {
        this.peerStateHandler(this.hostLogicalPeerId, "error");
        safeCloseConnection(this.conn);
      }
    });
    this.peer.on("disconnected", () => {
      this.debug("peer disconnected from signaling server.");
    });
    this.peer.on("close", () => {
      this.debug("peer closed.");
    });
  }

  private openHostConnection(): void {
    this.debug(`creating data connection to host ${this.hostRemotePeerId}.`);
    if (this.conn) {
      safeCloseConnection(this.conn);
    }
    this.peerStateHandler(this.hostLogicalPeerId, "connecting");
    const conn = this.peer.connect(this.hostRemotePeerId, { reliable: true });
    this.conn = conn;
    conn.on("open", () => {
      if (this.conn !== conn) {
        return;
      }
      this.debug(`connection to host ${this.hostRemotePeerId} opened.`);
      this.peerStateHandler(this.hostLogicalPeerId, "open");
    });
    conn.on("close", () => {
      if (this.conn !== conn) {
        return;
      }
      this.debug(`connection to host ${this.hostRemotePeerId} closed.`);
      this.conn = undefined;
      this.peerStateHandler(this.hostLogicalPeerId, "closed");
    });
    conn.on("error", (error: unknown) => {
      if (this.conn !== conn) {
        return;
      }
      this.debug(`connection to host ${this.hostRemotePeerId} error: ${describePeerJsError(error)}.`);
      this.peerStateHandler(this.hostLogicalPeerId, "error");
    });
    conn.on("data", (raw: unknown) => {
      try {
        const parsed = parseMessage(String(raw));
        if (this.conn !== conn) {
          return;
        }
        this.messageHandler(this.hostLogicalPeerId, parsed);
      } catch (error) {
        this.rejectInvalidHostMessage(conn, error);
      }
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

  onDebugLog(handler: (line: string) => void): void {
    this.debugLogHandler = handler;
  }

  close(): void {
    this.conn?.close();
    this.peer.disconnect();
    this.peer.destroy();
  }
}
