import type { GameState, Move } from "./types.js";
import type { LegalResult } from "./types.js";

function isKnownPlayer(state: GameState, player: string): boolean {
  return state.players.includes(player);
}

function isKnownSuit(state: GameState, suit: string): boolean {
  return state.suits.includes(suit);
}

function isInactive(state: GameState, player: string): boolean {
  return state.inactivePlayers.includes(player);
}

export function isLegalMove(state: GameState, move: Move): LegalResult {
  if (state.turnState.phase === "GameOver" || state.turnState.winner) {
    return { ok: false, reason: "Game is already over." };
  }

  if (move.kind === "Ask") {
    if (!isKnownPlayer(state, move.asker) || !isKnownPlayer(state, move.target)) {
      return { ok: false, reason: "Unknown player in Ask move." };
    }
    if (isInactive(state, move.asker) || isInactive(state, move.target)) {
      return { ok: false, reason: "Ask illegal: inactive players may not ask or be asked." };
    }
    if (state.handSizes[move.asker] <= 0) {
      return { ok: false, reason: "Ask illegal: asker has no cards left." };
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
  if (isInactive(state, move.target)) {
    return { ok: false, reason: "Answer illegal: inactive player may not answer." };
  }

  if (move.kind === "AnswerYes") {
    if (state.max[move.target][move.suit] <= 0) {
      return { ok: false, reason: "AnswerYes illegal: target does not have asked suit." };
    }
    if (!state.allOrNothing) {
      if (move.count !== undefined && move.count !== 1) {
        return { ok: false, reason: "AnswerYes illegal: transfer count is only used with all-or-nothing enabled." };
      }
      return { ok: true };
    }

    const count = move.count;
    if (typeof count !== "number" || !Number.isInteger(count)) {
      return { ok: false, reason: "AnswerYes illegal: all-or-nothing requires an exact transfer count." };
    }
    if (count < state.min[move.target][move.suit] || count > state.max[move.target][move.suit]) {
      return {
        ok: false,
        reason: `AnswerYes illegal: transfer count must be between ${state.min[move.target][move.suit]} and ${state.max[move.target][move.suit]}.`
      };
    }
    return { ok: true };
  }

  if (move.kind === "AnswerNo") {
    if (state.min[move.target][move.suit] !== 0) {
      return { ok: false, reason: "AnswerNo illegal: target must not be guaranteed cards in suit." };
    }
    return { ok: true };
  }

  return { ok: false, reason: "Unsupported move." };
}
