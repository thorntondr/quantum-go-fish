import test from "node:test";
import assert from "node:assert/strict";
import { createHostSession, createPeerSession } from "../src/app/sessionController.js";
import { buildMessage } from "../src/app/sessionProtocol.js";
import { stateHash } from "../src/app/hash.js";
import type { SessionTransport } from "../src/app/sessionTransport.js";
import type { PeerId, SessionMessage } from "../src/app/sessionTypes.js";
import type { SetupConfig } from "../src/engine/types.js";

class MockHostTransport implements SessionTransport {
  private onMessageHandler: (from: PeerId, message: SessionMessage) => void = () => {};
  private onPeerStateHandler: (
    peerId: PeerId,
    status: "new" | "connecting" | "open" | "closed" | "error"
  ) => void = () => {};

  readonly sent = new Map<PeerId, SessionMessage[]>();
  readonly peers = new Set<PeerId>();

  send(to: PeerId, message: SessionMessage): void {
    const current = this.sent.get(to) ?? [];
    current.push(message);
    this.sent.set(to, current);
  }

  broadcast(message: SessionMessage): void {
    for (const peer of this.peers) {
      this.send(peer, message);
    }
  }

  listPeers(): PeerId[] {
    return [...this.peers];
  }

  onMessage(handler: (from: PeerId, message: SessionMessage) => void): void {
    this.onMessageHandler = handler;
  }

  onPeerState(
    handler: (peerId: PeerId, status: "new" | "connecting" | "open" | "closed" | "error") => void
  ): void {
    this.onPeerStateHandler = handler;
  }

  close(): void {}

  emitPeerState(peer: PeerId, status: "new" | "connecting" | "open" | "closed" | "error"): void {
    this.peers.add(peer);
    this.onPeerStateHandler(peer, status);
  }

  emitFrom(peer: PeerId, message: SessionMessage): void {
    this.peers.add(peer);
    this.onMessageHandler(peer, message);
  }

  messagesFor(peer: PeerId): SessionMessage[] {
    return this.sent.get(peer) ?? [];
  }
}

class MockPeerTransport implements SessionTransport {
  private onMessageHandler: (from: PeerId, message: SessionMessage) => void = () => {};
  private onPeerStateHandler: (
    peerId: PeerId,
    status: "new" | "connecting" | "open" | "closed" | "error"
  ) => void = () => {};

  readonly sentToHost: SessionMessage[] = [];

  send(_to: PeerId, message: SessionMessage): void {
    this.sentToHost.push(message);
  }

  broadcast(message: SessionMessage): void {
    this.send("host", message);
  }

  listPeers(): PeerId[] {
    return ["host"];
  }

  onMessage(handler: (from: PeerId, message: SessionMessage) => void): void {
    this.onMessageHandler = handler;
  }

  onPeerState(
    handler: (peerId: PeerId, status: "new" | "connecting" | "open" | "closed" | "error") => void
  ): void {
    this.onPeerStateHandler = handler;
  }

  close(): void {}

  emitFromHost(message: SessionMessage): void {
    this.onMessageHandler("host", message);
  }

  emitHostState(status: "new" | "connecting" | "open" | "closed" | "error"): void {
    this.onPeerStateHandler("host", status);
  }
}

function setupConfig2(): SetupConfig {
  return setupConfigN(2);
}

function setupConfigN(count: number): SetupConfig {
  const players = Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
  const suits =
    count === 2 ? ["S", "H"] : Array.from({ length: count }, (_, i) => `S${i + 1}`);
  const suitTotals: Record<string, number> = {};
  const handSizes: Record<string, number> = {};
  for (const suit of suits) {
    suitTotals[suit] = 4;
  }
  for (const player of players) {
    handSizes[player] = 4;
  }
  return {
    players,
    suits,
    suitTotals,
    handSizes,
    startingPlayer: players[0]
  };
}

