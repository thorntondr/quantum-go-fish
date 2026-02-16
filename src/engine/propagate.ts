import { cloneState } from "./state.js";
import type { GameState } from "./types.js";

function tightenPlayerBounds(state: GameState, player: string, suit: string): boolean {
  const handSize = state.handSizes[player];
  const minOthers = state.suits
    .filter((s) => s !== suit)
    .reduce((acc, s) => acc + state.min[player][s], 0);
  const maxOthers = state.suits
    .filter((s) => s !== suit)
    .reduce((acc, s) => acc + state.max[player][s], 0);

  const newMax = Math.max(0, Math.min(state.max[player][suit], handSize - minOthers));
  const newMin = Math.min(state.suitTotals[suit], Math.max(state.min[player][suit], handSize - maxOthers));

  let changed = false;
  if (newMax !== state.max[player][suit]) {
    state.max[player][suit] = newMax;
    changed = true;
  }
  if (newMin !== state.min[player][suit]) {
    state.min[player][suit] = newMin;
    changed = true;
  }
  return changed;
}

function tightenSuitBounds(state: GameState, player: string, suit: string): boolean {
  const total = state.suitTotals[suit];
  const minOthers = state.players
    .filter((p) => p !== player)
    .reduce((acc, p) => acc + state.min[p][suit], 0);
  const maxOthers = state.players
    .filter((p) => p !== player)
    .reduce((acc, p) => acc + state.max[p][suit], 0);

  const newMax = Math.max(0, Math.min(state.max[player][suit], total - minOthers));
  const newMin = Math.min(total, Math.max(state.min[player][suit], total - maxOthers));

  let changed = false;
  if (newMax !== state.max[player][suit]) {
    state.max[player][suit] = newMax;
    changed = true;
  }
  if (newMin !== state.min[player][suit]) {
    state.min[player][suit] = newMin;
    changed = true;
  }
  return changed;
}

export function propagate(input: GameState): GameState {
  const state = cloneState(input);

  let changed: boolean;
  let loopGuard = 0;
  do {
    changed = false;
    for (const player of state.players) {
      for (const suit of state.suits) {
        if (tightenPlayerBounds(state, player, suit)) {
          changed = true;
        }
      }
    }

    for (const suit of state.suits) {
      for (const player of state.players) {
        if (tightenSuitBounds(state, player, suit)) {
          changed = true;
        }
      }
    }

    loopGuard += 1;
    if (loopGuard > 1024) {
      throw new Error("Propagation did not converge within loop guard.");
    }
  } while (changed);

  return state;
}
