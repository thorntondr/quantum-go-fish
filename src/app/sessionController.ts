import { applyMove } from "../engine/moves.js";
import { createInitialState, cloneState } from "../engine/state.js";
import type { GameState, Move, SetupConfig } from "../engine/types.js";
import { isLegalMove } from "../engine/rules.js";
import { stateHash } from "./hash.js";
import { buildMessage, makeClientId } from "./sessionProtocol.js";
import type {
  ClientId,
  ConnectionState,
  PeerId,
  RoomConfig,
  SessionSnapshot,
  SessionUiHooks,
  SuitMeta
} from "./sessionTypes.js";
import type { SessionTransport } from "./sessionTransport.js";

interface SessionDeps {
  transport: SessionTransport;
  clientId?: ClientId;
  initialState?: GameState;
  sessionSeq?: number;
  started?: boolean;
  suitMeta?: Record<string, SuitMeta>;
  seatClaims?: SeatClaim[];
}

export interface HostSession {
  submitMove: (move: Move) => void;
  startGame: (setup?: SetupConfig) => void;
  restartGame: (setup?: SetupConfig) => void;
  requestSync: (peerId?: PeerId) => void;
  setSuitMeta: (suitId: string, meta: SuitMeta) => void;
  close: () => void;
  getSnapshot: () => SessionSnapshot;
  getConnections: () => ConnectionState[];
  getClientId: () => ClientId;
  getSuitMeta: () => Record<string, SuitMeta>;
  getSeatClaims: () => SeatClaim[];
}

export interface PeerSession {
  submitMove: (move: Move) => void;
  requestSync: () => void;
  setSuitMeta: (suitId: string, meta: SuitMeta) => void;
  leaveGame: () => void;
  close: () => void;
  getSnapshot: () => SessionSnapshot | undefined;
  getConnections: () => ConnectionState[];
  getClientId: () => ClientId;
}

interface SeatClaim {
  clientId: ClientId;
  playerId: string;
  expiresAt: number;
  label: string;
}

