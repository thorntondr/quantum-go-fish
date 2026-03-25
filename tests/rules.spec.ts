import test from "node:test";
import assert from "node:assert/strict";
import { isLegalMove } from "../src/engine/rules.js";
import { makeState } from "./helpers.js";

test("Ask legal when asker has suit possibility", () => {
  const state = makeState();
  const result = isLegalMove(state, { kind: "Ask", asker: "A", target: "B", suit: "S" });
  assert.equal(result.ok, true);
});

test("Ask illegal when asker has no suit possibility", () => {
  const state = makeState();
  state.max.A.S = 0;
  const result = isLegalMove(state, { kind: "Ask", asker: "A", target: "B", suit: "S" });
  assert.equal(result.ok, false);
});

test("AnswerYes requires pending ask and possibility", () => {
  const state = makeState();
  state.turnState.pendingAsk = { asker: "A", target: "B", suit: "S" };
  const legal = isLegalMove(state, { kind: "AnswerYes", target: "B", suit: "S" });
  assert.equal(legal.ok, true);

  state.max.B.S = 0;
  const illegal = isLegalMove(state, { kind: "AnswerYes", target: "B", suit: "S" });
  assert.equal(illegal.ok, false);
});

test("AnswerNo requires pending ask and min == 0", () => {
  const state = makeState();
  state.turnState.pendingAsk = { asker: "A", target: "B", suit: "S" };
  const legal = isLegalMove(state, { kind: "AnswerNo", target: "B", suit: "S" });
  assert.equal(legal.ok, true);

  state.min.B.S = 1;
  const illegal = isLegalMove(state, { kind: "AnswerNo", target: "B", suit: "S" });
  assert.equal(illegal.ok, false);
});

test("AnswerYes under all-or-nothing requires an exact count within the known range", () => {
  const state = makeState();
  state.allOrNothing = true;
  state.turnState.pendingAsk = { asker: "A", target: "B", suit: "S" };
  state.min.B.S = 2;
  state.max.B.S = 3;

  assert.equal(isLegalMove(state, { kind: "AnswerYes", target: "B", suit: "S" }).ok, false);
  assert.equal(isLegalMove(state, { kind: "AnswerYes", target: "B", suit: "S", count: 1 }).ok, false);
  assert.equal(isLegalMove(state, { kind: "AnswerYes", target: "B", suit: "S", count: 2 }).ok, true);
  assert.equal(isLegalMove(state, { kind: "AnswerYes", target: "B", suit: "S", count: 3 }).ok, true);
  assert.equal(isLegalMove(state, { kind: "AnswerYes", target: "B", suit: "S", count: 4 }).ok, false);
});
