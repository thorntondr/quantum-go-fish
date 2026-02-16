import type { GameState } from "./types.js";

export function assertInvariants(state: GameState): void {
  for (const player of state.players) {
    let minSum = 0;
    let maxSum = 0;

    for (const suit of state.suits) {
      const minValue = state.min[player][suit];
      const maxValue = state.max[player][suit];

      if (minValue < 0) {
        throw new Error(`Invariant violated: min < 0 for ${player}/${suit}`);
      }
      if (minValue > maxValue) {
        throw new Error(`Invariant violated: min > max for ${player}/${suit}`);
      }
      if (maxValue > state.suitTotals[suit]) {
        throw new Error(`Invariant violated: max exceeds suit total for ${player}/${suit}`);
      }

      minSum += minValue;
      maxSum += maxValue;
    }

    const handSize = state.handSizes[player];
    if (minSum > handSize) {
      throw new Error(`Invariant violated: player min sum exceeds hand size for ${player}`);
    }
    if (maxSum < handSize) {
      throw new Error(`Invariant violated: player max sum below hand size for ${player}`);
    }
  }

  for (const suit of state.suits) {
    let minSuitSum = 0;
    let maxSuitSum = 0;

    for (const player of state.players) {
      minSuitSum += state.min[player][suit];
      maxSuitSum += state.max[player][suit];
    }

    const suitTotal = state.suitTotals[suit];
    if (minSuitSum > suitTotal) {
      throw new Error(`Invariant violated: suit min sum exceeds total for ${suit}`);
    }
    if (maxSuitSum < suitTotal) {
      throw new Error(`Invariant violated: suit max sum below total for ${suit}`);
    }
  }

  const knownHandTotal = state.players.reduce((acc, player) => acc + state.handSizes[player], 0);
  const knownSuitTotal = state.suits.reduce((acc, suit) => acc + state.suitTotals[suit], 0);
  if (knownHandTotal !== knownSuitTotal) {
    throw new Error(
      `Invariant violated: hand total (${knownHandTotal}) does not match suit total (${knownSuitTotal})`
    );
  }
}
