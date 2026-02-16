import test from "node:test";
import assert from "node:assert/strict";
import { applyMove } from "../src/engine/moves.js";
import { makeState } from "./helpers.js";

test("Ask updates pending ask and keeps current player", () => {
  const state = makeState();
  const next = applyMove(state, { kind: "Ask", asker: "A", target: "B", suit: "S" });

  assert.equal(next.turnState.phase, "AwaitingAnswer");
  assert.equal(next.turnState.currentPlayer, "A");
  assert.deepEqual(next.turnState.pendingAsk, { asker: "A", target: "B", suit: "S" });
  assert.ok(next.min.A.S >= 1);
});

test("AnswerYes transfers one card and advances turn", () => {
  let state = makeState();
  state = applyMove(state, { kind: "Ask", asker: "A", target: "B", suit: "S" });
  const next = applyMove(state, { kind: "AnswerYes", target: "B", suit: "S" });

  assert.equal(next.turnState.phase, "Idle");
  assert.equal(next.turnState.currentPlayer, "B");
  assert.equal(next.turnState.pendingAsk, undefined);
  assert.equal(next.handSizes.A, 5);
  assert.equal(next.handSizes.B, 3);
});

test("AnswerNo eliminates target suit possibility", () => {
  let state = makeState();
  state = applyMove(state, { kind: "Ask", asker: "A", target: "B", suit: "H" });
  const next = applyMove(state, { kind: "AnswerNo", target: "B", suit: "H" });

  assert.equal(next.max.B.H, 0);
  assert.equal(next.turnState.currentPlayer, "B");
});
