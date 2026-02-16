import { createInitialState } from "../src/engine/state.js";
import type { GameState, Move, SetupConfig } from "../src/engine/types.js";

export const baseConfig: SetupConfig = {
  players: ["A", "B", "C"],
  suits: ["S", "H", "D"],
  suitTotals: { S: 4, H: 4, D: 4 },
  handSizes: { A: 4, B: 4, C: 4 },
  startingPlayer: "A"
};

export function makeState(): GameState {
  return createInitialState(baseConfig);
}

export function legalMovesForState(state: GameState): Move[] {
  if (state.turnState.pendingAsk) {
    const pending = state.turnState.pendingAsk;
    return [
      { kind: "AnswerYes", target: pending.target, suit: pending.suit },
      { kind: "AnswerNo", target: pending.target, suit: pending.suit }
    ];
  }

  const asker = state.turnState.currentPlayer;
  const candidates: Move[] = [];
  for (const target of state.players) {
    if (target === asker) {
      continue;
    }
    for (const suit of state.suits) {
      candidates.push({ kind: "Ask", asker, target, suit });
    }
  }
  return candidates;
}
