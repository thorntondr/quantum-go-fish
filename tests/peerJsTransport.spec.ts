import test from "node:test";
import assert from "node:assert/strict";
import { HostPeerJsTransport, PeerPeerJsTransport } from "../src/app/peerJsTransport.js";
import { buildMessage } from "../src/app/sessionProtocol.js";
import type { SessionMessage } from "../src/app/sessionTypes.js";

type PeerStatus = "new" | "connecting" | "open" | "closed" | "error";

class FakeDataConnection {
  peer: string;
  open = false;
  closed = false;
  readonly sent: string[] = [];
  private readonly handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  constructor(peer: string) {
    this.peer = peer;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    const current = this.handlers.get(event) ?? [];
    current.push(handler);
    this.handlers.set(event, current);
  }

  emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args);
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.open = false;
    this.emit("close");
  }
}

class FakePeer {
  static instances: FakePeer[] = [];

  id?: string;
  nextConnection?: FakeDataConnection;
  disconnected = false;
  destroyed = false;
  private readonly handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  constructor(id?: string) {
    this.id = id;
    FakePeer.instances.push(this);
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    const current = this.handlers.get(event) ?? [];
    current.push(handler);
    this.handlers.set(event, current);
  }

  emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args);
    }
  }

  connect(peerId: string): FakeDataConnection {
    const conn = this.nextConnection ?? new FakeDataConnection(peerId);
    this.nextConnection = undefined;
    return conn;
  }

  disconnect(): void {
    this.disconnected = true;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

function withFakePeer(testBody: () => void): void {
  const originalPeer = (globalThis as { Peer?: typeof FakePeer }).Peer;
  FakePeer.instances.length = 0;
  (globalThis as { Peer?: typeof FakePeer }).Peer = FakePeer;
  try {
    testBody();
  } finally {
    if (originalPeer) {
      (globalThis as { Peer?: typeof FakePeer }).Peer = originalPeer;
    } else {
      delete (globalThis as { Peer?: typeof FakePeer }).Peer;
    }
    FakePeer.instances.length = 0;
  }
}

function samplePing(): SessionMessage {
  return buildMessage("client-a", "ping", { nonce: "nonce-1" });
}

test("Host PeerJS transport drops malformed peer messages without throwing", () => {
  withFakePeer(() => {
    const transport = new HostPeerJsTransport("host-local");
    const states: Array<{ peerId: string; status: PeerStatus }> = [];
    const seen: SessionMessage[] = [];
    transport.onPeerState((peerId, status) => states.push({ peerId, status }));
    transport.onMessage((_from, message) => seen.push(message));

    const peer = FakePeer.instances[0];
    const conn = new FakeDataConnection("peer-1");
    peer.emit("connection", conn);
    conn.open = true;
    conn.emit("open");

    assert.doesNotThrow(() => conn.emit("data", "{not-json"));
    assert.equal(conn.closed, true);
    assert.deepEqual(seen, []);
    assert.deepEqual(
      states.map((entry) => `${entry.peerId}:${entry.status}`),
      ["peer-1:connecting", "peer-1:open", "peer-1:error", "peer-1:closed"]
    );
    assert.deepEqual(transport.listPeers(), []);
  });
});

test("Host PeerJS transport ignores stale close events after a reconnect replaces the socket", () => {
  withFakePeer(() => {
    const transport = new HostPeerJsTransport("host-local");
    const peer = FakePeer.instances[0];
    const conn1 = new FakeDataConnection("peer-1");
    const conn2 = new FakeDataConnection("peer-1");

    peer.emit("connection", conn1);
    conn1.open = true;
    conn1.emit("open");

    peer.emit("connection", conn2);
    conn2.open = true;
    conn2.emit("open");

    conn1.close();

    assert.deepEqual(transport.listPeers(), ["peer-1"]);
    assert.doesNotThrow(() => transport.send("peer-1", samplePing()));
    assert.equal(conn1.sent.length, 0);
    assert.equal(conn2.sent.length, 1);
  });
});

test("Peer PeerJS transport does not report local PeerJS client failures as host failures", () => {
  withFakePeer(() => {
    const transport = new PeerPeerJsTransport("room-abc", "peer-local");
    const states: Array<{ peerId: string; status: PeerStatus }> = [];
    transport.onPeerState((peerId, status) => states.push({ peerId, status }));

    const peer = FakePeer.instances[0];
    const conn = new FakeDataConnection("room-abc");
    peer.nextConnection = conn;

    peer.emit("open", "peer-local");
    peer.emit("error", new Error("local peer failure"));
    peer.emit("disconnected");
    peer.emit("close");

    assert.deepEqual(
      states.map((entry) => `${entry.peerId}:${entry.status}`),
      ["host:connecting"]
    );

    conn.open = true;
    conn.emit("open");

    assert.deepEqual(
      states.map((entry) => `${entry.peerId}:${entry.status}`),
      ["host:connecting", "host:open"]
    );
  });
});

test("Peer PeerJS transport reports host dial failure when PeerJS cannot connect to the requested room", () => {
  withFakePeer(() => {
    const transport = new PeerPeerJsTransport("room-abc", "peer-local");
    const states: Array<{ peerId: string; status: PeerStatus }> = [];
    transport.onPeerState((peerId, status) => states.push({ peerId, status }));

    const peer = FakePeer.instances[0];
    const conn = new FakeDataConnection("room-abc");
    peer.nextConnection = conn;

    peer.emit("open", "peer-local");
    peer.emit("error", new Error("Could not connect to peer room-abc."));

    assert.equal(conn.closed, true);
    assert.deepEqual(
      states.map((entry) => `${entry.peerId}:${entry.status}`),
      ["host:connecting", "host:error", "host:closed"]
    );
  });
});

test("Peer PeerJS transport closes the host connection after malformed data without throwing", () => {
  withFakePeer(() => {
    const transport = new PeerPeerJsTransport("room-abc", "peer-local");
    const states: Array<{ peerId: string; status: PeerStatus }> = [];
    const seen: SessionMessage[] = [];
    transport.onPeerState((peerId, status) => states.push({ peerId, status }));
    transport.onMessage((_from, message) => seen.push(message));

    const peer = FakePeer.instances[0];
    const conn = new FakeDataConnection("room-abc");
    peer.nextConnection = conn;

    peer.emit("open", "peer-local");
    conn.open = true;
    conn.emit("open");

    assert.doesNotThrow(() => conn.emit("data", "not-json"));
    assert.equal(conn.closed, true);
    assert.deepEqual(seen, []);
    assert.deepEqual(
      states.map((entry) => `${entry.peerId}:${entry.status}`),
      ["host:connecting", "host:open", "host:error", "host:closed"]
    );
  });
});
