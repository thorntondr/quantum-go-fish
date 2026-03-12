import { applyMove } from "../engine/moves.js";
import { createInitialState } from "../engine/state.js";
import type { GameState, Move, SetupConfig } from "../engine/types.js";
import { isLegalMove } from "../engine/rules.js";
import { stateHash } from "./hash.js";
import { buildMessage, makeClientId } from "./sessionProtocol.js";
import type {
  ClientId,
  ConnectionState,
  PeerId,
  RoomConfig,
  SessionMessage,
  SessionSnapshot,
  SessionUiHooks
} from "./sessionTypes.js";
import type { SessionTransport } from "./sessionTransport.js";

type PeerStatus = "new" | "connecting" | "open" | "closed" | "error";

interface SessionDeps {
  transport: SessionTransport;
  clientId?: ClientId;
  initialState?: GameState;
}

export interface HostSession {
  submitMove: (move: Move) => void;
  startGame: () => void;
  requestSync: (peerId?: PeerId) => void;
  close: () => void;
  getSnapshot: () => SessionSnapshot;
  getConnections: () => ConnectionState[];
}

export interface PeerSession {
  submitMove: (move: Move) => void;
  requestSync: () => void;
  close: () => void;
  getSnapshot: () => SessionSnapshot | undefined;
  getConnections: () => ConnectionState[];
}

function defaultHooks(): SessionUiHooks {
  return {
    onLog: () => {},
    onSessionError: () => {},
    onMoveError: () => {},
    onConnectionsChanged: () => {},
    onSnapshot: () => {},
    onAssignedPlayer: () => {},
    onGameStarted: () => {}
  };
}

function connectionSort(a: ConnectionState, b: ConnectionState): number {
  return a.peerId.localeCompare(b.peerId);
}

function rosterFromMap(map: Map<PeerId, ConnectionState>): ConnectionState[] {
  return [...map.values()].sort(connectionSort);
}

function snapshotFromState(state: GameState, sessionSeq: number): SessionSnapshot {
  return {
    state,
    stateHash: stateHash(state),
    sessionSeq
  };
}

function validateSnapshot(snapshot: SessionSnapshot): string | undefined {
  const computed = stateHash(snapshot.state);
  if (computed !== snapshot.stateHash) {
    return `Snapshot hash mismatch: computed=${computed}, provided=${snapshot.stateHash}.`;
  }
  return undefined;
}