function defaultHooks(): SessionUiHooks {
  return {
    onLog: () => {},
    onSessionError: () => {},
    onMoveError: () => {},
    onConnectionsChanged: () => {},
    onSnapshot: () => {},
    onAssignedPlayer: () => {},
    onGameStarted: () => {},
    onSuitMetaChanged: () => {}
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

const RECONNECT_WINDOW_MS = 2 * 60 * 1000;

function describeConnectionTransition(previous: ConnectionState | undefined, nextStatus: ConnectionState["status"]): string {
  return `${previous?.status ?? "missing"} -> ${nextStatus}`;
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
  let sessionSeq = deps.sessionSeq ?? 0;
  let snapshot = snapshotFromState(baseState, sessionSeq);
  let started = deps.started ?? false;
  const suitMeta: Record<string, SuitMeta> = { ...(deps.suitMeta ?? {}) };

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
  const assignedByPeer = new Map<PeerId, string>();
  const seatClaims = new Map<ClientId, SeatClaim>(
    deps.seatClaims?.map((claim) => [claim.clientId, claim]) ?? []
  );

  function activeAssignedPlayers(): string[] {
    const active = new Set<string>([hostPlayerId]);
    for (const row of connections.values()) {
      if (row.peerId === "self") {
        continue;
      }
      if ((row.status === "open" || row.status === "reserved") && row.playerId) {
        active.add(row.playerId);
      }
    }
    for (const claim of seatClaims.values()) {
      if (claim.expiresAt > Date.now()) {
        active.add(claim.playerId);
      }
    }
    const inactive = new Set(snapshot.state.inactivePlayers);
    return config.setup.players.filter((playerId) => active.has(playerId) && !inactive.has(playerId));
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
      initialSuitMax: template.initialSuitMax,
      version: template.version
    };
  }

  function randomStartingPlayer(players: string[]): string {
    const index = Math.floor(Math.random() * players.length);
    return players[index] ?? players[0];
  }

  function refreshSnapshotForRoster(reason: string, force = false): void {
    if (started && !force) {
      return;
    }
    const players = activeAssignedPlayers();
    if (players.length === 0) {
      return;
    }
    sessionSeq = 0;
    const startingPlayer =
      reason === "start_game" || reason === "restart_game" ? randomStartingPlayer(players) : players[0];
    snapshot = snapshotFromState(
      createInitialState(buildSetupWithStartingPlayer(config.setup, players, startingPlayer)),
      sessionSeq
    );
    hooks.onSnapshot(snapshot);
    hooks.onLog(`Updated pregame setup for ${players.length} player(s) (${reason}).`);
  }

  function startGameInternal(reason: "start_game" | "restart_game", nextSetup?: SetupConfig): void {
    if (nextSetup) {
      config.setup = nextSetup;
    }
    const openAssigned = rosterFromMap(connections).filter(
      (c) => c.peerId !== "self" && c.status === "open" && !!c.playerId
    );
    const playerCount = 1 + openAssigned.length;
    const maxPlayers = config.setup.players.length;
    if (playerCount < 2 || playerCount > maxPlayers) {
      hooks.onSessionError(`Player count must be between 2 and ${maxPlayers}.`);
      return;
    }

    if (reason === "restart_game") {
      for (const key of Object.keys(suitMeta)) {
        delete suitMeta[key];
      }
      seatClaims.clear();
      for (const [peerId, connection] of connections.entries()) {
        if (peerId === "self" || connection.status !== "reserved") {
          continue;
        }
        connections.set(peerId, { ...connection, status: "inactive" });
      }
      emitSuitMeta();
      updateConnections();
    }
    refreshSnapshotForRoster(reason, true);
    started = true;
    hooks.onGameStarted(true);
    hooks.onSnapshot(snapshot);
    hooks.onLog(reason === "restart_game" ? "Game restarted by host." : "Game started by host.");
    transport.broadcast(
      buildMessage(clientId, "start_game", {
        snapshot,
        roster: rosterFromMap(connections),
        suitMeta: { ...suitMeta }
      })
    );
  }

  function updateConnections(): void {
    hooks.onConnectionsChanged(rosterFromMap(connections));
  }

  function emitSuitMeta(): void {
    hooks.onSuitMetaChanged({ ...suitMeta });
  }

  function normalizeSuitMeta(meta: SuitMeta): SuitMeta | undefined {
    const name = meta.name?.trim();
    const symbol = meta.symbol?.trim();
    const color = meta.color?.trim();
    const next: SuitMeta = {};
    if (name) {
      next.name = name;
    }
    if (symbol) {
      next.symbol = symbol;
    }
    if (color) {
      next.color = color;
    }
    return Object.keys(next).length > 0 ? next : undefined;
  }

  function hasSuitMeta(meta: SuitMeta | undefined): boolean {
    return Boolean(meta?.name || meta?.symbol || meta?.color);
  }

  function applySuitMeta(suitId: string, meta: SuitMeta): { applied: boolean; meta: SuitMeta } | undefined {
    const normalized = normalizeSuitMeta(meta);
    if (!normalized) {
      return undefined;
    }
    const existing = suitMeta[suitId];
    if (hasSuitMeta(existing)) {
      return { applied: false, meta: existing ?? {} };
    }
    suitMeta[suitId] = normalized;
    emitSuitMeta();
    return { applied: true, meta: normalized };
  }

  function updateSnapshot(nextState: GameState, reason: string, broadcast = true): void {
    sessionSeq += 1;
    snapshot = snapshotFromState(nextState, sessionSeq);
    hooks.onSnapshot(snapshot);
    hooks.onLog(reason);
    if (broadcast) {
      transport.broadcast(buildMessage(clientId, "sync_response", { snapshot, reason }));
    }
  }

  function markInactive(playerId: string, reason: string): void {
    if (snapshot.state.inactivePlayers.includes(playerId)) {
      return;
    }
    const next = cloneState(snapshot.state);
    next.inactivePlayers.push(playerId);
    const pending = next.turnState.pendingAsk;
    const isInactive = (id: string) => next.inactivePlayers.includes(id);
    const nextActivePlayer = (from: string) => {
      const players = next.players;
      const startIndex = players.indexOf(from);
      for (let i = 1; i <= players.length; i += 1) {
        const candidate = players[(startIndex + i) % players.length];
        if (!isInactive(candidate)) {
          return candidate;
        }
      }
      return from;
    };
    if (pending && (pending.asker === playerId || pending.target === playerId)) {
      next.turnState.pendingAsk = undefined;
      next.turnState.phase = "Idle";
      next.turnState.currentPlayer = nextActivePlayer(pending.asker);
    } else if (next.turnState.currentPlayer === playerId) {
      next.turnState.currentPlayer = nextActivePlayer(playerId);
    }
    updateSnapshot(next, reason);
  }

  function cleanupExpiredClaims(): void {
    const now = Date.now();
    const affectedPeers = new Set<PeerId>();
    for (const [clientKey, claim] of seatClaims.entries()) {
      if (claim.expiresAt > now) {
        continue;
      }
      seatClaims.delete(clientKey);
      markInactive(claim.playerId, `Seat claim expired for ${claim.playerId}.`);
      for (const [peerId, connection] of connections.entries()) {
        if (connection.playerId === claim.playerId) {
          connections.set(peerId, { ...connection, status: "inactive" });
          affectedPeers.add(peerId);
        }
      }
    }
    if (affectedPeers.size > 0) {
      updateConnections();
      for (const peerId of affectedPeers) {
        broadcastRosterLeft(peerId);
      }
    }
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
    cleanupExpiredClaims();
    if (peerId === "self") {
      return;
    }
    const existing = connections.get(peerId);
    hooks.onLog(`Peer ${peerId} connection state: ${describeConnectionTransition(existing, status)}.`);
    const next: ConnectionState = {
      peerId,
      clientId: existing?.clientId,
      playerId: existing?.playerId,
      status,
      label: existing?.label ?? peerId
    };
    connections.set(peerId, next);
    if (status === "closed" || status === "error") {
      if (existing?.clientId && existing.playerId && !snapshot.state.inactivePlayers.includes(existing.playerId)) {
        for (const [clientKey, claim] of seatClaims.entries()) {
          if (claim.playerId === existing.playerId) {
            seatClaims.delete(clientKey);
          }
        }
        seatClaims.set(existing.clientId, {
          clientId: existing.clientId,
          playerId: existing.playerId,
          expiresAt: Date.now() + RECONNECT_WINDOW_MS,
          label: existing.label ?? existing.clientId
        });
        connections.set(peerId, { ...next, status: "reserved" });
        hooks.onLog(
          `Reserved seat for ${existing.playerId} after ${status} from ${existing.label ?? peerId}; reconnect window active.`
        );
      }
      if (existing?.clientId) {
        assignedByPeer.delete(peerId);
      }
      updateConnections();
      broadcastRosterLeft(peerId);
      if (!started) {
        refreshSnapshotForRoster("peer_left");
      }
      return;
    }
    updateConnections();
  });

  transport.onMessage((fromPeerId, message) => {
    cleanupExpiredClaims();
    if (message.kind === "hello") {
      hooks.onLog(
        `Received hello from ${message.displayName || fromPeerId} (${fromPeerId}) client=${message.fromClientId}.`
      );
      const claim = seatClaims.get(message.fromClientId);
      const assignedPlayerId =
        (claim && claim.expiresAt > Date.now() && !snapshot.state.inactivePlayers.includes(claim.playerId)
          ? claim.playerId
          : undefined) ?? assignedByPeer.get(fromPeerId) ?? nextAssignablePlayer();
      if (!assignedPlayerId || snapshot.state.inactivePlayers.includes(assignedPlayerId)) {
        hooks.onLog(`Rejecting join from ${fromPeerId}; no available player slots.`);
        transport.send(
          fromPeerId,
          buildMessage(clientId, "join_reject", {
            reason: "No available player slots to join."
          })
        );
        return;
      }
      const current = connections.get(fromPeerId) ?? {
        peerId: fromPeerId,
        status: "new",
        label: fromPeerId
      };
      for (const [peerId, connection] of connections.entries()) {
        if (peerId !== fromPeerId && connection.playerId === assignedPlayerId && connection.status === "reserved") {
          connections.delete(peerId);
        }
      }
      const updated: ConnectionState = {
        ...current,
        clientId: message.fromClientId,
        playerId: assignedPlayerId,
        label: message.displayName || fromPeerId
      };
      connections.set(fromPeerId, updated);
      if (claim) {
        seatClaims.delete(message.fromClientId);
      }
      if (assignedPlayerId) {
        assignedByPeer.set(fromPeerId, assignedPlayerId);
      } else {
        hooks.onSessionError("No player slots available for joining peer.");
        return;
      }
      updateConnections();
      refreshSnapshotForRoster("peer_joined");
      hooks.onLog(`Sending welcome to ${updated.label} (${fromPeerId}) as player ${assignedPlayerId}.`);

      transport.send(
        fromPeerId,
        buildMessage(clientId, "welcome", {
          assignedPlayerId,
          roster: rosterFromMap(connections),
          hostClientId: clientId,
          suitMeta: { ...suitMeta }
        })
      );
      if (started) {
        hooks.onLog(`Sending start_game snapshot to rejoined peer ${updated.label} (${fromPeerId}).`);
        transport.send(
          fromPeerId,
          buildMessage(clientId, "start_game", {
            snapshot,
            roster: rosterFromMap(connections),
          suitMeta: { ...suitMeta }
        })
      );
      }
      broadcastRosterJoined(updated);
      hooks.onLog(`Peer hello accepted from ${updated.label} (${fromPeerId}).`);
      return;
    }

    if (message.kind === "suit_meta") {
      const outcome = applySuitMeta(message.suitId, message.meta);
      if (!outcome) {
        return;
      }
      if (outcome.applied) {
        transport.broadcast(
          buildMessage(clientId, "suit_meta", {
            suitId: message.suitId,
            meta: outcome.meta
          })
        );
      } else {
        transport.send(
          fromPeerId,
          buildMessage(clientId, "suit_meta", {
            suitId: message.suitId,
            meta: outcome.meta
          })
        );
      }
      return;
    }

    if (message.kind === "leave_game") {
      const connection = connections.get(fromPeerId);
      if (connection?.playerId) {
        markInactive(connection.playerId, `Player ${connection.playerId} left the game.`);
        connections.set(fromPeerId, { ...connection, status: "inactive" });
        updateConnections();
        broadcastRosterLeft(fromPeerId);
      }
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
  emitSuitMeta();
  hooks.onGameStarted(started);

  return {
    submitMove(move: Move): void {
      const actor = move.kind === "Ask" ? move.asker : move.target;
      if (actor !== hostPlayerId) {
        hooks.onMoveError(`Host may only submit moves for player ${hostPlayerId}.`);
        return;
      }
      commitMove(move);
    },
    startGame(setup?: SetupConfig): void {
      startGameInternal("start_game", setup);
    },
    restartGame(setup?: SetupConfig): void {
      startGameInternal("restart_game", setup);
    },
    requestSync(peerId?: PeerId): void {
      if (peerId) {
        transport.send(peerId, buildMessage(clientId, "sync_response", { snapshot, reason: "host_manual_sync" }));
        return;
      }
      transport.broadcast(buildMessage(clientId, "sync_response", { snapshot, reason: "host_manual_sync_all" }));
    },
    setSuitMeta(suitId: string, meta: SuitMeta): void {
      const outcome = applySuitMeta(suitId, meta);
      if (!outcome || !outcome.applied) {
        return;
      }
      transport.broadcast(
        buildMessage(clientId, "suit_meta", {
          suitId,
          meta: outcome.meta
        })
      );
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
    },
    getClientId(): ClientId {
      return clientId;
    },
    getSuitMeta(): Record<string, SuitMeta> {
      return { ...suitMeta };
    },
    getSeatClaims(): SeatClaim[] {
      return [...seatClaims.values()].map((claim) => ({ ...claim }));
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
  let welcomeReceived = false;
  const suitMeta: Record<string, SuitMeta> = {};
  const connections = new Map<PeerId, ConnectionState>();
  connections.set("host", { peerId: "host", status: "new", label: "Host" });

  function updateConnections(): void {
    hooks.onConnectionsChanged(rosterFromMap(connections));
  }

  function emitSuitMeta(): void {
    hooks.onSuitMetaChanged({ ...suitMeta });
  }

  function normalizeSuitMeta(meta: SuitMeta): SuitMeta | undefined {
    const name = meta.name?.trim();
    const symbol = meta.symbol?.trim();
    const color = meta.color?.trim();
    const next: SuitMeta = {};
    if (name) {
      next.name = name;
    }
    if (symbol) {
      next.symbol = symbol;
    }
    if (color) {
      next.color = color;
    }
    return Object.keys(next).length > 0 ? next : undefined;
  }

  function hasSuitMeta(meta: SuitMeta | undefined): boolean {
    return Boolean(meta?.name || meta?.symbol || meta?.color);
  }

  function applySuitMeta(suitId: string, meta: SuitMeta): void {
    const normalized = normalizeSuitMeta(meta);
    if (!normalized) {
      return;
    }
    const existing = suitMeta[suitId];
    if (hasSuitMeta(existing)) {
      return;
    }
    suitMeta[suitId] = normalized;
    emitSuitMeta();
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
    hooks.onLog(`Sent hello to host as ${deps.displayName} (client=${clientId}).`);
  }

  transport.onPeerState((peerId, status) => {
    const current = connections.get(peerId) ?? { peerId, status: "new", label: peerId };
    hooks.onLog(`Peer view of ${peerId} connection state: ${current.status} -> ${status}.`);
    connections.set(peerId, { ...current, status });
    updateConnections();
    if (peerId === "host") {
      if (!welcomeReceived && (status === "error" || status === "closed")) {
        hooks.onLog(`Host connection failed before welcome: status=${status}.`);
        hooks.onSessionError("Unable to connect to host. Check the room code and try again.");
        started = false;
        hooks.onGameStarted(false);
        hooks.onAssignedPlayer(undefined);
        connections.clear();
        updateConnections();
        transport.close();
        return;
      }
      sendHelloIfReady();
    }
  });

  transport.onMessage((fromPeerId, message) => {
    if (fromPeerId !== "host") {
      return;
    }

    if (message.kind === "welcome") {
      welcomeReceived = true;
      assignedPlayerId = message.assignedPlayerId || undefined;
      hooks.onAssignedPlayer(assignedPlayerId);
      for (const key of Object.keys(suitMeta)) {
        delete suitMeta[key];
      }
      Object.assign(suitMeta, message.suitMeta ?? {});
      emitSuitMeta();
      connections.clear();
      for (const row of message.roster) {
        connections.set(row.peerId, row);
      }
      updateConnections();
      hooks.onLog(`Received welcome from host; assigned player ${assignedPlayerId ?? "(none)"}.`);
      return;
    }

    if (message.kind === "join_reject") {
      hooks.onLog(`Received join_reject from host: ${message.reason}`);
      hooks.onSessionError(message.reason);
      started = false;
      hooks.onGameStarted(false);
      hooks.onAssignedPlayer(undefined);
      connections.clear();
      updateConnections();
      transport.close();
      return;
    }

    if (message.kind === "start_game") {
      welcomeReceived = true;
      started = true;
      hooks.onGameStarted(true);
      applySnapshot(message.snapshot, "start_game");
      for (const key of Object.keys(suitMeta)) {
        delete suitMeta[key];
      }
      Object.assign(suitMeta, message.suitMeta ?? {});
      emitSuitMeta();
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

    if (message.kind === "suit_meta") {
      applySuitMeta(message.suitId, message.meta);
      return;
    }

    if (message.kind === "ping") {
      transport.send("host", buildMessage(clientId, "pong", { nonce: message.nonce }));
    }
  });

  updateConnections();
  emitSuitMeta();
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
    setSuitMeta(suitId: string, meta: SuitMeta): void {
      const normalized = normalizeSuitMeta(meta);
      if (!normalized) {
        return;
      }
      if (hasSuitMeta(suitMeta[suitId])) {
        return;
      }
      applySuitMeta(suitId, normalized);
      transport.send(
        "host",
        buildMessage(clientId, "suit_meta", {
          suitId,
          meta: normalized
        })
      );
    },
    leaveGame(): void {
      try {
        transport.send("host", buildMessage(clientId, "leave_game", {}));
      } catch {
        // Best effort: if the host channel is already gone, still let the local peer exit cleanly.
      }
      started = false;
      hooks.onGameStarted(false);
      transport.close();
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
    },
    getClientId(): ClientId {
      return clientId;
    }
  };
}
