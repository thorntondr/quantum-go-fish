import { createHostSession, createPeerSession } from "../app/sessionController.js";
import type { HostSession, PeerSession } from "../app/sessionController.js";
import type { ConnectionState, RoomConfig, SessionRole, SuitMeta as SessionSuitMeta } from "../app/sessionTypes.js";
import { HostPeerJsTransport, PeerPeerJsTransport } from "../app/peerJsTransport.js";
import { createInitialState } from "../engine/state.js";
import { isLegalMove } from "../engine/rules.js";
import type { GameState, Move, SetupConfig } from "../engine/types.js";
import {
  bindInfoOverlay,
  createSuitOverlayController,
  extractEmoji,
  getEl,
  requireEl
} from "../ui/browserUi.js";
import { renderState } from "../ui/interaction.js";
import { formatSuitLabel } from "../ui/suitPresentation.js";

const stateRoot = requireEl("state");
const statusRoot = requireEl("status");
const headerSubtitle = getEl("headerSubtitle");
const turnActionNotice = getEl("turnActionNotice");
const pendingAskNotice = getEl("pendingAskNotice");
const departureNotice = getEl("departureNotice");
const pauseNotice = getEl("pauseNotice");
const sessionErrorRoot = requireEl("sessionError");
const moveErrorRoot = requireEl("moveError");
const legalMoves = getEl("legalMoves");
const eventLogRoot = requireEl("eventLog");
const playAgainBtn = getEl("playAgainBtn") as HTMLButtonElement | null;
const sessionActions = getEl("sessionActions");
const modeSwitchLink = getEl("modeSwitchLink");

const friendlyNameInput = getEl("friendlyName") as HTMLInputElement | null;
const hostBtn = getEl("hostBtn") as HTMLButtonElement | null;
const roomCodeInput = getEl("roomCode") as HTMLInputElement | null;
const joinBtn = getEl("joinBtn") as HTMLButtonElement | null;
const waitingRoomCode = getEl("waitingRoomCode");
const gameRoomCode = getEl("gameRoomCode");
const waitingRoster = getEl("waitingRoster");
const waitingStartGameBtn = getEl("waitingStartGameBtn") as HTMLButtonElement | null;
const maxThreeToggle = getEl("maxThreeToggle") as HTMLInputElement | null;
const allOrNothingToggle = getEl("allOrNothingToggle") as HTMLInputElement | null;
const drawPileToggle = getEl("drawPileToggle") as HTMLInputElement | null;
const shareRoomBtn = getEl("shareRoomBtn") as HTMLButtonElement | null;
const shareRoomLink = getEl("shareRoomLink") as HTMLInputElement | null;
const screenLanding = getEl("screenLanding");
const screenWaiting = getEl("screenWaiting");
const screenGame = getEl("screenGame");

const askTarget = requireEl("askTarget") as HTMLSelectElement;
const askSuit = requireEl("askSuit") as HTMLSelectElement;
const askBtn = requireEl("askBtn") as HTMLButtonElement;
const yesCountWrap = getEl("yesCountWrap");
const yesCount = getEl("yesCount") as HTMLSelectElement | null;
const yesBtn = requireEl("yesBtn") as HTMLButtonElement;
const noBtn = requireEl("noBtn") as HTMLButtonElement;
const leaveGameBtn = getEl("leaveGameBtn") as HTMLButtonElement | null;
const infoBtn = getEl("infoBtn") as HTMLButtonElement | null;
const infoOverlay = getEl("infoOverlay");
const infoCloseBtn = getEl("infoCloseBtn") as HTMLButtonElement | null;
const infoContent = getEl("infoContent");

