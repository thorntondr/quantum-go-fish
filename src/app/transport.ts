import { stateHash } from "./hash.js";
import type { ActionEnvelope, GameState } from "../engine/types.js";

export function createEnvelope(
  actor: string,
  sequence: number,
  state: GameState,
  move: ActionEnvelope["move"]
): ActionEnvelope {
  return {
    move,
    actor,
    sequence,
    stateHash: stateHash(state)
  };
}

export function diffState(prev: GameState, next: GameState): string[] {
  const diffs: string[] = [];
  for (const player of next.players) {
    for (const suit of next.suits) {
      if (prev.min[player][suit] !== next.min[player][suit]) {
        diffs.push(`min.${player}.${suit}: ${prev.min[player][suit]} -> ${next.min[player][suit]}`);
      }
      if (prev.max[player][suit] !== next.max[player][suit]) {
        diffs.push(`max.${player}.${suit}: ${prev.max[player][suit]} -> ${next.max[player][suit]}`);
      }
    }
    if (prev.handSizes[player] !== next.handSizes[player]) {
      diffs.push(`handSizes.${player}: ${prev.handSizes[player]} -> ${next.handSizes[player]}`);
    }
  }
  return diffs;
}
