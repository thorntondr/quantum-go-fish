import test from "node:test";
import assert from "node:assert/strict";
import { replay } from "../src/app/history.js";
import { stateHash } from "../src/app/hash.js";
import { makeState } from "./helpers.js";
import type { Move } from "../src/engine/types.js";

const sequence: Move[] = [
  { kind: "Ask", asker: "A", target: "B", suit: "S" },
  { kind: "AnswerNo", target: "B", suit: "S" },
  { kind: "Ask", asker: "B", target: "C", suit: "H" },
  { kind: "AnswerYes", target: "C", suit: "H" }
];

test("Replay determinism yields stable hash", () => {
  const initial = makeState();
  const one = replay(initial, sequence);
  const two = replay(initial, sequence);
  assert.equal(stateHash(one), stateHash(two));
});