const suitOverlay = getEl("suitOverlay");
const suitOverlayLabel = getEl("suitOverlayLabel");
const suitNameInput = getEl("suitNameInput") as HTMLInputElement | null;
const suitSymbolInput = getEl("suitSymbolInput") as HTMLInputElement | null;
const suitColorInput = getEl("suitColorInput") as HTMLInputElement | null;
const suitSaveBtn = getEl("suitSaveBtn") as HTMLButtonElement | null;
const suitCancelBtn = getEl("suitCancelBtn") as HTMLButtonElement | null;
const emojiSuggestions = getEl("emojiSuggestions");

const MAX_PLAYERS = 13;
let maxThreeEnabled = false;
let allOrNothingEnabled = false;
let drawPileEnabled = false;
let state = createInitialState(buildConfig(1));
let assignedPlayer: string | undefined;
let gameStarted = false;
let hostSession: HostSession | undefined;
let peerSession: PeerSession | undefined;
let hostTransport: HostPeerJsTransport | undefined;
let peerTransport: PeerPeerJsTransport | undefined;
let currentRole: SessionRole | undefined;
let playerLabelById = new Map<string, string>();
type SuitMeta = SessionSuitMeta;
let suitMetaById = new Map<string, SuitMeta>();
let playerStatusById = new Map<string, string>();
let currentRoomCode = "";
let selectedAskTarget: string | undefined;
let syncingMaxThreeToggle = false;

const STORAGE_KEY = "qgf-session-v1";
const ENABLE_SESSION_RESTORE = true;
const OKABE_ITO = ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7", "#000000"];

function appendLog(message: string): void {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  const next = eventLogRoot.textContent ? `${eventLogRoot.textContent}\n${line}` : line;
  eventLogRoot.textContent = next;
  eventLogRoot.scrollTop = eventLogRoot.scrollHeight;
}

