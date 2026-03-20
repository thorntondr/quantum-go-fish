import { assertInvariants } from "./invariants.js";
import { propagate } from "./propagate.js";
import { isLegalMove } from "./rules.js";
import { cloneState } from "./state.js";
import type { GameState, Move } from "./types.js";
import type { WinReason } from "./types.js";

function activePlayers(state: GameState): string[] {
  return state.players.filter((player) => !state.inactivePlayers.includes(player) && state.handSizes[player] > 0);
}

function nextPlayer(state: GameState, current: string): string {
  const players = state.players;
  const idx = players.indexOf(current);
  for (let i = 1; i <= players.length; i += 1) {
    const candidate = players[(idx + i) % players.length];
    if (!state.inactivePlayers.includes(candidate) && state.handSizes[candidate] > 0) {
      return candidate;
    }
  }
  return current;
}

function turnOrderFrom(state: GameState, startPlayer: string): string[] {
  const startIndex = state.players.indexOf(startPlayer);
  if (startIndex === -1) {
    return [...state.players];
  }
  return [...state.players.slice(startIndex), ...state.players.slice(0, startIndex)];
}

function detectGuaranteedSetWinner(state: GameState, startPlayer: string): string | undefined {
  const ordered = turnOrderFrom(state, startPlayer).filter(
    (player) => !state.inactivePlayers.includes(player) && state.handSizes[player] > 0
  );
  for (const player of ordered) {
    const hasFourOfSuit = state.suits.some((suit) => state.min[player][suit] >= 4);
    if (hasFourOfSuit) {
      return player;
    }
  }
  return undefined;
}

function detectWin(state: GameState, startPlayer: string): { winner: string; reason: WinReason } | undefined {
  if (activePlayers(state).length < 2) {
    const winner = activePlayers(state)[0] ?? startPlayer;
    return { winner, reason: "NotEnoughPlayers" };
  }

  const guaranteedWinner = detectGuaranteedSetWinner(state, startPlayer);
  if (guaranteedWinner) {
    return { winner: guaranteedWinner, reason: "GuaranteedFourOfSuit" };
  }

  const allCardsKnown = activePlayers(state).every((player) =>
    state.suits.every((suit) => state.min[player][suit] === state.max[player][suit])
  );
  if (allCardsKnown) {
    return { winner: startPlayer, reason: "AllCardsKnown" };
  }
  return undefined;
}

function finalizeAsGameOver(state: GameState, winner: string, reason: WinReason): void {
  state.turnState.pendingAsk = undefined;
  state.turnState.currentPlayer = winner;
  state.turnState.phase = "GameOver";
  state.turnState.winner = winner;
  state.turnState.winReason = reason;
}

export function applyMove(input: GameState, move: Move): GameState {
  assertInvariants(input);

  const legality = isLegalMove(input, move);
  if (!legality.ok) {
    throw new Error(legality.reason);
  }

  const state = cloneState(input);

  if (move.kind === "Ask") {
    state.turnState.phase = "Asking";
    state.min[move.asker][move.suit] = Math.max(state.min[move.asker][move.suit], 1);
    state.turnState.pendingAsk = {
      asker: move.asker,
      target: move.target,
      suit: move.suit
    };
    state.turnState.phase = "Propagating";

    const propagated = propagate(state);
    const askWin = detectWin(propagated, move.asker);
    if (askWin) {
      finalizeAsGameOver(propagated, askWin.winner, askWin.reason);
    } else {
      propagated.turnState.phase = "AwaitingAnswer";
      propagated.turnState.currentPlayer = move.asker;
      propagated.turnState.winner = undefined;
      propagated.turnState.winReason = undefined;
    }

    assertInvariants(propagated);
    return propagated;
  }

  const pending = state.turnState.pendingAsk;
  if (!pending) {
    throw new Error("Internal error: missing pending ask.");
  }

  state.turnState.phase = "Resolving";
  const asker = pending.asker;
  const target = pending.target;
  const suit = pending.suit;

  if (move.kind === "AnswerYes") {
    state.min[target][suit] = Math.max(state.min[target][suit], 1);

    state.handSizes[asker] += 1;
    state.handSizes[target] -= 1;

    state.min[asker][suit] += 1;
    state.max[asker][suit] += 1;

    state.min[target][suit] = Math.max(0, state.min[target][suit] - 1);
    state.max[target][suit] = Math.max(0, state.max[target][suit] - 1);
  } else {
    state.max[target][suit] = 0;
  }

  state.turnState.pendingAsk = undefined;
  state.turnState.phase = "Propagating";

  const propagated = propagate(state);
  const answerWin = detectWin(propagated, asker);
  if (answerWin) {
    finalizeAsGameOver(propagated, answerWin.winner, answerWin.reason);
  } else {
    propagated.turnState.phase = "NextTurn";
    propagated.turnState.currentPlayer = nextPlayer(propagated, asker);
    propagated.turnState.phase = "Idle";
    propagated.turnState.winner = undefined;
    propagated.turnState.winReason = undefined;
  }

  assertInvariants(propagated);
  return propagated;
}
