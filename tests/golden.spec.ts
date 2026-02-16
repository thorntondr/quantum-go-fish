import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { replay } from "../src/app/history.js";
import { makeState } from "./helpers.js";
import type { Move } from "../src/engine/types.js";

test("Golden sequence from single-device flow remains replayable", () => {
  const moves = JSON.parse(
    readFileSync(resolve("tests/fixtures/single-device-sequence.json"), "utf8")
  ) as Move[];

  const finalState = replay(makeState(), moves);
  assert.equal(finalState.turnState.phase, "Idle");
  assert.equal(finalState.turnState.currentPlayer, "C");
  assert.equal(finalState.max.B.S, 0);
});
