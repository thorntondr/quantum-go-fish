import { createInitialState } from "../engine/state.js";
import { applyMove } from "../engine/moves.js";
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

type SuitMeta = { name?: string; symbol?: string; color?: string };

const OKABE_ITO = ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7", "#000000"];
const statusRoot = requireEl("status");
const turnActionNotice = getEl("turnActionNotice");
const pendingAskNotice = getEl("pendingAskNotice");
const errorRoot = requireEl("error");
const stateRoot = requireEl("state");
const rosterInput = requireEl("rosterInput") as HTMLTextAreaElement;
const startBtn = requireEl("startBtn") as HTMLButtonElement;
const askTarget = requireEl("askTarget") as HTMLSelectElement;
const askSuit = requireEl("askSuit") as HTMLSelectElement;
const askBtn = requireEl("askBtn") as HTMLButtonElement;
const yesBtn = requireEl("yesBtn") as HTMLButtonElement;
const noBtn = requireEl("noBtn") as HTMLButtonElement;
const infoBtn = getEl("infoBtn") as HTMLButtonElement | null;

const suitOverlay = getEl("suitOverlay");
const suitOverlayLabel = getEl("suitOverlayLabel");
const suitNameInput = getEl("suitNameInput") as HTMLInputElement | null;
const suitSymbolInput = getEl("suitSymbolInput") as HTMLInputElement | null;
const suitColorInput = getEl("suitColorInput") as HTMLInputElement | null;
const suitSaveBtn = getEl("suitSaveBtn") as HTMLButtonElement | null;
const suitCancelBtn = getEl("suitCancelBtn") as HTMLButtonElement | null;
const emojiSuggestions = getEl("emojiSuggestions");
const infoOverlay = getEl("infoOverlay");
const infoCloseBtn = getEl("infoCloseBtn") as HTMLButtonElement | null;
const infoContent = getEl("infoContent");

let state: GameState | undefined;
let suitMetaById = new Map<string, SuitMeta>();
let viewPlayerId: string | undefined;
let selectedAskTarget: string | undefined;

function setError(message: string): void {
  errorRoot.textContent = message;
}

function clearError(): void {
  setError("");
}

function defaultSuitColor(suitId: string, suits: string[]): string {
  const index = Math.max(0, suits.indexOf(suitId));
  return OKABE_ITO[index % OKABE_ITO.length];
}

function getSuitMeta(suitId: string): SuitMeta | undefined {
  return suitMetaById.get(suitId);
}

function formatSuit(suitId: string): string {
  return suitMetaById.get(suitId)?.name ?? suitId;
}

function formatPlayer(playerId: string): string {
  return playerId;
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
  pendingAskNotice.textContent = `${pending.asker} is asking ${pending.target} about ${formatSuit(pending.suit)}.`;
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
  const pending = current.turnState.pendingAsk;
  if (pending) {
    turnActionNotice.textContent = `${formatPlayer(pending.target)}'s turn to answer.`;
    turnActionNotice.hidden = false;
    return;
  }
  turnActionNotice.textContent = `${formatPlayer(current.turnState.currentPlayer)}'s turn to ask.`;
  turnActionNotice.hidden = false;
}

function updateSuitMeta(suitId: string, meta: SuitMeta): void {
  if (suitMetaById.has(suitId)) {
    return;
  }
  const name = meta.name?.trim();
  const symbol = meta.symbol?.trim() || (name ? extractEmoji(name) : undefined);
  const color = meta.color?.trim();
  const normalized: SuitMeta = {};
  if (name) {
    normalized.name = name;
  }
  if (symbol) {
    normalized.symbol = symbol;
  }
  if (color) {
    normalized.color = color;
  }
  if (Object.keys(normalized).length === 0) {
    return;
  }
  suitMetaById.set(suitId, normalized);
}

function randomStartingPlayer(players: string[]): string {
  const index = Math.floor(Math.random() * players.length);
  return players[index] ?? players[0];
}

function buildConfig(players: string[]): SetupConfig {
  const suits = Array.from({ length: players.length }, (_, i) => `S${i + 1}`);
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
    startingPlayer: randomStartingPlayer(players)
  };
}

