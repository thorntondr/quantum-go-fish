import type { Move, TurnPhase } from "../engine/types.js";

const PHASE_ORDER: TurnPhase[] = [
  "Idle",
  "Asking",
  "AwaitingAnswer",
  "Resolving",
  "Propagating",
  "NextTurn",
  "GameOver"
];

export function expectedPhaseForMove(move: Move): TurnPhase {
  if (move.kind === "Ask") {
    return "Asking";
  }
  return "Resolving";
}

export function isValidPhaseTransition(from: TurnPhase, to: TurnPhase): boolean {
  const fromIndex = PHASE_ORDER.indexOf(from);
  const toIndex = PHASE_ORDER.indexOf(to);
  if (fromIndex === -1 || toIndex === -1) {
    return false;
  }
  if (to === "GameOver") {
    return true;
  }
  return toIndex >= fromIndex || (from === "NextTurn" && to === "Idle");
}
