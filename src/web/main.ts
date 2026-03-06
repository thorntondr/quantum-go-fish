import { createHostSession, createPeerSession } from "../app/sessionController.js";
import type { HostSession, PeerSession } from "../app/sessionController.js";
import type { RoomConfig } from "../app/sessionTypes.js";
import type { ConnectionState } from "../app/sessionTypes.js";
import { HostPeerJsTransport, PeerPeerJsTransport } from "../app/peerJsTransport.js";
import { createInitialState } from "../engine/state.js";
import { isLegalMove } from "../engine/rules.js";
import type { GameState, Move, SetupConfig } from "../engine/types.js";
import { renderState } from "../ui/interaction.js";

const stateRoot = byId("state");
const statusRoot = byId("status");
const sessionErrorRoot = byId("sessionError");
const moveErrorRoot = byId("moveError");
const legalMoves = byId("legalMoves");
const rosterRoot = byId("roster");
const eventLogRoot = byId("eventLog");

const roleSelect = byId("role") as HTMLSelectElement;
const displayNameInput = byId("displayName") as HTMLInputElement;
const expectedPlayersInput = byId("expectedPlayers") as HTMLInputElement;
const hostCodeInput = byId("hostCode") as HTMLInputElement;
const localPeerIdInput = byId("localPeerId") as HTMLInputElement;
const initSessionBtn = byId("initSessionBtn") as HTMLButtonElement;
const startGameBtn = byId("startGameBtn") as HTMLButtonElement;
const requestSyncBtn = byId("requestSyncBtn") as HTMLButtonElement;

const askTarget = byId("askTarget") as HTMLSelectElement;
const askSuit = byId("askSuit") as HTMLSelectElement;
const askBtn = byId("askBtn") as HTMLButtonElement;
const yesBtn = byId("yesBtn") as HTMLButtonElement;
const noBtn = byId("noBtn") as HTMLButtonElement;

let state = createInitialState(buildConfig(3));
let assignedPlayer: string | undefined;
let gameStarted = false;
let hostSession: HostSession | undefined;
let peerSession: PeerSession | undefined;
let hostTransport: HostPeerJsTransport | undefined;
let peerTransport: PeerPeerJsTransport | undefined;

function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing required element: #${id}`);
  }
  return node;
}

function appendLog(message: string): void {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  const next = eventLogRoot.textContent ? `${eventLogRoot.textContent}\n${line}` : line;
  eventLogRoot.textContent = next;
  eventLogRoot.scrollTop = eventLogRoot.scrollHeight;
}

function setSessionError(message: string): void {
  sessionErrorRoot.textContent = message;
}

function setMoveError(message: string): void {
  moveErrorRoot.textContent = message;
}

function clearErrors(): void {
  setSessionError("");
  setMoveError("");
}

function playerLabel(index: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < alphabet.length) {
    return alphabet[index];
  }
  return `P${index + 1}`;
}

function suitLabel(index: number): string {
  return `S${index + 1}`;
}

