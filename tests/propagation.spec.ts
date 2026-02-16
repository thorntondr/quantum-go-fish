import test from "node:test";
import assert from "node:assert/strict";
import { propagate } from "../src/engine/propagate.js";
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