function parseRoster(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
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

function submitMove(move: Move): void {
  if (!state) {
    return;
  }
  const legality = isLegalMove(state, move);
  if (!legality.ok) {
    setError(legality.reason);
    return;
  }
  clearError();
  state = applyMove(state, move);
  render();
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
  getDefaultColor: (suitId) => defaultSuitColor(suitId, state?.suits ?? []),
  onSave: (suitId, meta, move) => {
    updateSuitMeta(suitId, meta);
    if (move) {
      submitMove(move);
    } else {
      render();
    }
  }
});

bindInfoOverlay({
  infoBtn,
  infoOverlay,
  infoCloseBtn,
  infoContent,
  mode: "single-device"
});

function refreshControls(current: GameState): void {
  const pending = current.turnState.pendingAsk;
  const currentPlayer = current.turnState.currentPlayer;
  const askMoves = legalAsks(current, currentPlayer);
  const targets = [...new Set(askMoves.map((m) => m.target))];
  const selectedTarget =
    targets.includes(askTarget.value) && askTarget.value ? askTarget.value : (targets[0] ?? "");
  askTarget.innerHTML = targets.map((target) => `<option value="${target}">${target}</option>`).join("");
  askTarget.value = selectedTarget;
  const askEnabled = !pending && askMoves.length > 0;
  selectedAskTarget = askEnabled ? selectedTarget : undefined;

  const suits = askMoves.filter((m) => m.target === selectedTarget).map((m) => m.suit);
  askSuit.innerHTML = suits.map((suit) => `<option value="${suit}">${formatSuit(suit)}</option>`).join("");
  askSuit.value = suits[0] ?? "";

  askTarget.disabled = !askEnabled;
  askSuit.disabled = !askEnabled;
  askBtn.disabled = !askEnabled;

  const answers = legalAnswerMoves(current);
  yesBtn.disabled = !answers.yes;
  noBtn.disabled = !answers.no;
}

function render(): void {
  if (!state) {
    if (turnActionNotice) {
      turnActionNotice.textContent = "";
      turnActionNotice.hidden = true;
    }
    if (pendingAskNotice) {
      pendingAskNotice.textContent = "";
      pendingAskNotice.hidden = true;
    }
    return;
  }
  if (state.turnState.pendingAsk) {
    viewPlayerId = state.turnState.pendingAsk.target;
  } else {
    viewPlayerId = state.turnState.currentPlayer;
  }
  const statusText = `Viewing: ${viewPlayerId ?? "-"}.`;

  refreshControls(state);
  renderState(
    { stateRoot, statusRoot },
    state,
    {
      formatPlayer,
      formatSuit,
      getSuitMeta,
      localPlayerId: viewPlayerId,
      highlightedPlayerId: selectedAskTarget,
      statusText
    }
  );
  refreshTurnActionNotice(state);
  refreshPendingAskNotice(state);
}

startBtn.addEventListener("click", () => {
  const roster = parseRoster(rosterInput.value);
  if (roster.length < 2) {
    setError("Enter at least two player names.");
    return;
  }
  clearError();
  suitMetaById = new Map();
  state = createInitialState(buildConfig(roster));
  render();
});

askBtn.addEventListener("click", () => {
  if (!state) {
    setError("Start a game first.");
    return;
  }
  const target = askTarget.value;
  const suit = askSuit.value;
  const asker = state.turnState.currentPlayer;
  if (!target || !suit) {
    setError("Select a target and suit.");
    return;
  }
  const move: Move = { kind: "Ask", asker, target, suit };
  if (!getSuitMeta(suit)) {
    suitOverlayController.open(suit, move);
    return;
  }
  submitMove(move);
});

askTarget.addEventListener("change", () => {
  render();
});

yesBtn.addEventListener("click", () => {
  if (!state || !state.turnState.pendingAsk) {
    return;
  }
  submitMove({ kind: "AnswerYes", target: state.turnState.pendingAsk.target, suit: state.turnState.pendingAsk.suit });
});

noBtn.addEventListener("click", () => {
  if (!state || !state.turnState.pendingAsk) {
    return;
  }
  submitMove({ kind: "AnswerNo", target: state.turnState.pendingAsk.target, suit: state.turnState.pendingAsk.suit });
});

render();