export function createHostSession(
  config: RoomConfig,
  uiHooks: Partial<SessionUiHooks>,
  deps: SessionDeps & { displayName: string }
): HostSession {
  const hooks = { ...defaultHooks(), ...uiHooks };
  const clientId = deps.clientId ?? makeClientId();
  const transport = deps.transport;
  const hostLabel = deps.displayName.trim() || "Host";

  const hostPlayerId = config.setup.players[0];
  const baseState =
    deps.initialState ??
    createInitialState(
      buildSetupForPlayers(config.setup, [hostPlayerId])
    );
  let sessionSeq = 0;
  let snapshot = snapshotFromState(baseState, sessionSeq);
  let started = false;

  const connections = new Map<PeerId, ConnectionState>([
    [
      "self",
      {
        peerId: "self",
        clientId,
        playerId: hostPlayerId,
        status: "open",
        label: hostLabel
      }
    ]
  ]);
  const peerByClient = new Map<ClientId, PeerId>();
  const assignedByPeer = new Map<PeerId, string>();

  function activeAssignedPlayers(): string[] {
    const active = new Set<string>([hostPlayerId]);
    for (const row of connections.values()) {
      if (row.peerId === "self") {
        continue;
      }
      if (row.status === "open" && row.playerId) {
        active.add(row.playerId);
      }
    }
    return config.setup.players.filter((playerId) => active.has(playerId));
  }

  function buildSetupForPlayers(template: SetupConfig, players: string[]): SetupConfig {
    const startingPlayer = players[0];
    return buildSetupWithStartingPlayer(template, players, startingPlayer);
  }

  function buildSetupWithStartingPlayer(
    template: SetupConfig,
    players: string[],
    startingPlayer: string
  ): SetupConfig {
    const suits = template.suits.slice(0, players.length);
    const suitTotals: Record<string, number> = {};
    const handSizes: Record<string, number> = {};

    for (const suit of suits) {
      suitTotals[suit] = template.suitTotals[suit] ?? 4;
    }
    for (const player of players) {
      handSizes[player] = template.handSizes[player] ?? 4;
    }

    return {
      players,
      suits,
      suitTotals,
      handSizes,
      startingPlayer,
      version: template.version
    };
  }

  function randomStartingPlayer(players: string[]): string {
    const index = Math.floor(Math.random() * players.length);
    return players[index] ?? players[0];
  }

  function refreshSnapshotForRoster(reason: string): void {
    if (started) {
      return;
    }
    const players = activeAssignedPlayers();
    if (players.length === 0) {
      return;
    }
    sessionSeq = 0;
    const startingPlayer = reason === "start_game" ? randomStartingPlayer(players) : players[0];
    snapshot = snapshotFromState(
      createInitialState(buildSetupWithStartingPlayer(config.setup, players, startingPlayer)),
      sessionSeq
    );
    hooks.onSnapshot(snapshot);
    hooks.onLog(`Updated pregame setup for ${players.length} player(s) (${reason}).`);
  }

  function updateConnections(): void {
    hooks.onConnectionsChanged(rosterFromMap(connections));
  }

  function broadcastRosterJoined(peer: ConnectionState): void {
    transport.broadcast(
      buildMessage(clientId, "peer_joined", {
        peer,
        roster: rosterFromMap(connections)
      })
    );
  }

  function broadcastRosterLeft(peerId: PeerId): void {
    transport.broadcast(
      buildMessage(clientId, "peer_left", {
        peerId,
        roster: rosterFromMap(connections)
      })
    );
  }

  function nextAssignablePlayer(): string | undefined {
    const unavailable = new Set<string>([hostPlayerId]);
    for (const playerId of assignedByPeer.values()) {
      unavailable.add(playerId);
    }
    for (const playerId of config.setup.players) {
      if (!unavailable.has(playerId)) {
        return playerId;
      }
    }
    return undefined;
  }

  function commitMove(move: Move): void {
    const legality = isLegalMove(snapshot.state, move);
    if (!legality.ok) {
      hooks.onMoveError(legality.reason);
      return;
    }
    const nextState = applyMove(snapshot.state, move);
    sessionSeq += 1;
    snapshot = snapshotFromState(nextState, sessionSeq);
    hooks.onSnapshot(snapshot);
    hooks.onLog(`Committed move #${sessionSeq}: ${move.kind}`);
    transport.broadcast(
      buildMessage(clientId, "state_commit", {
        acceptedMove: move,
        snapshot
      })
    );
  }

  transport.onPeerState((peerId, status) => {
    if (peerId === "self") {
      return;
    }
    const existing = connections.get(peerId);
    const next: ConnectionState = {
      peerId,
      clientId: existing?.clientId,
      playerId: existing?.playerId,
      status,
      label: existing?.label ?? peerId
    };
    connections.set(peerId, next);
    updateConnections();

    if ((status === "closed" || status === "error") && existing?.clientId) {
      assignedByPeer.delete(peerId);
      peerByClient.delete(existing.clientId);
      broadcastRosterLeft(peerId);
      refreshSnapshotForRoster("peer_left");
    }
  });

  transport.onMessage((fromPeerId, message) => {
    if (message.kind === "hello") {
      const assignedPlayerId = assignedByPeer.get(fromPeerId) ?? nextAssignablePlayer();
      const current = connections.get(fromPeerId) ?? {
        peerId: fromPeerId,
        status: "new",
        label: fromPeerId
      };
      const updated: ConnectionState = {
        ...current,
        clientId: message.fromClientId,
        playerId: assignedPlayerId,
        label: message.displayName || fromPeerId
      };
      connections.set(fromPeerId, updated);
      peerByClient.set(message.fromClientId, fromPeerId);
      if (assignedPlayerId) {
        assignedByPeer.set(fromPeerId, assignedPlayerId);
      } else {
        hooks.onSessionError("No player slots available for joining peer.");
        return;
      }
      updateConnections();
      refreshSnapshotForRoster("peer_joined");

      transport.send(
        fromPeerId,
        buildMessage(clientId, "welcome", {
          assignedPlayerId,
          roster: rosterFromMap(connections),
          hostClientId: clientId
        })
      );
      broadcastRosterJoined(updated);
      hooks.onLog(`Peer hello accepted from ${updated.label} (${fromPeerId}).`);
      return;
    }

    if (message.kind === "move_request") {
      const connection = connections.get(fromPeerId);
      const expectedPlayer = connection?.playerId;
      if (!expectedPlayer) {
        transport.send(
          fromPeerId,
          buildMessage(clientId, "move_reject", {
            reason: "Peer is not assigned to a player.",
            expectedSeq: snapshot.sessionSeq,
            expectedHash: snapshot.stateHash
          })
        );
        return;
      }
      if (message.knownSeq !== snapshot.sessionSeq || message.knownHash !== snapshot.stateHash) {
        transport.send(
          fromPeerId,
          buildMessage(clientId, "move_reject", {
            reason: "Peer out of sync. Requesting snapshot.",
            expectedSeq: snapshot.sessionSeq,
            expectedHash: snapshot.stateHash
          })
        );
        transport.send(
          fromPeerId,
          buildMessage(clientId, "sync_response", {
            snapshot,
            reason: "move_request_out_of_sync"
          })
        );
        return;
      }
      const actor = message.move.kind === "Ask" ? message.move.asker : message.move.target;
      if (actor !== expectedPlayer) {
        transport.send(
          fromPeerId,
          buildMessage(clientId, "move_reject", {
            reason: `Move actor ${actor} does not match assigned player ${expectedPlayer}.`,
            expectedSeq: snapshot.sessionSeq,
            expectedHash: snapshot.stateHash
          })
        );
        return;
      }

      const legality = isLegalMove(snapshot.state, message.move);
      if (!legality.ok) {
        transport.send(
          fromPeerId,
          buildMessage(clientId, "move_reject", {
            reason: legality.reason,
            expectedSeq: snapshot.sessionSeq,
            expectedHash: snapshot.stateHash
          })
        );
        return;
      }
      commitMove(message.move);
      return;
    }

    if (message.kind === "sync_request") {
      transport.send(
        fromPeerId,
        buildMessage(clientId, "sync_response", {
          snapshot,
          reason: "peer_requested_sync"
        })
      );
      return;
    }

    if (message.kind === "ping") {
      transport.send(fromPeerId, buildMessage(clientId, "pong", { nonce: message.nonce }));
    }
  });

  hooks.onAssignedPlayer(hostPlayerId);
  hooks.onSnapshot(snapshot);
  updateConnections();

  return {
    submitMove(move: Move): void {
      const actor = move.kind === "Ask" ? move.asker : move.target;
      if (actor !== hostPlayerId) {
        hooks.onMoveError(`Host may only submit moves for player ${hostPlayerId}.`);
        return;
      }
      commitMove(move);
    },
    startGame(): void {
      const openAssigned = rosterFromMap(connections).filter(
        (c) => c.peerId !== "self" && c.status === "open" && !!c.playerId
      );
      const playerCount = 1 + openAssigned.length;
      const maxPlayers = config.setup.players.length;
      if (playerCount < 2 || playerCount > maxPlayers) {
        hooks.onSessionError(`Player count must be between 2 and ${maxPlayers}.`);
        return;
      }

      refreshSnapshotForRoster("start_game");
      started = true;
      hooks.onGameStarted(true);
      hooks.onSnapshot(snapshot);
      hooks.onLog("Game started by host.");
      transport.broadcast(
        buildMessage(clientId, "start_game", {
          snapshot,
          roster: rosterFromMap(connections)
        })
      );
    },
    requestSync(peerId?: PeerId): void {
      if (peerId) {
        transport.send(peerId, buildMessage(clientId, "sync_response", { snapshot, reason: "host_manual_sync" }));
        return;
      }
      transport.broadcast(buildMessage(clientId, "sync_response", { snapshot, reason: "host_manual_sync_all" }));
    },
    close(): void {
      started = false;
      hooks.onGameStarted(false);
      transport.close();
    },
    getSnapshot(): SessionSnapshot {
      return snapshot;
    },
    getConnections(): ConnectionState[] {
      return rosterFromMap(connections);
    }
  };
}

