import test from "node:test";
import assert from "node:assert/strict";
import { applyMove } from "../src/engine/moves.js";
import { makeState } from "./helpers.js";
import { createInitialState } from "../src/engine/state.js";
import { isLegalMove } from "../src/engine/rules.js";
import type { SetupConfig } from "../src/engine/types.js";

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

test("Current player wins when they guarantee four cards in a suit", () => {
  let state = makeState();
  state.min.A.S = 3;
  state.max.A.S = 4;
  state.min.B.S = 1;
  state.max.B.S = 4;

  state = applyMove(state, { kind: "Ask", asker: "A", target: "B", suit: "S" });
  const next = applyMove(state, { kind: "AnswerYes", target: "B", suit: "S" });

  assert.equal(next.turnState.phase, "GameOver");
  assert.equal(next.turnState.currentPlayer, "A");
  assert.equal(next.turnState.winner, "A");
  assert.equal(next.turnState.winReason, "GuaranteedFourOfSuit");

  const legalAfterEnd = isLegalMove(next, { kind: "Ask", asker: "A", target: "B", suit: "H" });
  assert.equal(legalAfterEnd.ok, false);
});

test("Current player wins when all card suits become known", () => {
  const config: SetupConfig = {
    players: ["A", "B"],
    suits: ["S"],
    suitTotals: { S: 4 },
    handSizes: { A: 2, B: 2 },
    startingPlayer: "A"
  };

  const state = createInitialState(config);
  const next = applyMove(state, { kind: "Ask", asker: "A", target: "B", suit: "S" });

  assert.equal(next.turnState.phase, "GameOver");
  assert.equal(next.turnState.currentPlayer, "A");
  assert.equal(next.turnState.winner, "A");
  assert.equal(next.turnState.winReason, "AllCardsKnown");
});

test("Non-current player wins immediately if they already have guaranteed four of a suit", () => {
  let state = makeState();
  state.min.B.S = 4;
  state.max.B.S = 4;

  const next = applyMove(state, { kind: "Ask", asker: "A", target: "C", suit: "H" });

  assert.equal(next.turnState.phase, "GameOver");
  assert.equal(next.turnState.winner, "B");
  assert.equal(next.turnState.winReason, "GuaranteedFourOfSuit");
});

test("If multiple players have guaranteed fours, winner follows turn order from current player", () => {
  let state = makeState();
  state.turnState.currentPlayer = "B";
  state.min.A.S = 4;
  state.max.A.S = 4;
  state.min.B.H = 4;
  state.max.B.H = 4;

  const next = applyMove(state, { kind: "Ask", asker: "B", target: "C", suit: "H" });

  assert.equal(next.turnState.phase, "GameOver");
  assert.equal(next.turnState.winner, "B");
  assert.equal(next.turnState.winReason, "GuaranteedFourOfSuit");
});
