import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/engine/state.js";
import type { SetupConfig } from "../src/engine/types.js";

function validConfig(): SetupConfig {
  return {
    players: ["A", "B", "C"],
    suits: ["S1", "S2", "S3"],
    suitTotals: { S1: 4, S2: 4, S3: 4 },
    handSizes: { A: 4, B: 4, C: 4 },
    startingPlayer: "A"
  };
}

test("Setup rejects mismatched suit/player counts", () => {
  const config = validConfig();
  config.suits = ["S1", "S2"];
  assert.throws(() => createInitialState(config));
});

test("Setup rejects non-four starting hand size", () => {
  const config = validConfig();
  config.handSizes.B = 3;
  assert.throws(() => createInitialState(config));
});

test("Setup rejects non-four suit totals", () => {
  const config = validConfig();
  config.suitTotals.S2 = 3;
  assert.throws(() => createInitialState(config));
});

test("Setup supports an initial per-suit max of three", () => {
  const config = validConfig();
  config.initialSuitMax = 3;

  const state = createInitialState(config);

  assert.equal(state.max.A.S1, 3);
  assert.equal(state.max.B.S2, 3);
  assert.equal(state.max.C.S3, 3);
});

test("Setup rejects invalid initial suit max values", () => {
  const config = validConfig();
  config.initialSuitMax = 5;
  assert.throws(() => createInitialState(config), /Initial suit max must be an integer from 1 to 4/);
});
