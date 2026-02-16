import test from "node:test";
import assert from "node:assert/strict";
import { assertInvariants } from "../src/engine/invariants.js";
import { makeState } from "./helpers.js";

test("Invariant fails when min > max", () => {
  const state = makeState();
  state.min.A.S = 2;
  state.max.A.S = 1;
  assert.throws(() => assertInvariants(state));
});

test("Invariant fails when player min sum exceeds hand size", () => {
  const state = makeState();
  state.min.A.S = 3;
  state.min.A.H = 2;
  assert.throws(() => assertInvariants(state));
});

test("Invariant fails when suit max sum below total", () => {
  const state = makeState();
  state.max.A.S = 1;
  state.max.B.S = 1;
  state.max.C.S = 1;
  assert.throws(() => assertInvariants(state));
});
