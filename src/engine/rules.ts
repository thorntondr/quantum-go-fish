import type { GameState, Move } from "./types.js";
import type { LegalResult } from "./types.js";

function isKnownPlayer(state: GameState, player: string): boolean {
  return state.players.includes(player);
}

function isKnownSuit(state: GameState, suit: string): boolean {
  return state.suits.includes(suit);
}

export function isLegalMove(state: GameState, move: Move): LegalResult {
  if (move.kind === "Ask") {
    if (!isKnownPlayer(state, move.asker) || !isKnownPlayer(state, move.target)) {
      return { ok: false, reason: "Unknown player in Ask move." };
    }
    if (move.asker === move.target) {
      return { ok: false, reason: "Player cannot ask themselves." };
    }
    if (!isKnownSuit(state, move.suit)) {
      return { ok: false, reason: "Unknown suit in Ask move." };
    }
    if (state.turnState.pendingAsk) {
      return { ok: false, reason: "Cannot Ask while waiting for answer." };
    }
    if (state.turnState.currentPlayer !== move.asker) {
      return { ok: false, reason: "Only current player may Ask." };
    }
    if (state.max[move.asker][move.suit] <= 0) {
      return { ok: false, reason: "Ask illegal: asker has no possibility for suit." };
    }
    return { ok: true };
  }

  if (!state.turnState.pendingAsk) {
    return { ok: false, reason: "Answer move illegal: no pending ask." };
  }

  const pending = state.turnState.pendingAsk;
  if (move.target !== pending.target) {
    return { ok: false, reason: "Answer move target does not match pending ask target." };
  }
  if (move.suit !== pending.suit) {
    return { ok: false, reason: "Answer move suit does not match pending ask suit." };
  }

  if (move.kind === "AnswerYes") {
    if (state.max[move.target][move.suit] <= 0) {
      return { ok: false, reason: "AnswerYes illegal: target cannot have asked suit." };
    }
    return { ok: true };
  }

  if (move.kind === "AnswerNo") {
    if (state.min[move.target][move.suit] !== 0) {
      return { ok: false, reason: "AnswerNo illegal: target must be guaranteed zero cards in suit." };
    }
    return { ok: true };
  }

  return { ok: false, reason: "Unsupported move kind." };
}