test("Host session accepts legal move_request and broadcasts state_commit", () => {
  const originalRandom = Math.random;
  Math.random = () => 0.9;

  try {
    const transport = new MockHostTransport();
    const errors: string[] = [];
    const host = createHostSession(
      { setup: setupConfig2() },
      {
        onMoveError: (m) => errors.push(m),
        onSessionError: (m) => errors.push(m)
      },
      {
        transport,
        clientId: "host-client",
        displayName: "Host"
      }
    );

    transport.emitPeerState("peer-1", "open");
    transport.emitFrom(
      "peer-1",
      buildMessage("peer-client", "hello", {
        displayName: "Remote"
      })
    );
    host.startGame();

    const snapshot = host.getSnapshot().state;
    const asker = snapshot.turnState.currentPlayer;
    const target = snapshot.players.find((player) => player !== asker) ?? snapshot.players[0];
    const suit = snapshot.suits[0];
    transport.emitFrom(
      "peer-1",
      buildMessage("peer-client", "move_request", {
        move: { kind: "Ask", asker, target, suit },
        knownSeq: host.getSnapshot().sessionSeq,
        knownHash: host.getSnapshot().stateHash
      })
    );

    assert.equal(errors.length, 0);
    assert.equal(host.getSnapshot().sessionSeq, 1);
    const outbound = transport.messagesFor("peer-1");
    const hasCommit = outbound.some((m) => m.kind === "state_commit" && m.snapshot.sessionSeq === 1);
    assert.equal(hasCommit, true);
  } finally {
    Math.random = originalRandom;
  }
});

test("Host session rejects illegal move_request without mutating state", () => {
  const transport = new MockHostTransport();
  const host = createHostSession(
    { setup: setupConfig2() },
    {},
    {
      transport,
      clientId: "host-client",
      displayName: "Host"
    }
  );

  transport.emitPeerState("peer-1", "open");
  transport.emitFrom("peer-1", buildMessage("peer-client", "hello", { displayName: "Remote" }));
  host.startGame();

  const beforeSeq = host.getSnapshot().sessionSeq;
  const beforeHash = host.getSnapshot().stateHash;
  const snapshot = host.getSnapshot().state;
  const currentPlayer = snapshot.turnState.currentPlayer;
  const illegalAsker = snapshot.players.find((player) => player !== currentPlayer);
  assert.ok(illegalAsker, "Expected a second player to build an illegal ask.");
  const target = currentPlayer;
  const suit = snapshot.suits[0];

  transport.emitFrom(
    "peer-1",
    buildMessage("peer-client", "move_request", {
      move: { kind: "Ask", asker: illegalAsker, target, suit },
      knownSeq: beforeSeq,
      knownHash: beforeHash
    })
  );

  assert.equal(host.getSnapshot().sessionSeq, beforeSeq);
  assert.equal(host.getSnapshot().stateHash, beforeHash);
  const outbound = transport.messagesFor("peer-1");
  const hasReject = outbound.some((m) => m.kind === "move_reject");
  assert.equal(hasReject, true);
});

test("Peer session requests sync on commit sequence gap", () => {
  const transport = new MockPeerTransport();
  createPeerSession(
    {},
    {
      transport,
      clientId: "peer-client",
      displayName: "Remote"
    }
  );

  transport.emitHostState("open");

  const initialState = {
    players: ["A", "B"],
    suits: ["S", "H"],
    suitTotals: { S: 4, H: 4 },
    handSizes: { A: 4, B: 4 },
    min: { A: { S: 0, H: 0 }, B: { S: 0, H: 0 } },
    max: { A: { S: 4, H: 4 }, B: { S: 4, H: 4 } },
    turnState: { phase: "Idle" as const, currentPlayer: "A" },
    version: 1
  };
  const startSnapshot = {
    state: initialState,
    stateHash: stateHash(initialState),
    sessionSeq: 0
  };

  transport.emitFromHost(
    buildMessage("host-client", "welcome", {
      assignedPlayerId: "B",
      roster: [],
      hostClientId: "host-client"
    })
  );
  transport.emitFromHost(
    buildMessage("host-client", "start_game", {
      snapshot: startSnapshot,
      roster: []
    })
  );
  transport.emitFromHost(
    buildMessage("host-client", "state_commit", {
      acceptedMove: { kind: "Ask", asker: "A", target: "B", suit: "S" },
      snapshot: {
        ...startSnapshot,
        sessionSeq: 2
      }
    })
  );

  const hasSyncRequest = transport.sentToHost.some((m) => m.kind === "sync_request");
  assert.equal(hasSyncRequest, true);
});

test("Host session supports starting with 13 connected players", () => {
  const transport = new MockHostTransport();
  const errors: string[] = [];
  const host = createHostSession(
    { setup: setupConfigN(13) },
    {
      onSessionError: (m) => errors.push(m)
    },
    {
      transport,
      clientId: "host-client",
      displayName: "Host"
    }
  );

  for (let i = 1; i <= 12; i += 1) {
    const peerId = `peer-${i}`;
    transport.emitPeerState(peerId, "open");
    transport.emitFrom(
      peerId,
      buildMessage(`peer-client-${i}`, "hello", {
        displayName: `Peer ${i}`
      })
    );
  }

  host.startGame();

  assert.equal(errors.length, 0);
  assert.equal(host.getSnapshot().state.players.length, 13);
});
