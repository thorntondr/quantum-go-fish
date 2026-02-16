import test from "node:test";
import assert from "node:assert/strict";
import { applyMove } from "../src/engine/moves.js";
import { assertInvariants } from "../src/engine/invariants.js";
import { isLegalMove } from "../src/engine/rules.js";
import { makeState, legalMovesForState } from "./helpers.js";
import type { Move } from "../src/engine/types.js";

function seededRandom(seed: number): () => number {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

test("Random legal sequences preserve invariants", () => {
  const random = seededRandom(1337);
  let state = makeState();

  for (let i = 0; i < 100; i += 1) {
    if (state.turnState.phase === "GameOver") {
      break;
    }

    const candidates = legalMovesForState(state);
    const legal = candidates.filter((move) => isLegalMove(state, move).ok) as Move[];
    assert.ok(legal.length > 0);

    const nextMove = legal[Math.floor(random() * legal.length)];
    state = applyMove(state, nextMove);
    assert.doesNotThrow(() => assertInvariants(state));
  }
});
