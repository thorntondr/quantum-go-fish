import { createHostSession, createPeerSession } from "../app/sessionController.js";
import type { HostSession, PeerSession } from "../app/sessionController.js";
import type { ConnectionState, RoomConfig, SessionRole } from "../app/sessionTypes.js";
import { HostPeerJsTransport, PeerPeerJsTransport } from "../app/peerJsTransport.js";
import { createInitialState } from "../engine/state.js";
import { isLegalMove } from "../engine/rules.js";
import type { GameState, Move, SetupConfig } from "../engine/types.js";
import { renderState } from "../ui/interaction.js";

const stateRoot = requireEl("state");
const statusRoot = requireEl("status");
const sessionErrorRoot = requireEl("sessionError");
const moveErrorRoot = requireEl("moveError");
const legalMoves = requireEl("legalMoves");
const eventLogRoot = requireEl("eventLog");
const rosterRoot = getEl("roster");

const roleSelect = getEl("role") as HTMLSelectElement | null;
const displayNameInput = getEl("displayName") as HTMLInputElement | null;
const hostCodeInput = getEl("hostCode") as HTMLInputElement | null;
const localPeerIdInput = getEl("localPeerId") as HTMLInputElement | null;
const initSessionBtn = getEl("initSessionBtn") as HTMLButtonElement | null;
const startGameBtn = getEl("startGameBtn") as HTMLButtonElement | null;
const requestSyncBtn = getEl("requestSyncBtn") as HTMLButtonElement | null;

const friendlyNameInput = getEl("friendlyName") as HTMLInputElement | null;
const hostBtn = getEl("hostBtn") as HTMLButtonElement | null;
const roomCodeInput = getEl("roomCode") as HTMLInputElement | null;
const joinBtn = getEl("joinBtn") as HTMLButtonElement | null;
const waitingRoomCode = getEl("waitingRoomCode");
const waitingRoster = getEl("waitingRoster");
const waitingStartGameBtn = getEl("waitingStartGameBtn") as HTMLButtonElement | null;
const screenLanding = getEl("screenLanding");
const screenWaiting = getEl("screenWaiting");
const screenGame = getEl("screenGame");

const askTarget = requireEl("askTarget") as HTMLSelectElement;
const askSuit = requireEl("askSuit") as HTMLSelectElement;
const askBtn = requireEl("askBtn") as HTMLButtonElement;
const yesBtn = requireEl("yesBtn") as HTMLButtonElement;
const noBtn = requireEl("noBtn") as HTMLButtonElement;

const MAX_PLAYERS = 13;
let state = createInitialState(buildConfig(1));
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

