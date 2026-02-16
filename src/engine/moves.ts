import { assertInvariants } from "./invariants.js";
import { propagate } from "./propagate.js";
import { isLegalMove } from "./rules.js";
import { cloneState } from "./state.js";
import type { GameState, Move } from "./types.js";

function nextPlayer(state: GameState, current: string): string {
  const idx = state.players.indexOf(current);
  const next = (idx + 1) % state.players.length;
  return state.players[next];
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
    propagated.turnState.phase = "AwaitingAnswer";
    propagated.turnState.currentPlayer = move.asker;

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
  propagated.turnState.phase = "NextTurn";
  propagated.turnState.currentPlayer = nextPlayer(propagated, asker);
  propagated.turnState.phase = "Idle";

  assertInvariants(propagated);
  return propagated;
}
