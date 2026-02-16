import { assertInvariants } from "../engine/invariants.js";
import type { GameState } from "../engine/types.js";

interface SerializedPayload {
  schemaVersion: number;
  gameState: GameState;
}

export function serialize(state: GameState): string {
  assertInvariants(state);
  const payload: SerializedPayload = {
    schemaVersion: 1,
    gameState: state
  };
  return JSON.stringify(payload, null, 2);
}

export function deserialize(payload: string): GameState {
  const parsed = JSON.parse(payload) as SerializedPayload;
  if (parsed.schemaVersion !== 1) {
    throw new Error(`Unsupported schema version: ${parsed.schemaVersion}`);
  }
  assertInvariants(parsed.gameState);
  return parsed.gameState;
}
