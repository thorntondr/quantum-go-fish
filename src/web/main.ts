import { createInitialState } from "../engine/state.js";
import { isLegalMove } from "../engine/rules.js";
import type { GameState, Move, SetupConfig } from "../engine/types.js";
import { renderState, submitMove } from "../ui/interaction.js";

const stateRoot = byId("state");
const statusRoot = byId("status");
const errorRoot = byId("error");
const playerCountInput = byId("playerCount") as HTMLInputElement;
const askTarget = byId("askTarget") as HTMLSelectElement;
const askSuit = byId("askSuit") as HTMLSelectElement;
const askBtn = byId("askBtn") as HTMLButtonElement;
const yesBtn = byId("yesBtn") as HTMLButtonElement;
const noBtn = byId("noBtn") as HTMLButtonElement;
const newGameBtn = byId("newGameBtn") as HTMLButtonElement;
const legalMoves = byId("legalMoves");

let state = createInitialState(buildConfig(3));

function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing required element: #${id}`);
  }
  return node;
}

function setError(message: string): void {
  errorRoot.textContent = message;
}

function clearError(): void {
  setError("");
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
  for (const suit of suits) {
    suitTotals[suit] = 4;
  }

  const handSizes: Record<string, number> = {};
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

function parsePlayerCount(): number | undefined {
  const n = Number.parseInt(playerCountInput.value, 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) {
    return undefined;
  }
  if (n < 2 || n > 12) {
    return undefined;
  }
  return n;
}

function legalAsks(current: GameState): Move[] {
  const asker = current.turnState.currentPlayer;
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

  const asks = legalAsks(current);
  if (asks.length === 0) {
    legalMoves.textContent = "No legal asks.";
    return;
  }
  legalMoves.textContent = asks.map((m) => `ask ${m.target} ${m.suit}`).join("\n");
}

function refreshControls(current: GameState): void {
  const gameOver = current.turnState.phase === "GameOver";
  const pending = current.turnState.pendingAsk;

  const askMoves = legalAsks(current);
  const targets = [...new Set(askMoves.map((m) => m.target))];
  const selectedTarget =
    targets.includes(askTarget.value) && askTarget.value ? askTarget.value : (targets[0] ?? "");

  askTarget.innerHTML = targets.map((target) => `<option value="${target}">${target}</option>`).join("");
  askTarget.value = selectedTarget;

  const suits = askMoves.filter((m) => m.target === selectedTarget).map((m) => m.suit);
  askSuit.innerHTML = suits.map((suit) => `<option value="${suit}">${suit}</option>`).join("");
  askSuit.value = suits[0] ?? "";

  const answers = legalAnswerMoves(current);
  const canAsk = !gameOver && !pending && askMoves.length > 0;
  const canYes = !gameOver && !!pending && answers.yes;
  const canNo = !gameOver && !!pending && answers.no;

  askTarget.disabled = !canAsk;
  askSuit.disabled = !canAsk;
  askBtn.disabled = !canAsk;
  yesBtn.disabled = !canYes;
  noBtn.disabled = !canNo;
}

function render(): void {
  renderState({ stateRoot, statusRoot }, state);
  renderLegalMoves(state);
  refreshControls(state);
}

function apply(move: Move): void {
  try {
    state = submitMove(state, move);
    clearError();
    render();
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  }
}

askBtn.addEventListener("click", () => {
  const target = askTarget.value;
  const suit = askSuit.value;
  if (!target || !suit) {
    setError("Select a valid target and suit.");
    return;
  }
  apply({
    kind: "Ask",
    asker: state.turnState.currentPlayer,
    target,
    suit
  });
});

yesBtn.addEventListener("click", () => {
  const pending = state.turnState.pendingAsk;
  if (!pending) {
    setError("No pending ask to answer.");
    return;
  }
  apply({ kind: "AnswerYes", target: pending.target, suit: pending.suit });
});

noBtn.addEventListener("click", () => {
  const pending = state.turnState.pendingAsk;
  if (!pending) {
    setError("No pending ask to answer.");
    return;
  }
  apply({ kind: "AnswerNo", target: pending.target, suit: pending.suit });
});

newGameBtn.addEventListener("click", () => {
  const playerCount = parsePlayerCount();
  if (!playerCount) {
    setError("Player count must be an integer from 2 to 12.");
    return;
  }

  state = createInitialState(buildConfig(playerCount));
  clearError();
  render();
});

render();