function buildConfig(playerCount: number): SetupConfig {
  const players = Array.from({ length: playerCount }, (_, i) => playerLabel(i));
  const suits = Array.from({ length: playerCount }, (_, i) => suitLabel(i));
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

function parseExpectedPlayers(): number | undefined {
  const n = Number.parseInt(expectedPlayersInput.value, 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) {
    return undefined;
  }
  if (n < 2 || n > 4) {
    return undefined;
  }
  return n;
}

function ensurePeerIdDefaultForRole(): void {
  const role = roleSelect.value;
  const currentPeerId = localPeerIdInput.value.trim();
  const currentHostCode = hostCodeInput.value.trim();
  if (!currentHostCode) {
    hostCodeInput.value = `qgf-${Math.floor(Math.random() * 100000)}`;
  }
  if (role === "host") {
    const hostCode = hostCodeInput.value.trim();
    if (!currentPeerId || currentPeerId.startsWith("peer-") || currentPeerId === "host") {
      localPeerIdInput.value = hostCode || "qgf-host";
    }
    return;
  }
  if (!currentPeerId || currentPeerId === hostCodeInput.value.trim()) {
    localPeerIdInput.value = `peer-${Math.floor(Math.random() * 10000)}`;
  }
}

function legalAsks(current: GameState, asker: string): Move[] {
  const moves: Move[] = [];
  for (const target of current.players) {
    if (target === asker) {
      continue;
    }
    for (const suit of current.suits) {
      const move: Move = { kind: "Ask", asker, target, suit };
      if (isLegalMove(current, move).ok) {
        moves.push(move);
      }
    }
  }
  return moves;
}

function legalAnswerMoves(current: GameState): { yes: boolean; no: boolean } {
  const pending = current.turnState.pendingAsk;
  if (!pending) {
    return { yes: false, no: false };
  }
  const yes = isLegalMove(current, {
    kind: "AnswerYes",
    target: pending.target,
    suit: pending.suit
  }).ok;
  const no = isLegalMove(current, {
    kind: "AnswerNo",
    target: pending.target,
    suit: pending.suit
  }).ok;
  return { yes, no };
}

function renderLegalMoves(current: GameState): void {
  if (!assignedPlayer) {
    legalMoves.textContent = "No assigned player yet.";
    return;
  }
  if (current.turnState.phase === "GameOver") {
    legalMoves.textContent = "Game over. No legal moves.";
    return;
  }
  if (current.turnState.pendingAsk) {
    const p = current.turnState.pendingAsk;
    const answers = legalAnswerMoves(current);
    legalMoves.textContent = [
      `Pending ask: ${p.asker} -> ${p.target} for ${p.suit}`,
      `yes: ${answers.yes ? "legal" : "illegal"}`,
      `no:  ${answers.no ? "legal" : "illegal"}`
    ].join("\n");
    return;
  }
  const asks = legalAsks(current, assignedPlayer);
  if (asks.length === 0) {
    legalMoves.textContent = "No legal asks.";
    return;
  }
  legalMoves.textContent = asks.map((m) => `ask ${m.target} ${m.suit}`).join("\n");
}

function canAsk(current: GameState): boolean {
  if (!assignedPlayer || !gameStarted) {
    return false;
  }
  if (current.turnState.pendingAsk || current.turnState.phase === "GameOver") {
    return false;
  }
  if (current.turnState.currentPlayer !== assignedPlayer) {
    return false;
  }
  return legalAsks(current, assignedPlayer).length > 0;
}

function canAnswer(current: GameState): { yes: boolean; no: boolean } {
  const pending = current.turnState.pendingAsk;
  if (!assignedPlayer || !gameStarted || !pending) {
    return { yes: false, no: false };
  }
  if (pending.target !== assignedPlayer) {
    return { yes: false, no: false };
  }
  const legal = legalAnswerMoves(current);
  return legal;
}

function refreshControls(current: GameState): void {
  const askAllowed = canAsk(current);
  const answers = canAnswer(current);

  const askMoves = assignedPlayer ? legalAsks(current, assignedPlayer) : [];
  const targets = [...new Set(askMoves.map((m) => m.target))];
  const selectedTarget =
    targets.includes(askTarget.value) && askTarget.value ? askTarget.value : (targets[0] ?? "");
  askTarget.innerHTML = targets.map((target) => `<option value="${target}">${target}</option>`).join("");
  askTarget.value = selectedTarget;

  const suits = askMoves.filter((m) => m.target === selectedTarget).map((m) => m.suit);
  askSuit.innerHTML = suits.map((suit) => `<option value="${suit}">${suit}</option>`).join("");
  askSuit.value = suits[0] ?? "";

  askTarget.disabled = !askAllowed;
  askSuit.disabled = !askAllowed;
  askBtn.disabled = !askAllowed;
  yesBtn.disabled = !answers.yes;
  noBtn.disabled = !answers.no;

  const role = roleSelect.value;
  startGameBtn.disabled = role !== "host" || !hostSession;
  requestSyncBtn.disabled = !hostSession && !peerSession;
}

function renderRoster(connections: ConnectionState[]): void {
  if (connections.length === 0) {
    rosterRoot.textContent = "No connections.";
    return;
  }
  rosterRoot.textContent = connections
    .map((c) => `${c.peerId.padEnd(8)}  ${c.label.padEnd(10)}  ${String(c.playerId ?? "-").padEnd(3)}  ${c.status}`)
    .join("\n");
}

function render(): void {
  renderState({ stateRoot, statusRoot }, state);
  renderLegalMoves(state);
  refreshControls(state);
}

function sessionHooks() {
  return {
    onLog: appendLog,
    onSessionError: setSessionError,
    onMoveError: setMoveError,
    onConnectionsChanged: renderRoster,
    onSnapshot: (snapshot: { state: GameState }) => {
      state = snapshot.state;
      render();
    },
    onAssignedPlayer: (playerId: string | undefined) => {
      assignedPlayer = playerId;
      appendLog(`Assigned local player: ${playerId ?? "(none)"}`);
      render();
    },
    onGameStarted: (started: boolean) => {
      gameStarted = started;
      appendLog(`Game started=${started}`);
      render();
    }
  };
}

function closeSession(): void {
  hostSession?.close();
  peerSession?.close();
  hostTransport?.close();
  peerTransport?.close();
  hostSession = undefined;
  peerSession = undefined;
  hostTransport = undefined;
  peerTransport = undefined;
  assignedPlayer = undefined;
  gameStarted = false;
  rosterRoot.textContent = "No connections.";
}

async function initSession(): Promise<void> {
  clearErrors();
  closeSession();

  const expectedPlayers = parseExpectedPlayers();
  if (!expectedPlayers) {
    setSessionError("Expected players must be an integer from 2 to 4.");
    return;
  }
  const role = roleSelect.value;
  const hostCode = hostCodeInput.value.trim();
  const localPeerId = localPeerIdInput.value.trim();
  if (!hostCode) {
    setSessionError("Host code is required.");
    return;
  }
  if (!localPeerId) {
    setSessionError("Local peer ID is required.");
    return;
  }
  const displayName = displayNameInput.value.trim() || "Player";
  const roomConfig: RoomConfig = {
    expectedPlayers,
    setup: buildConfig(expectedPlayers)
  };
  state = createInitialState(roomConfig.setup);
  render();

  if (role === "host") {
    hostTransport = new HostPeerJsTransport(localPeerId);
    hostTransport.onReady((id) => {
      hostCodeInput.value = id;
      localPeerIdInput.value = id;
      appendLog(`Host code ready: ${id}`);
    });
    hostSession = createHostSession(roomConfig, sessionHooks(), { transport: hostTransport });
    appendLog("Host session initialized (PeerJS Cloud).");
  } else {
    peerTransport = new PeerPeerJsTransport(hostCode, localPeerId);
    peerTransport.onReady((id) => {
      localPeerIdInput.value = id;
      appendLog(`Peer ID ready: ${id}`);
    });
    peerSession = createPeerSession(sessionHooks(), { transport: peerTransport, displayName });
    appendLog(`Peer session initialized; connecting to host code ${hostCode}.`);
  }
  render();
}

function submitMove(move: Move): void {
  clearErrors();
  if (hostSession) {
    hostSession.submitMove(move);
    return;
  }
  if (peerSession) {
    peerSession.submitMove(move);
    return;
  }
  setMoveError("Session is not initialized.");
}

initSessionBtn.addEventListener("click", () => {
  void initSession().catch((error) => {
    setSessionError(error instanceof Error ? error.message : String(error));
  });
});
roleSelect.addEventListener("change", () => {
  ensurePeerIdDefaultForRole();
  render();
});

startGameBtn.addEventListener("click", () => {
  if (!hostSession) {
    setSessionError("Host session is not initialized.");
    return;
  }
  hostSession.startGame();
});

requestSyncBtn.addEventListener("click", () => {
  if (hostSession) {
    hostSession.requestSync();
    appendLog("Host broadcasted sync response.");
    return;
  }
  if (peerSession) {
    peerSession.requestSync();
    appendLog("Peer requested sync.");
    return;
  }
  setSessionError("No session initialized.");
});

askBtn.addEventListener("click", () => {
  if (!assignedPlayer) {
    setMoveError("No assigned player.");
    return;
  }
  const target = askTarget.value;
  const suit = askSuit.value;
  if (!target || !suit) {
    setMoveError("Select a valid target and suit.");
    return;
  }
  submitMove({ kind: "Ask", asker: assignedPlayer, target, suit });
});

yesBtn.addEventListener("click", () => {
  const pending = state.turnState.pendingAsk;
  if (!pending) {
    setMoveError("No pending ask.");
    return;
  }
  submitMove({ kind: "AnswerYes", target: pending.target, suit: pending.suit });
});

noBtn.addEventListener("click", () => {
  const pending = state.turnState.pendingAsk;
  if (!pending) {
    setMoveError("No pending ask.");
    return;
  }
  submitMove({ kind: "AnswerNo", target: pending.target, suit: pending.suit });
});

ensurePeerIdDefaultForRole();
render();
