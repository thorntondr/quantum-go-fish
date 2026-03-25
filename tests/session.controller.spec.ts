import test from "node:test";
import assert from "node:assert/strict";
import { createHostSession, createPeerSession } from "../src/app/sessionController.js";
import { buildMessage } from "../src/app/sessionProtocol.js";
import { stateHash } from "../src/app/hash.js";
import type { SessionTransport } from "../src/app/sessionTransport.js";
import type { PeerId, SessionMessage, SuitMeta } from "../src/app/sessionTypes.js";
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

test("Host session logs connection transitions and welcome handshake details", () => {
  const transport = new MockHostTransport();
  const logs: string[] = [];
  createHostSession(
    { setup: setupConfig2() },
    {
      onLog: (line) => logs.push(line)
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

  assert.ok(logs.some((line) => line.includes("Peer peer-1 connection state: missing -> open.")));
  assert.ok(logs.some((line) => line.includes("Received hello from Remote (peer-1) client=peer-client.")));
  assert.ok(logs.some((line) => line.includes("Sending welcome to Remote (peer-1) as player B.")));
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
    allOrNothing: false,
    inactivePlayers: [],
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
      hostClientId: "host-client",
      suitMeta: {},
      setup: setupConfig2()
    })
  );
  transport.emitFromHost(
    buildMessage("host-client", "start_game", {
      snapshot: startSnapshot,
      roster: [],
      suitMeta: {}
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

test("Peer session logs host connection transitions, hello, and join rejection", () => {
  const transport = new MockPeerTransport();
  const logs: string[] = [];
  const errors: string[] = [];
  createPeerSession(
    {
      onLog: (line) => logs.push(line),
      onSessionError: (message) => errors.push(message)
    },
    {
      transport,
      clientId: "peer-client",
      displayName: "Remote"
    }
  );

  transport.emitHostState("connecting");
  transport.emitHostState("open");
  transport.emitFromHost(
    buildMessage("host-client", "join_reject", {
      reason: "Room is full."
    })
  );

  assert.ok(logs.some((line) => line.includes("Peer view of host connection state: new -> connecting.")));
  assert.ok(logs.some((line) => line.includes("Peer view of host connection state: connecting -> open.")));
  assert.ok(logs.some((line) => line.includes("Sent hello to host as Remote (client=peer-client).")));
  assert.ok(logs.some((line) => line.includes("Received join_reject from host: Room is full.")));
  assert.deepEqual(errors, ["Room is full."]);
});

test("Peer session leaveGame still closes locally when host connection is already closed", () => {
  class ClosedHostTransport extends MockPeerTransport {
    closed = false;

    override send(_to: PeerId, _message: SessionMessage): void {
      throw new Error("Host connection is not open.");
    }

    override close(): void {
      this.closed = true;
    }
  }

  const transport = new ClosedHostTransport();
  const startedStates: boolean[] = [];
  const peer = createPeerSession(
    {
      onGameStarted: (started) => startedStates.push(started)
    },
    {
      transport,
      clientId: "peer-client",
      displayName: "Remote"
    }
  );

  peer.leaveGame();

  assert.equal(transport.closed, true);
  assert.equal(startedStates.at(-1), false);
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

test("Host session can apply waiting-room setup rules when the game starts", () => {
  const transport = new MockHostTransport();
  const host = createHostSession(
    { setup: setupConfigN(3) },
    {},
    {
      transport,
      clientId: "host-client",
      displayName: "Host"
    }
  );

  transport.emitPeerState("peer-1", "open");
  transport.emitFrom("peer-1", buildMessage("peer-client-1", "hello", { displayName: "Peer 1" }));

  host.startGame({
    ...setupConfigN(3),
    initialSuitMax: 3
  });

  assert.equal(host.getSnapshot().state.max.A.S1, 3);
});

test("Host session broadcasts waiting-room setup changes before the game starts", () => {
  const transport = new MockHostTransport();
  const host = createHostSession(
    { setup: setupConfigN(3) },
    {},
    {
      transport,
      clientId: "host-client",
      displayName: "Host"
    }
  );

  transport.emitPeerState("peer-1", "open");
  transport.emitFrom("peer-1", buildMessage("peer-client-1", "hello", { displayName: "Peer 1" }));

  host.updateSetup({
    ...setupConfigN(3),
    initialSuitMax: 3
  });

  const outbound = transport.messagesFor("peer-1");
  const update = [...outbound].reverse().find((message) => message.kind === "setup_update");
  assert.ok(update && update.kind === "setup_update");
  assert.equal(update.setup.initialSuitMax, 3);
});

test("Host session sends the current waiting-room setup to a newly joined peer", () => {
  const transport = new MockHostTransport();
  createHostSession(
    {
      setup: {
        ...setupConfigN(3),
        initialSuitMax: 3
      }
    },
    {},
    {
      transport,
      clientId: "host-client",
      displayName: "Host"
    }
  );

  transport.emitPeerState("peer-1", "open");
  transport.emitFrom("peer-1", buildMessage("peer-client-1", "hello", { displayName: "Peer 1" }));

  const outbound = transport.messagesFor("peer-1");
  const welcome = outbound.find((message) => message.kind === "welcome");
  assert.ok(welcome && welcome.kind === "welcome");
  assert.equal(welcome.setup.initialSuitMax, 3);
});

test("Host session broadcasts suit_meta when first named by a peer", () => {
  const transport = new MockHostTransport();
  createHostSession(
    { setup: setupConfig2() },
    {},
    {
      transport,
      clientId: "host-client",
      displayName: "Host"
    }
  );

  transport.emitPeerState("peer-1", "open");
  transport.emitPeerState("peer-2", "open");
  transport.emitFrom("peer-1", buildMessage("peer-client-1", "hello", { displayName: "Peer 1" }));
  transport.emitFrom("peer-2", buildMessage("peer-client-2", "hello", { displayName: "Peer 2" }));

  transport.emitFrom(
    "peer-1",
    buildMessage("peer-client-1", "suit_meta", {
      suitId: "S",
      meta: { name: "Stars", symbol: "⭐", color: "#f7d154" }
    })
  );

  const peer1Messages = transport.messagesFor("peer-1");
  const peer2Messages = transport.messagesFor("peer-2");
  const peer1Named = peer1Messages.some((m) => m.kind === "suit_meta" && m.suitId === "S");
  const peer2Named = peer2Messages.some((m) => m.kind === "suit_meta" && m.suitId === "S");
  assert.equal(peer1Named, true);
  assert.equal(peer2Named, true);
});

test("Peer session applies suit meta from welcome and suit_meta messages", () => {
  const transport = new MockPeerTransport();
  const updates: Record<string, SuitMeta>[] = [];
  createPeerSession(
    {
      onSuitMetaChanged: (meta) => updates.push(meta)
    },
    {
      transport,
      clientId: "peer-client",
      displayName: "Remote"
    }
  );

  transport.emitHostState("open");
  transport.emitFromHost(
    buildMessage("host-client", "welcome", {
      assignedPlayerId: "B",
      roster: [],
      hostClientId: "host-client",
      suitMeta: { S: { name: "Stars" } },
      setup: setupConfig2()
    })
  );

  transport.emitFromHost(
    buildMessage("host-client", "suit_meta", {
      suitId: "H",
      meta: { name: "Hearts", symbol: "♥", color: "#b32b2b" }
    })
  );

  const latest = updates[updates.length - 1] ?? {};
  assert.deepEqual(latest, {
    S: { name: "Stars" },
    H: { name: "Hearts", symbol: "♥", color: "#b32b2b" }
  });
});

test("Host session ignores attempts to change an already-named suit", () => {
  const transport = new MockHostTransport();
  createHostSession(
    { setup: setupConfig2() },
    {},
    {
      transport,
      clientId: "host-client",
      displayName: "Host"
    }
  );

  transport.emitPeerState("peer-1", "open");
  transport.emitPeerState("peer-2", "open");
  transport.emitFrom("peer-1", buildMessage("peer-client-1", "hello", { displayName: "Peer 1" }));
  transport.emitFrom("peer-2", buildMessage("peer-client-2", "hello", { displayName: "Peer 2" }));

  transport.emitFrom(
    "peer-1",
    buildMessage("peer-client-1", "suit_meta", {
      suitId: "S",
      meta: { name: "Stars" }
    })
  );
  transport.emitFrom(
    "peer-2",
    buildMessage("peer-client-2", "suit_meta", {
      suitId: "S",
      meta: { name: "Spades" }
    })
  );

  const peer2Messages = transport.messagesFor("peer-2");
  const suitMeta = peer2Messages.filter((m) => m.kind === "suit_meta" && m.suitId === "S");
  assert.equal(suitMeta.length, 2);
  const last = suitMeta[suitMeta.length - 1];
  assert.ok(last && last.kind === "suit_meta");
  assert.equal(last.meta.name, "Stars");
});

test("Host session marks a leaving player inactive and rejects reclaiming that seat", () => {
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

  transport.emitFrom("peer-1", buildMessage("peer-client", "leave_game", {}));

  assert.deepEqual(host.getSnapshot().state.inactivePlayers, ["B"]);
  assert.equal(host.getConnections().find((row) => row.peerId === "peer-1")?.status, "inactive");
  assert.equal(transport.messagesFor("peer-1").some((m) => m.kind === "peer_left"), true);

  transport.emitPeerState("peer-2", "open");
  transport.emitFrom("peer-2", buildMessage("peer-client", "hello", { displayName: "Remote Rejoin" }));

  const rejoinMessages = transport.messagesFor("peer-2");
  const reject = rejoinMessages.find((m) => m.kind === "join_reject");
  assert.ok(reject && reject.kind === "join_reject");
  assert.equal(reject.reason, "No available player slots to join.");
});

test("Disconnecting an answer target reserves the seat and preserves the pending ask", () => {
  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
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
    host.submitMove({ kind: "Ask", asker: "A", target: "B", suit: "S" });

    transport.emitPeerState("peer-1", "closed");

    const pending = host.getSnapshot().state.turnState.pendingAsk;
    assert.ok(pending);
    assert.equal(pending.asker, "A");
    assert.equal(pending.target, "B");
    assert.deepEqual(host.getSnapshot().state.inactivePlayers, []);
    assert.equal(host.getConnections().find((row) => row.peerId === "peer-1")?.status, "reserved");

    const claims = host.getSeatClaims();
    assert.equal(claims.length, 1);
    assert.equal(claims[0]?.playerId, "B");
    assert.equal(transport.messagesFor("peer-1").some((m) => m.kind === "peer_left"), true);
  } finally {
    Math.random = originalRandom;
  }
});

test("Reconnect within the claim window restores the same player seat and sends game state", () => {
  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
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
    host.submitMove({ kind: "Ask", asker: "A", target: "B", suit: "S" });
    transport.emitPeerState("peer-1", "closed");

    transport.emitPeerState("peer-2", "open");
    transport.emitFrom("peer-2", buildMessage("peer-client", "hello", { displayName: "Remote Rejoin" }));

    assert.equal(host.getSeatClaims().length, 0);
    assert.equal(host.getConnections().some((row) => row.peerId === "peer-1"), false);
    const rejoined = host.getConnections().find((row) => row.peerId === "peer-2");
    assert.ok(rejoined);
    assert.equal(rejoined.playerId, "B");

    const rejoinMessages = transport.messagesFor("peer-2");
    const welcome = rejoinMessages.find((m) => m.kind === "welcome");
    const startGame = rejoinMessages.find((m) => m.kind === "start_game");
    assert.ok(welcome && welcome.kind === "welcome");
    assert.equal(welcome.assignedPlayerId, "B");
    assert.ok(startGame && startGame.kind === "start_game");
    assert.equal(startGame.snapshot.sessionSeq, host.getSnapshot().sessionSeq);
  } finally {
    Math.random = originalRandom;
  }
});

test("Expired claim for the current player marks them inactive and advances the turn", () => {
  const originalRandom = Math.random;
  const originalNow = Date.now;
  let now = 10_000;
  Math.random = () => 0.34;
  Date.now = () => now;

  try {
    const transport = new MockHostTransport();
    const host = createHostSession(
      { setup: setupConfigN(3) },
      {},
      {
        transport,
        clientId: "host-client",
        displayName: "Host"
      }
    );

    transport.emitPeerState("peer-1", "open");
    transport.emitFrom("peer-1", buildMessage("peer-client-1", "hello", { displayName: "Peer 1" }));
    transport.emitPeerState("peer-2", "open");
    transport.emitFrom("peer-2", buildMessage("peer-client-2", "hello", { displayName: "Peer 2" }));
    host.startGame();

    assert.equal(host.getSnapshot().state.turnState.currentPlayer, "B");
    transport.emitPeerState("peer-1", "closed");

    now += 2 * 60 * 1000 + 1;
    transport.emitFrom("peer-2", buildMessage("peer-client-2", "ping", { nonce: "n-1" }));

    assert.deepEqual(host.getSnapshot().state.inactivePlayers, ["B"]);
    assert.equal(host.getSnapshot().state.turnState.currentPlayer, "C");
    assert.equal(host.getConnections().find((row) => row.peerId === "peer-1")?.status, "inactive");
  } finally {
    Math.random = originalRandom;
    Date.now = originalNow;
  }
});

test("Expired claim for a pending ask target clears the ask and advances to the next active player", () => {
  const originalRandom = Math.random;
  const originalNow = Date.now;
  let now = 20_000;
  Math.random = () => 0;
  Date.now = () => now;

  try {
    const transport = new MockHostTransport();
    const host = createHostSession(
      { setup: setupConfigN(3) },
      {},
      {
        transport,
        clientId: "host-client",
        displayName: "Host"
      }
    );

    transport.emitPeerState("peer-1", "open");
    transport.emitFrom("peer-1", buildMessage("peer-client-1", "hello", { displayName: "Peer 1" }));
    transport.emitPeerState("peer-2", "open");
    transport.emitFrom("peer-2", buildMessage("peer-client-2", "hello", { displayName: "Peer 2" }));
    host.startGame();
    host.submitMove({ kind: "Ask", asker: "A", target: "B", suit: "S1" });
    transport.emitPeerState("peer-1", "closed");

    now += 2 * 60 * 1000 + 1;
    transport.emitFrom("peer-2", buildMessage("peer-client-2", "ping", { nonce: "n-2" }));

    assert.equal(host.getSnapshot().state.turnState.pendingAsk, undefined);
    assert.equal(host.getSnapshot().state.turnState.currentPlayer, "C");
    assert.deepEqual(host.getSnapshot().state.inactivePlayers, ["B"]);
  } finally {
    Math.random = originalRandom;
    Date.now = originalNow;
  }
});

test("Expired claim for a pending ask asker clears the ask and advances to the next active player", () => {
  const originalRandom = Math.random;
  const originalNow = Date.now;
  let now = 30_000;
  Math.random = () => 0.34;
  Date.now = () => now;

  try {
    const transport = new MockHostTransport();
    const host = createHostSession(
      { setup: setupConfigN(3) },
      {},
      {
        transport,
        clientId: "host-client",
        displayName: "Host"
      }
    );

    transport.emitPeerState("peer-1", "open");
    transport.emitFrom("peer-1", buildMessage("peer-client-1", "hello", { displayName: "Peer 1" }));
    transport.emitPeerState("peer-2", "open");
    transport.emitFrom("peer-2", buildMessage("peer-client-2", "hello", { displayName: "Peer 2" }));
    host.startGame();

    transport.emitFrom(
      "peer-1",
      buildMessage("peer-client-1", "move_request", {
        move: { kind: "Ask", asker: "B", target: "A", suit: "S1" },
        knownSeq: host.getSnapshot().sessionSeq,
        knownHash: host.getSnapshot().stateHash
      })
    );
    transport.emitPeerState("peer-1", "closed");

    now += 2 * 60 * 1000 + 1;
    transport.emitFrom("peer-2", buildMessage("peer-client-2", "ping", { nonce: "n-3" }));

    assert.equal(host.getSnapshot().state.turnState.pendingAsk, undefined);
    assert.equal(host.getSnapshot().state.turnState.currentPlayer, "C");
    assert.deepEqual(host.getSnapshot().state.inactivePlayers, ["B"]);
  } finally {
    Math.random = originalRandom;
    Date.now = originalNow;
  }
});

test("Restart game clears suit metadata and reserved reconnect claims and rebuilds from open players only", () => {
  const originalRandom = Math.random;
  const originalNow = Date.now;
  let now = 40_000;
  Math.random = () => 0;
  Date.now = () => now;

  try {
    const transport = new MockHostTransport();
    const host = createHostSession(
      { setup: setupConfigN(3) },
      {},
      {
        transport,
        clientId: "host-client",
        displayName: "Host"
      }
    );

    transport.emitPeerState("peer-1", "open");
    transport.emitFrom("peer-1", buildMessage("peer-client-1", "hello", { displayName: "Peer 1" }));
    transport.emitPeerState("peer-2", "open");
    transport.emitFrom("peer-2", buildMessage("peer-client-2", "hello", { displayName: "Peer 2" }));
    host.startGame();
    host.setSuitMeta("S1", { name: "Stars" });
    transport.emitPeerState("peer-2", "closed");

    host.restartGame();

    assert.deepEqual(host.getSeatClaims(), []);
    assert.deepEqual(host.getSuitMeta(), {});
    assert.deepEqual(host.getSnapshot().state.players, ["A", "B"]);
  } finally {
    Math.random = originalRandom;
    Date.now = originalNow;
  }
});
