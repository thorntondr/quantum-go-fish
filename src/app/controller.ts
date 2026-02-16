import { applyMove } from "../engine/moves.js";
import type { GameState, Move } from "../engine/types.js";

export function dispatchMove(state: GameState, move: Move): GameState {
  return applyMove(state, move);
}