function getEl(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function requireEl(id: string): HTMLElement {
  return byId(id);
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

function ensurePeerIdDefaultForRole(): void {
  if (!roleSelect || !localPeerIdInput || !hostCodeInput) {
    return;
  }
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

  if (roleSelect && startGameBtn) {
    startGameBtn.disabled = roleSelect.value !== "host" || !hostSession;
  }
  if (requestSyncBtn) {
    requestSyncBtn.disabled = !hostSession && !peerSession;
  }
  if (waitingStartGameBtn) {
    waitingStartGameBtn.disabled = !hostSession;
  }
}

function renderRoster(connections: ConnectionState[]): void {
  if (rosterRoot) {
    if (connections.length === 0) {
      rosterRoot.textContent = "No connections.";
    } else {
      rosterRoot.textContent = connections
        .map((c) => `${c.peerId.padEnd(8)}  ${c.label.padEnd(10)}  ${String(c.playerId ?? "-").padEnd(3)}  ${c.status}`)
        .join("\n");
    }
  }
  if (waitingRoster) {
    const openPlayers = connections.filter((c) => c.status === "open");
    waitingRoster.innerHTML = "";
    if (openPlayers.length === 0) {
      waitingRoster.innerHTML = "<li class=\"roster-item\">No connected players yet.</li>";
      return;
    }
    for (const player of openPlayers) {
      const item = document.createElement("li");
      item.className = "roster-item";
      item.textContent = player.label || player.peerId;
      waitingRoster.appendChild(item);
    }
  }
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
      if (started) {
        setScreen("game");
      } else {
        setScreen("waiting");
      }
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
  if (rosterRoot) {
    rosterRoot.textContent = "No connections.";
  }
  if (waitingRoster) {
    waitingRoster.innerHTML = "<li class=\"roster-item\">No connected players yet.</li>";
  }
  setScreen("landing");
}

function setScreen(target: "landing" | "waiting" | "game"): void {
  if (!screenLanding || !screenWaiting || !screenGame) {
    return;
  }
  const screens = {
    landing: screenLanding,
    waiting: screenWaiting,
    game: screenGame
  };
  for (const [key, el] of Object.entries(screens)) {
    if (key === target) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  }
}

function setWaitingRoomCode(code: string): void {
  if (waitingRoomCode) {
    waitingRoomCode.textContent = code;
  }
}

function randomHostCode(): string {
  return `qgf-${Math.floor(Math.random() * 100000)}`;
}

function randomPeerId(): string {
  return `peer-${Math.floor(Math.random() * 10000)}`;
}

async function initSession(options: {
  role: SessionRole;
  hostCode: string;
  localPeerId: string;
  displayName: string;
}): Promise<void> {
  clearErrors();
  closeSession();

  const hostCode = options.hostCode.trim();
  const localPeerId = options.localPeerId.trim();
  if (!hostCode) {
    setSessionError("Host code is required.");
    return;
  }
  if (!localPeerId) {
    setSessionError("Local peer ID is required.");
    return;
  }
  const displayName = options.displayName.trim() || "Player";
  const roomConfig: RoomConfig = {
    setup: buildConfig(MAX_PLAYERS)
  };
  state = createInitialState(buildConfig(1));
  render();

  if (options.role === "host") {
    hostTransport = new HostPeerJsTransport(localPeerId);
    hostTransport.onReady((id) => {
      if (hostCodeInput) {
        hostCodeInput.value = id;
      }
      if (localPeerIdInput) {
        localPeerIdInput.value = id;
      }
      if (roomCodeInput) {
        roomCodeInput.value = id;
      }
      setWaitingRoomCode(id);
      appendLog(`Host code ready: ${id}`);
    });
    hostSession = createHostSession(roomConfig, sessionHooks(), { transport: hostTransport });
    appendLog("Host session initialized (PeerJS Cloud).");
  } else {
    peerTransport = new PeerPeerJsTransport(hostCode, localPeerId);
    peerTransport.onReady((id) => {
      if (localPeerIdInput) {
        localPeerIdInput.value = id;
      }
      appendLog(`Peer ID ready: ${id}`);
    });
    peerSession = createPeerSession(sessionHooks(), { transport: peerTransport, displayName });
    appendLog(`Peer session initialized; connecting to host code ${hostCode}.`);
  }
  setWaitingRoomCode(hostCode);
  setScreen("waiting");
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

if (initSessionBtn && roleSelect && hostCodeInput && localPeerIdInput) {
  initSessionBtn.addEventListener("click", () => {
    void initSession({
      role: roleSelect.value as SessionRole,
      hostCode: hostCodeInput.value,
      localPeerId: localPeerIdInput.value,
      displayName: displayNameInput?.value ?? "Player"
    }).catch((error) => {
      setSessionError(error instanceof Error ? error.message : String(error));
    });
  });
  roleSelect.addEventListener("change", () => {
    ensurePeerIdDefaultForRole();
    render();
  });
}

if (hostBtn && friendlyNameInput) {
  hostBtn.addEventListener("click", () => {
    const name = friendlyNameInput.value.trim() || "Player";
    const hostCode = roomCodeInput?.value.trim() || randomHostCode();
    if (roomCodeInput) {
      roomCodeInput.value = hostCode;
    }
    void initSession({
      role: "host",
      hostCode,
      localPeerId: hostCode,
      displayName: name
    }).catch((error) => {
      setSessionError(error instanceof Error ? error.message : String(error));
    });
  });
}

if (joinBtn && friendlyNameInput && roomCodeInput) {
  joinBtn.addEventListener("click", () => {
    const hostCode = roomCodeInput.value.trim();
    if (!hostCode) {
      setSessionError("Room code is required to join.");
      return;
    }
    const name = friendlyNameInput.value.trim() || "Player";
    void initSession({
      role: "peer",
      hostCode,
      localPeerId: randomPeerId(),
      displayName: name
    }).catch((error) => {
      setSessionError(error instanceof Error ? error.message : String(error));
    });
  });
}

if (startGameBtn) {
  startGameBtn.addEventListener("click", () => {
    if (!hostSession) {
      setSessionError("Host session is not initialized.");
      return;
    }
    hostSession.startGame();
  });
}

if (waitingStartGameBtn) {
  waitingStartGameBtn.addEventListener("click", () => {
    if (!hostSession) {
      setSessionError("Only the host can start the game.");
      return;
    }
    hostSession.startGame();
  });
}

if (requestSyncBtn) {
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
}

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