function clearEventLog(): void {
  eventLogRoot.textContent = "";
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

function setDepartureNotice(message: string): void {
  if (!departureNotice) {
    return;
  }
  departureNotice.textContent = message;
  departureNotice.hidden = !message;
}

function updatePlayerLabels(connections: ConnectionState[]): void {
  const baseLabels = new Map<string, string>();
  const counts = new Map<string, number>();

  for (const connection of connections) {
    if (!connection.playerId) {
      continue;
    }
    const label = connection.label || connection.peerId || connection.playerId;
    baseLabels.set(connection.playerId, label);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  playerLabelById = new Map();
  for (const [playerId, label] of baseLabels.entries()) {
    const count = counts.get(label) ?? 0;
    playerLabelById.set(playerId, count > 1 ? `${label} (${playerId})` : label);
  }
}

function formatPlayer(playerId: string): string {
  if (state.drawPile?.playerId === playerId) {
    return "Draw Pile";
  }
  return playerLabelById.get(playerId) ?? playerId;
}

function updateSuitLabels(suitMeta: Record<string, SuitMeta>): void {
  suitMetaById = new Map();
  for (const [suitId, meta] of Object.entries(suitMeta)) {
    const name = meta.name?.trim();
    const symbol = meta.symbol?.trim() || (name ? extractEmoji(name) : undefined);
    suitMetaById.set(suitId, { ...meta, name, symbol });
  }
}

function formatSuit(suitId: string): string {
  return formatSuitLabel(suitId, state.suits, suitMetaById.get(suitId));
}

function refreshPendingAskNotice(current: GameState): void {
  if (!pendingAskNotice) {
    return;
  }
  const pending = current.turnState.pendingAsk;
  if (!pending) {
    pendingAskNotice.textContent = "";
    pendingAskNotice.hidden = true;
    return;
  }
  pendingAskNotice.textContent =
    `${formatPlayer(pending.asker)} is asking ${formatPlayer(pending.target)} about ${formatSuit(pending.suit)}.`;
  pendingAskNotice.hidden = false;
}

function refreshTurnActionNotice(current: GameState): void {
  if (!turnActionNotice) {
    return;
  }
  if (current.turnState.phase === "GameOver") {
    turnActionNotice.textContent = "";
    turnActionNotice.hidden = true;
    return;
  }
  if (canAnswer(current).yes || canAnswer(current).no) {
    turnActionNotice.classList.add("callout--action");
    turnActionNotice.textContent = "Your turn to answer.";
    turnActionNotice.hidden = false;
    return;
  }
  if (canAsk(current)) {
    turnActionNotice.classList.remove("callout--action");
    turnActionNotice.textContent = "Your turn to ask.";
    turnActionNotice.hidden = false;
    return;
  }
  turnActionNotice.classList.add("callout--action");
  turnActionNotice.textContent = "";
  turnActionNotice.hidden = true;
}

function getSuitMeta(suitId: string): SuitMeta | undefined {
  return suitMetaById.get(suitId);
}

function submitSuitMeta(suitId: string, meta: SuitMeta): void {
  if (hostSession) {
    hostSession.setSuitMeta(suitId, meta);
    return;
  }
  if (peerSession) {
    peerSession.setSuitMeta(suitId, meta);
  }
}

function defaultSuitColor(suitId: string): string {
  const index = Math.max(0, state.suits.indexOf(suitId));
  return OKABE_ITO[index % OKABE_ITO.length];
}

function loadStoredSession(): Record<string, unknown> | undefined {
  if (!ENABLE_SESSION_RESTORE) {
    return undefined;
  }
  if (typeof localStorage === "undefined") {
    return undefined;
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return undefined;
}

function saveStoredSession(data: Record<string, unknown>): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function clearStoredSession(): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.removeItem(STORAGE_KEY);
}

function persistSession(): void {
  if (!ENABLE_SESSION_RESTORE) {
    return;
  }
  if (!hostSession && !peerSession) {
    return;
  }
  const role = hostSession ? "host" : "peer";
  const clientId = hostSession ? hostSession.getClientId() : peerSession?.getClientId();
  const displayName = friendlyNameInput?.value.trim() || "Player";
  const hostCode = currentRoomCode || roomCodeInput?.value.trim() || "";
  const payload: Record<string, unknown> = {
    role,
    clientId,
    displayName,
    hostCode,
    assignedPlayerId: assignedPlayer,
    lastSeen: Date.now(),
    started: gameStarted
  };
  if (hostSession) {
    const snapshot = hostSession.getSnapshot();
    payload.snapshot = snapshot.state;
    payload.sessionSeq = snapshot.sessionSeq;
    payload.suitMeta = hostSession.getSuitMeta();
    payload.seatClaims = hostSession.getSeatClaims();
  } else if (suitMetaById.size > 0) {
    payload.suitMeta = Object.fromEntries(suitMetaById.entries());
  }
  saveStoredSession(payload);
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
    startingPlayer: players[0],
    initialSuitMax: maxThreeEnabled ? 3 : 4,
    allOrNothing: allOrNothingEnabled,
    drawPile: drawPileEnabled
  };
}

function legalAsks(current: GameState, asker: string): Move[] {
  const moves: Move[] = [];
  if (current.inactivePlayers.includes(asker)) {
    return moves;
  }
  for (const target of current.players) {
    if (target === asker) {
      continue;
    }
    if (current.inactivePlayers.includes(target)) {
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

function legalYesCounts(current: GameState): number[] {
  const pending = current.turnState.pendingAsk;
  if (!pending) {
    return [];
  }
  if (!current.allOrNothing) {
    return isLegalMove(current, {
      kind: "AnswerYes",
      target: pending.target,
      suit: pending.suit
    }).ok
      ? [1]
      : [];
  }
  const counts: number[] = [];
  for (let count = current.min[pending.target][pending.suit]; count <= current.max[pending.target][pending.suit]; count += 1) {
    if (
      isLegalMove(current, {
        kind: "AnswerYes",
        target: pending.target,
        suit: pending.suit,
        count
      }).ok
    ) {
      counts.push(count);
    }
  }
  return counts;
}

function legalAnswerMoves(current: GameState): { yes: boolean; no: boolean; yesCounts: number[] } {
  const pending = current.turnState.pendingAsk;
  if (!pending) {
    return { yes: false, no: false, yesCounts: [] };
  }
  const yesCounts = legalYesCounts(current);
  const no = isLegalMove(current, {
    kind: "AnswerNo",
    target: pending.target,
    suit: pending.suit
  }).ok;
  return { yes: yesCounts.length > 0, no, yesCounts };
}

function renderLegalMoves(current: GameState): void {
  if (!legalMoves) {
    return;
  }
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
    const lines = [
      `Pending ask: ${formatPlayer(p.asker)} -> ${formatPlayer(p.target)} for ${formatSuit(p.suit)}`,
      current.allOrNothing
        ? `yes counts: ${answers.yesCounts.length > 0 ? answers.yesCounts.join(", ") : "none"}`
        : `yes: ${answers.yes ? "legal" : "illegal"}`,
      `no:  ${answers.no ? "legal" : "illegal"}`
    ];
    legalMoves.textContent = lines.join("\n");
    return;
  }
  const asks = legalAsks(current, assignedPlayer);
  if (asks.length === 0) {
    legalMoves.textContent = "No legal asks.";
    return;
  }
  legalMoves.textContent = asks.map((m) => `ask ${formatPlayer(m.target)} ${formatSuit(m.suit)}`).join("\n");
}

function canAsk(current: GameState): boolean {
  if (!assignedPlayer || !gameStarted) {
    return false;
  }
  if (current.inactivePlayers.includes(assignedPlayer)) {
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

function canAnswer(current: GameState): { yes: boolean; no: boolean; yesCounts: number[] } {
  const pending = current.turnState.pendingAsk;
  if (!assignedPlayer || !gameStarted || !pending) {
    return { yes: false, no: false, yesCounts: [] };
  }
  if (current.inactivePlayers.includes(assignedPlayer)) {
    return { yes: false, no: false, yesCounts: [] };
  }
  if (pending.target !== assignedPlayer) {
    return { yes: false, no: false, yesCounts: [] };
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
  askTarget.innerHTML = targets
    .map((target) => `<option value="${target}">${formatPlayer(target)}</option>`)
    .join("");
  askTarget.value = selectedTarget;
  selectedAskTarget = askAllowed ? selectedTarget : undefined;

  const suits = askMoves.filter((m) => m.target === selectedTarget).map((m) => m.suit);
  askSuit.innerHTML = suits.map((suit) => `<option value="${suit}">${formatSuit(suit)}</option>`).join("");
  askSuit.value = suits[0] ?? "";

  askTarget.disabled = !askAllowed;
  askSuit.disabled = !askAllowed;
  askBtn.disabled = !askAllowed;
  yesBtn.disabled = !answers.yes;
  noBtn.disabled = !answers.no;

  if (waitingStartGameBtn) {
    waitingStartGameBtn.disabled = !hostSession;
  }
  if (maxThreeToggle) {
    syncingMaxThreeToggle = true;
    maxThreeToggle.checked = maxThreeEnabled;
    maxThreeToggle.disabled = !hostSession;
    syncingMaxThreeToggle = false;
  }
  if (allOrNothingToggle) {
    syncingMaxThreeToggle = true;
    allOrNothingToggle.checked = allOrNothingEnabled;
    allOrNothingToggle.disabled = !hostSession;
    syncingMaxThreeToggle = false;
  }
  if (drawPileToggle) {
    syncingMaxThreeToggle = true;
    drawPileToggle.checked = drawPileEnabled;
    drawPileToggle.disabled = !hostSession;
    syncingMaxThreeToggle = false;
  }
  if (yesCountWrap && yesCount) {
    const showYesCount = Boolean(state.turnState.pendingAsk && state.allOrNothing);
    yesCountWrap.hidden = !showYesCount;
    if (showYesCount) {
      yesCount.innerHTML = answers.yesCounts.map((count) => `<option value="${count}">${count}</option>`).join("");
      yesCount.disabled = !answers.yes;
      yesCount.value = answers.yesCounts[0] !== undefined ? String(answers.yesCounts[0]) : "";
    } else {
      yesCount.innerHTML = "";
      yesCount.disabled = true;
    }
  }
}

function refreshPlayAgain(current: GameState): void {
  if (!playAgainBtn) {
    return;
  }
  const isGameOver = current.turnState.phase === "GameOver";
  playAgainBtn.style.display = isGameOver ? "inline-flex" : "none";
  playAgainBtn.disabled = !hostSession;
}

function refreshPauseNotice(current: GameState): void {
  if (!pauseNotice) {
    return;
  }
  let notice = "";
  const currentStatus = playerStatusById.get(current.turnState.currentPlayer);
  if (currentStatus === "reserved") {
    notice = `Waiting for ${formatPlayer(current.turnState.currentPlayer)} to reconnect.`;
  } else if (current.turnState.pendingAsk) {
    const targetStatus = playerStatusById.get(current.turnState.pendingAsk.target);
    if (targetStatus === "reserved") {
      notice = `Waiting for ${formatPlayer(current.turnState.pendingAsk.target)} to answer.`;
    }
  }
  pauseNotice.textContent = notice;
}

function renderRoster(connections: ConnectionState[]): void {
  const previousStatuses = new Map(playerStatusById);
  const previousLabels = new Map(playerLabelById);
  updatePlayerLabels(connections);
  playerStatusById = new Map();
  for (const connection of connections) {
    if (connection.playerId) {
      playerStatusById.set(connection.playerId, connection.status);
    }
  }
  if (waitingRoster) {
    const openPlayers = connections.filter((c) => c.playerId);
    waitingRoster.innerHTML = "";
    if (openPlayers.length === 0) {
      waitingRoster.innerHTML = "<li class=\"roster-item\">No connected players yet.</li>";
      return;
    }
    for (const player of openPlayers) {
      const item = document.createElement("li");
      item.className = "roster-item";
      const label = player.playerId ? formatPlayer(player.playerId) : (player.label || player.peerId);
      item.textContent = `${label} (${player.status})`;
      waitingRoster.appendChild(item);
    }
  }
  if (gameStarted) {
    let nextNotice = "";
    for (const connection of connections) {
      if (!connection.playerId || connection.playerId === assignedPlayer) {
        continue;
      }
      if (connection.status !== "inactive") {
        continue;
      }
      const previousStatus = previousStatuses.get(connection.playerId);
      if (previousStatus && previousStatus !== "inactive") {
        nextNotice = `${previousLabels.get(connection.playerId) ?? connection.label ?? connection.playerId} left the game.`;
      }
    }
    if (nextNotice) {
      setDepartureNotice(nextNotice);
    }
  }
  persistSession();
  render();
}

function render(): void {
  refreshControls(state);
  if (gameStarted) {
    renderState({ stateRoot, statusRoot }, state, {
      formatPlayer,
      formatSuit,
      getSuitMeta,
      localPlayerId: assignedPlayer,
      selectedTargetPlayerId: selectedAskTarget
    });
  } else {
    stateRoot.innerHTML = "";
    statusRoot.textContent = "";
  }
  refreshTurnActionNotice(state);
  refreshPendingAskNotice(state);
  renderLegalMoves(state);
  refreshPlayAgain(state);
  refreshPauseNotice(state);
}

function sessionHooks() {
  return {
    onLog: appendLog,
    onSessionError: (message: string) => {
      setSessionError(message);
      if (currentRole === "peer" && !gameStarted) {
        closeSession();
      }
    },
    onMoveError: setMoveError,
    onConnectionsChanged: renderRoster,
    onSnapshot: (snapshot: { state: GameState }) => {
      state = snapshot.state;
      render();
      persistSession();
    },
    onAssignedPlayer: (playerId: string | undefined) => {
      assignedPlayer = playerId;
      appendLog(`Assigned local player: ${playerId ? formatPlayer(playerId) : "(none)"}`);
      render();
      persistSession();
    },
    onSuitMetaChanged: (suitMeta: Record<string, SuitMeta>) => {
      updateSuitLabels(suitMeta);
      render();
      persistSession();
    },
    onSetupChanged: (setup: SetupConfig) => {
      maxThreeEnabled = setup.initialSuitMax === 3;
      allOrNothingEnabled = setup.allOrNothing === true;
      drawPileEnabled = setup.drawPile === true;
      render();
      persistSession();
    },
    onGameStarted: (started: boolean) => {
      gameStarted = started;
      appendLog(`Game started=${started}`);
      if (!started) {
        setDepartureNotice("");
      }
      if (started) {
        setScreen("game");
      } else {
        setScreen("waiting");
      }
      render();
      persistSession();
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
  currentRole = undefined;
  assignedPlayer = undefined;
  gameStarted = false;
  maxThreeEnabled = false;
  allOrNothingEnabled = false;
  drawPileEnabled = false;
  if (waitingRoster) {
    waitingRoster.innerHTML = "<li class=\"roster-item\">No connected players yet.</li>";
  }
  currentRoomCode = "";
  if (shareRoomLink) {
    shareRoomLink.value = "";
  }
  if (shareRoomBtn) {
    shareRoomBtn.disabled = true;
  }
  if (maxThreeToggle) {
    maxThreeToggle.checked = false;
  }
  if (allOrNothingToggle) {
    allOrNothingToggle.checked = false;
  }
  if (drawPileToggle) {
    drawPileToggle.checked = false;
  }
  clearEventLog();
  setDepartureNotice("");
  setScreen("landing");
}

function setScreen(target: "landing" | "waiting" | "game"): void {
  if (!screenLanding || !screenWaiting || !screenGame) {
    return;
  }
  statusRoot.hidden = target !== "game";
  if (headerSubtitle) {
    headerSubtitle.hidden = target === "game";
  }
  if (modeSwitchLink) {
    modeSwitchLink.hidden = target !== "landing";
  }
  if (sessionActions) {
    sessionActions.hidden = target === "landing";
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
  currentRoomCode = code;
  if (waitingRoomCode) {
    waitingRoomCode.textContent = code;
  }
  if (gameRoomCode) {
    gameRoomCode.textContent = code;
  }
  if (shareRoomLink) {
    const url = new URL(window.location.href);
    url.searchParams.set("room", code);
    shareRoomLink.value = url.toString();
  }
  if (shareRoomBtn) {
    shareRoomBtn.disabled = !code;
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
  resume?: {
    clientId?: string;
    snapshot?: GameState;
    sessionSeq?: number;
    started?: boolean;
    suitMeta?: Record<string, SuitMeta>;
    seatClaims?: Array<{ clientId: string; playerId: string; expiresAt: number; label: string }>;
  };
}): Promise<void> {
  clearErrors();
  closeSession();
  clearEventLog();

  currentRole = options.role;
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
    hostTransport.onDebugLog?.(appendLog);
    hostTransport.onReady((id) => {
      setWaitingRoomCode(id);
      appendLog(`Host code ready: ${id}`);
    });
    hostSession = createHostSession(roomConfig, sessionHooks(), {
      transport: hostTransport,
      displayName,
      clientId: options.resume?.clientId,
      initialState: options.resume?.snapshot,
      sessionSeq: options.resume?.sessionSeq,
      started: options.resume?.started,
      suitMeta: options.resume?.suitMeta,
      seatClaims: options.resume?.seatClaims
    });
    appendLog("Host session initialized (PeerJS Cloud).");
  } else {
    peerTransport = new PeerPeerJsTransport(hostCode, localPeerId);
    peerTransport.onDebugLog?.(appendLog);
    peerTransport.onReady((id) => {
      appendLog(`Peer ID ready: ${id}`);
    });
    peerSession = createPeerSession(sessionHooks(), {
      transport: peerTransport,
      displayName,
      clientId: options.resume?.clientId
    });
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

const suitOverlayController = createSuitOverlayController<Move>({
  overlay: suitOverlay,
  labelEl: suitOverlayLabel,
  nameInput: suitNameInput,
  symbolInput: suitSymbolInput,
  colorInput: suitColorInput,
  saveBtn: suitSaveBtn,
  cancelBtn: suitCancelBtn,
  suggestionsRoot: emojiSuggestions,
  formatSuit,
  getMeta: getSuitMeta,
  getDefaultColor: defaultSuitColor,
  onSave: (suitId, meta, move) => {
    submitSuitMeta(suitId, meta);
    if (move) {
      submitMove(move);
    }
  }
});

bindInfoOverlay({
  infoBtn,
  infoOverlay,
  infoCloseBtn,
  infoContent,
  mode: "multiplayer"
});

if (hostBtn && friendlyNameInput) {
  hostBtn.addEventListener("click", () => {
    const name = friendlyNameInput.value.trim() || "Player";
    const hostCode = randomHostCode();
    clearErrors();
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
    clearErrors();
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

if (waitingStartGameBtn) {
  waitingStartGameBtn.addEventListener("click", () => {
    if (!hostSession) {
      setSessionError("Only the host can start the game.");
      return;
    }
    clearErrors();
    hostSession.startGame(buildConfig(MAX_PLAYERS));
  });
}

if (maxThreeToggle) {
  maxThreeToggle.addEventListener("change", () => {
    if (syncingMaxThreeToggle) {
      return;
    }
    if (!hostSession) {
      maxThreeToggle.checked = maxThreeEnabled;
      return;
    }
    if (maxThreeEnabled === maxThreeToggle.checked) {
      return;
    }
    maxThreeEnabled = maxThreeToggle.checked;
    hostSession.updateSetup(buildConfig(MAX_PLAYERS));
    render();
  });
}

if (allOrNothingToggle) {
  allOrNothingToggle.addEventListener("change", () => {
    if (syncingMaxThreeToggle) {
      return;
    }
    if (!hostSession) {
      allOrNothingToggle.checked = allOrNothingEnabled;
      return;
    }
    if (allOrNothingEnabled === allOrNothingToggle.checked) {
      return;
    }
    allOrNothingEnabled = allOrNothingToggle.checked;
    hostSession.updateSetup(buildConfig(MAX_PLAYERS));
    render();
  });
}

if (drawPileToggle) {
  drawPileToggle.addEventListener("change", () => {
    if (syncingMaxThreeToggle) {
      return;
    }
    if (!hostSession) {
      drawPileToggle.checked = drawPileEnabled;
      return;
    }
    if (drawPileEnabled === drawPileToggle.checked) {
      return;
    }
    drawPileEnabled = drawPileToggle.checked;
    hostSession.updateSetup(buildConfig(MAX_PLAYERS));
    render();
  });
}

if (playAgainBtn) {
  playAgainBtn.addEventListener("click", () => {
    if (!hostSession) {
      setSessionError("Only the host can restart the game.");
      return;
    }
    hostSession.restartGame(buildConfig(MAX_PLAYERS));
  });
}

if (leaveGameBtn) {
  leaveGameBtn.addEventListener("click", () => {
    if (peerSession) {
      clearErrors();
      peerSession.leaveGame();
      clearStoredSession();
      closeSession();
      return;
    }
    if (hostSession) {
      clearErrors();
      clearStoredSession();
      closeSession();
      return;
    }
    const inSessionScreen =
      screenWaiting?.classList.contains("active") === true || screenGame?.classList.contains("active") === true;
    if (currentRole || inSessionScreen || Boolean(currentRoomCode)) {
      clearErrors();
      clearStoredSession();
      closeSession();
      return;
    }
    setSessionError("No active game to leave.");
  });
}

if (shareRoomBtn && shareRoomLink) {
  shareRoomBtn.addEventListener("click", () => {
    const link = shareRoomLink.value.trim();
    if (!link) {
      setSessionError("Room link is not ready yet.");
      return;
    }
    const nav = typeof navigator === "undefined" ? undefined : navigator;
    if (nav?.share) {
      void nav.share({ title: "Quantum Go Fish", text: "Join my room:", url: link }).catch(() => {
        // User canceled share; no action needed.
      });
      return;
    }
    if (nav?.clipboard?.writeText) {
      nav.clipboard
        .writeText(link)
        .then(() => appendLog("Room link copied to clipboard."))
        .catch(() => {
          shareRoomLink.focus();
          shareRoomLink.select();
          setSessionError("Copy failed. Please copy the link manually.");
        });
      return;
    }
    shareRoomLink.focus();
    shareRoomLink.select();
    setSessionError("Sharing unavailable. Please copy the link manually.");
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
  const move: Move = { kind: "Ask", asker: assignedPlayer, target, suit };
  const meta = getSuitMeta(suit);
  if (!meta) {
    suitOverlayController.open(suit, move);
    return;
  }
  submitMove(move);
});

askTarget.addEventListener("change", () => {
  render();
});

yesBtn.addEventListener("click", () => {
  const pending = state.turnState.pendingAsk;
  if (!pending) {
    setMoveError("No pending ask.");
    return;
  }
  const move: Move = { kind: "AnswerYes", target: pending.target, suit: pending.suit };
  if (state.allOrNothing) {
    const count = yesCount ? Number.parseInt(yesCount.value, 10) : Number.NaN;
    if (!Number.isInteger(count)) {
      setMoveError("Select the exact count to transfer.");
      return;
    }
    move.count = count;
  }
  submitMove(move);
});

noBtn.addEventListener("click", () => {
  const pending = state.turnState.pendingAsk;
  if (!pending) {
    setMoveError("No pending ask.");
    return;
  }
  submitMove({ kind: "AnswerNo", target: pending.target, suit: pending.suit });
});

const roomParam = new URLSearchParams(window.location.search).get("room");
if (roomParam && roomCodeInput) {
  roomCodeInput.value = roomParam;
}

if (ENABLE_SESSION_RESTORE) {
  const RESUME_WINDOW_MS = 2 * 60 * 1000;
  const storedSession = loadStoredSession();
  if (storedSession) {
    const lastSeen = Number(storedSession.lastSeen ?? 0);
    const hostCode = String(storedSession.hostCode ?? "");
    const displayName = String(storedSession.displayName ?? "Player");
    const role = storedSession.role === "host" ? "host" : storedSession.role === "peer" ? "peer" : undefined;
    if (role && hostCode && Date.now() - lastSeen <= RESUME_WINDOW_MS) {
      if (roomCodeInput && role === "peer") {
        roomCodeInput.value = hostCode;
      }
      void initSession({
        role,
        hostCode,
        localPeerId: role === "host" ? hostCode : randomPeerId(),
        displayName,
        resume: {
          clientId: typeof storedSession.clientId === "string" ? storedSession.clientId : undefined,
          snapshot: storedSession.snapshot as GameState | undefined,
          sessionSeq: typeof storedSession.sessionSeq === "number" ? storedSession.sessionSeq : undefined,
          started: Boolean(storedSession.started),
          suitMeta: storedSession.suitMeta as Record<string, SuitMeta> | undefined,
          seatClaims: storedSession.seatClaims as Array<{
            clientId: string;
            playerId: string;
            expiresAt: number;
            label: string;
          }> | undefined
        }
      }).catch((error) => {
        setSessionError(error instanceof Error ? error.message : String(error));
      });
    }
  }
}

window.addEventListener("beforeunload", () => {
  persistSession();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    persistSession();
  }
});

setScreen("landing");
render();
