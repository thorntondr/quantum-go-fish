import test from "node:test";
import assert from "node:assert/strict";
import { propagate } from "../src/engine/propagate.js";
import { createInitialState } from "../src/engine/state.js";
import { applyMove } from "../src/engine/moves.js";
import { isLegalMove } from "../src/engine/rules.js";
import type { Move, SetupConfig } from "../src/engine/types.js";
import { makeState } from "./helpers.js";

test("Propagation tightens per-player bounds from hand sizes", () => {
  const state = makeState();
  state.min.A.S = 4;
  state.handSizes.A = 4;

  const next = propagate(state);
  assert.equal(next.max.A.H, 0);
  assert.equal(next.max.A.D, 0);
});

test("Propagation tightens per-suit bounds from totals", () => {
  const state = makeState();
  state.min.A.S = 4;
  state.max.B.S = 4;
  state.max.C.S = 4;

  const next = propagate(state);
  assert.equal(next.max.B.S, 0);
  assert.equal(next.max.C.S, 0);
});

test("Propagation is idempotent", () => {
  const state = makeState();
  state.max.B.H = 0;
  const once = propagate(state);
  const twice = propagate(once);
  assert.deepEqual(twice, once);
});

test("Propagation tightens bounds to prevent globally inconsistent AnswerNo", () => {
  const config: SetupConfig = {
    players: ["A", "B", "C", "D"],
    suits: ["S1", "S2", "S3", "S4"],
    suitTotals: { S1: 4, S2: 4, S3: 4, S4: 4 },
    handSizes: { A: 4, B: 4, C: 4, D: 4 },
    startingPlayer: "D"
  };

  const moves: Move[] = [
    { kind: "Ask", asker: "D", target: "B", suit: "S1" },
    { kind: "AnswerYes", target: "B", suit: "S1" },
    { kind: "Ask", asker: "A", target: "D", suit: "S2" },
    { kind: "AnswerNo", target: "D", suit: "S2" },
    { kind: "Ask", asker: "B", target: "A", suit: "S3" },
    { kind: "AnswerNo", target: "A", suit: "S3" },
    { kind: "Ask", asker: "C", target: "D", suit: "S4" },
    { kind: "AnswerNo", target: "D", suit: "S4" },
    { kind: "Ask", asker: "D", target: "A", suit: "S3" },
    { kind: "AnswerNo", target: "A", suit: "S3" },
    { kind: "Ask", asker: "A", target: "B", suit: "S4" },
    { kind: "AnswerNo", target: "B", suit: "S4" },
    { kind: "Ask", asker: "B", target: "C", suit: "S3" },
    { kind: "AnswerYes", target: "C", suit: "S3" },
    { kind: "Ask", asker: "C", target: "A", suit: "S4" },
    { kind: "AnswerYes", target: "A", suit: "S4" },
    { kind: "Ask", asker: "D", target: "B", suit: "S3" },
    { kind: "AnswerYes", target: "B", suit: "S3" },
    { kind: "Ask", asker: "A", target: "B", suit: "S2" }
  ];

  let state = createInitialState(config);
  for (const move of moves) {
    state = applyMove(state, move);
  }

  assert.ok(state.min.B.S2 > 0, `Expected B/S2 min > 0, got ${state.min.B.S2}`);

  const illegalAnswer: Move = { kind: "AnswerNo", target: "B", suit: "S2" };
  const legality = isLegalMove(state, illegalAnswer);
  assert.equal(legality.ok, false);
});