export function createPeerSession(
  uiHooks: Partial<SessionUiHooks>,
  deps: SessionDeps & { displayName: string }
): PeerSession {
  const hooks = { ...defaultHooks(), ...uiHooks };
  const clientId = deps.clientId ?? makeClientId();
  const transport = deps.transport;

  let assignedPlayerId: string | undefined;
  let snapshot: SessionSnapshot | undefined;
  let started = false;
  let helloSent = false;
  const connections = new Map<PeerId, ConnectionState>();
  connections.set("host", { peerId: "host", status: "new", label: "Host" });

  function updateConnections(): void {
    hooks.onConnectionsChanged(rosterFromMap(connections));
  }

  function applySnapshot(next: SessionSnapshot, reason: string): void {
    const invalid = validateSnapshot(next);
    if (invalid) {
      hooks.onSessionError(invalid);
      return;
    }
    snapshot = next;
    hooks.onSnapshot(next);
    hooks.onLog(`Applied snapshot seq=${next.sessionSeq} (${reason}).`);
  }

  function sendHelloIfReady(): void {
    const host = connections.get("host");
    if (!host || host.status !== "open" || helloSent) {
      return;
    }
    transport.send("host", buildMessage(clientId, "hello", { displayName: deps.displayName }));
    helloSent = true;
    hooks.onLog("Sent hello to host.");
  }

  transport.onPeerState((peerId, status) => {
    const current = connections.get(peerId) ?? { peerId, status: "new", label: peerId };
    connections.set(peerId, { ...current, status });
    updateConnections();
    if (peerId === "host") {
      sendHelloIfReady();
    }
  });

  transport.onMessage((fromPeerId, message) => {
    if (fromPeerId !== "host") {
      return;
    }

    if (message.kind === "welcome") {
      assignedPlayerId = message.assignedPlayerId || undefined;
      hooks.onAssignedPlayer(assignedPlayerId);
      connections.clear();
      for (const row of message.roster) {
        connections.set(row.peerId, row);
      }
      updateConnections();
      hooks.onLog(`Assigned player: ${assignedPlayerId ?? "(none)"}.`);
      return;
    }

    if (message.kind === "start_game") {
      started = true;
      hooks.onGameStarted(true);
      applySnapshot(message.snapshot, "start_game");
      connections.clear();
      for (const row of message.roster) {
        connections.set(row.peerId, row);
      }
      updateConnections();
      return;
    }

    if (message.kind === "state_commit") {
      if (!snapshot) {
        applySnapshot(message.snapshot, "state_commit_initial");
        return;
      }
      if (message.snapshot.sessionSeq !== snapshot.sessionSeq + 1) {
        hooks.onLog(
          `Commit sequence gap: local=${snapshot.sessionSeq} remote=${message.snapshot.sessionSeq}; requesting sync.`
        );
        transport.send(
          "host",
          buildMessage(clientId, "sync_request", {
            knownSeq: snapshot.sessionSeq,
            knownHash: snapshot.stateHash
          })
        );
        return;
      }
      applySnapshot(message.snapshot, "state_commit");
      return;
    }

    if (message.kind === "sync_response") {
      applySnapshot(message.snapshot, `sync_response:${message.reason}`);
      return;
    }

    if (message.kind === "move_reject") {
      hooks.onMoveError(`Move rejected: ${message.reason}`);
      return;
    }

    if (message.kind === "peer_joined" || message.kind === "peer_left") {
      connections.clear();
      for (const row of message.roster) {
        connections.set(row.peerId, row);
      }
      updateConnections();
      return;
    }

    if (message.kind === "ping") {
      transport.send("host", buildMessage(clientId, "pong", { nonce: message.nonce }));
    }
  });

  updateConnections();
  hooks.onAssignedPlayer(undefined);
  hooks.onGameStarted(false);
  hooks.onLog("Peer session initialized; waiting for host channel.");

  return {
    submitMove(move: Move): void {
      if (!started || !snapshot) {
        hooks.onMoveError("Game has not started.");
        return;
      }
      if (!assignedPlayerId) {
        hooks.onMoveError("No player assigned for this peer.");
        return;
      }
      const actor = move.kind === "Ask" ? move.asker : move.target;
      if (actor !== assignedPlayerId) {
        hooks.onMoveError(`You are assigned ${assignedPlayerId} and cannot submit as ${actor}.`);
        return;
      }
      transport.send(
        "host",
        buildMessage(clientId, "move_request", {
          move,
          knownSeq: snapshot.sessionSeq,
          knownHash: snapshot.stateHash
        })
      );
    },
    requestSync(): void {
      if (!snapshot) {
        hooks.onMoveError("Cannot sync before receiving initial snapshot.");
        return;
      }
      transport.send(
        "host",
        buildMessage(clientId, "sync_request", {
          knownSeq: snapshot.sessionSeq,
          knownHash: snapshot.stateHash
        })
      );
    },
    close(): void {
      started = false;
      hooks.onGameStarted(false);
      transport.close();
    },
    getSnapshot(): SessionSnapshot | undefined {
      return snapshot;
    },
    getConnections(): ConnectionState[] {
      return rosterFromMap(connections);
    }
  };
}
