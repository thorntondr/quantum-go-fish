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
    suits: ["S1", "S2"],
    suitTotals: { S1: 4, S2: 4 },
    handSizes: { A: 4, B: 4 },
    startingPlayer: "A"
  };

  const state = createInitialState(config);
  state.min.A.S1 = 3;
  state.max.A.S1 = 3;
  state.min.A.S2 = 1;
  state.max.A.S2 = 1;
  state.min.B.S1 = 1;
  state.max.B.S1 = 1;
  state.min.B.S2 = 3;
  state.max.B.S2 = 3;

  const next = applyMove(state, { kind: "Ask", asker: "A", target: "B", suit: "S2" });

  assert.equal(next.turnState.phase, "GameOver");
  assert.equal(next.turnState.currentPlayer, "A");
  assert.equal(next.turnState.winner, "A");
  assert.equal(next.turnState.winReason, "AllCardsKnown");
});

test("Current player win reason reflects both win conditions when both happen simultaneously", () => {
  const config: SetupConfig = {
    players: ["A", "B"],
    suits: ["S1", "S2"],
    suitTotals: { S1: 4, S2: 4 },
    handSizes: { A: 4, B: 4 },
    startingPlayer: "A"
  };

  let state = createInitialState(config);
  state.min.A.S1 = 3;
  state.max.A.S1 = 4;
  state.min.A.S2 = 0;
  state.max.A.S2 = 1;
  state.min.B.S1 = 0;
  state.max.B.S1 = 1;
  state.min.B.S2 = 3;
  state.max.B.S2 = 4;

  state = applyMove(state, { kind: "Ask", asker: "A", target: "B", suit: "S1" });
  const next = applyMove(state, { kind: "AnswerYes", target: "B", suit: "S1"})

  assert.equal(next.turnState.phase, "GameOver");
  assert.equal(next.turnState.currentPlayer, "A");
  assert.equal(next.turnState.winner, "A");
  assert.equal(next.turnState.winReason, "GuaranteedFourOfSuitAndAllCardsKnown");
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
  assert.equal(next.turnState.winReason, "GuaranteedFourOfSuitAndAllCardsKnown");
});

test("AnswerYes skips the next player when they run out of cards", () => {
  let state = makeState();
  state.handSizes.A = 4;
  state.handSizes.B = 1;
  state.handSizes.C = 7;

  state = applyMove(state, { kind: "Ask", asker: "A", target: "B", suit: "S" });
  const next = applyMove(state, { kind: "AnswerYes", target: "B", suit: "S" });

  assert.equal(next.handSizes.B, 0);
  assert.equal(next.turnState.phase, "Idle");
  assert.equal(next.turnState.currentPlayer, "C");
});

test("Game ends when only one player has cards remaining", () => {
  const config: SetupConfig = {
    players: ["A", "B"],
    suits: ["S1", "S2"],
    suitTotals: { S1: 4, S2: 4 },
    handSizes: { A: 4, B: 4 },
    startingPlayer: "A"
  };

  let state = createInitialState(config);
  state.handSizes.A = 7;
  state.handSizes.B = 1;

  state = applyMove(state, { kind: "Ask", asker: "A", target: "B", suit: "S1" });
  const next = applyMove(state, { kind: "AnswerYes", target: "B", suit: "S1" });

  assert.equal(next.handSizes.B, 0);
  assert.equal(next.turnState.phase, "GameOver");
  assert.equal(next.turnState.winner, "A");
  assert.equal(next.turnState.winReason, "NotEnoughPlayers");
});

test("All-or-nothing AnswerYes transfers the declared exact count", () => {
  let state = makeState();
  state.allOrNothing = true;
  state.min.B.S = 2;
  state.max.B.S = 2;

  state = applyMove(state, { kind: "Ask", asker: "A", target: "B", suit: "S" });
  const next = applyMove(state, { kind: "AnswerYes", target: "B", suit: "S", count: 2 });

  assert.equal(next.handSizes.A, 6);
  assert.equal(next.handSizes.B, 2);
  assert.equal(next.min.A.S, 3);
  assert.equal(next.max.A.S, 4);
  assert.equal(next.min.B.S, 0);
  assert.equal(next.max.B.S, 0);
  assert.equal(next.turnState.currentPlayer, "B");
});

test("All-or-nothing AnswerYes collapses the responder range to the declared count before transfer", () => {
  let state = makeState();
  state.allOrNothing = true;
  state.min.B.S = 1;
  state.max.B.S = 3;

  state = applyMove(state, { kind: "Ask", asker: "A", target: "B", suit: "S" });
  const next = applyMove(state, { kind: "AnswerYes", target: "B", suit: "S", count: 2 });

  assert.equal(next.handSizes.A, 6);
  assert.equal(next.handSizes.B, 2);
  assert.equal(next.min.B.S, 0);
  assert.equal(next.max.B.S, 0);
  assert.equal(next.min.A.S, 3);
});

test("AnswerNo with draw pile makes the asker go fish from the pile", () => {
  const config: SetupConfig = {
    players: ["A", "B", "C"],
    suits: ["S", "H", "D"],
    suitTotals: { S: 4, H: 4, D: 4 },
    handSizes: { A: 4, B: 4, C: 4 },
    startingPlayer: "A",
    drawPile: true
  };

  let state = createInitialState(config);
  const drawPile = state.drawPile;
  assert.ok(drawPile);

  state.min[drawPile.playerId].S = 1;
  state.max[drawPile.playerId].S = 2;
  state.max[drawPile.playerId].H = 1;
  state.max.A.S = 1;
  state.max.A.H = 2;

  state = applyMove(state, { kind: "Ask", asker: "A", target: "B", suit: "D" });
  const next = applyMove(state, { kind: "AnswerNo", target: "B", suit: "D" });

  assert.equal(next.handSizes.A, 5);
  assert.equal(next.handSizes[drawPile.playerId], 3);
  assert.equal(next.max.B.D, 0);
  assert.equal(next.min[drawPile.playerId].S, 0);
  assert.equal(next.max.A.S, 2);
  assert.equal(next.max.A.H, 3);
  assert.equal(next.turnState.currentPlayer, "B");
});

test("AnswerNo with an empty draw pile does not change hand sizes", () => {
  const config: SetupConfig = {
    players: ["A", "B", "C"],
    suits: ["S", "H", "D"],
    suitTotals: { S: 4, H: 4, D: 4 },
    handSizes: { A: 4, B: 4, C: 4 },
    startingPlayer: "A",
    drawPile: true
  };

  let state = createInitialState(config);
  const drawPile = state.drawPile;
  assert.ok(drawPile);
  state.handSizes.A += 4;
  state.handSizes[drawPile.playerId] = 0;
  for (const suit of state.suits) {
    state.min[drawPile.playerId][suit] = 0;
    state.max[drawPile.playerId][suit] = 0;
  }

  state = applyMove(state, { kind: "Ask", asker: "A", target: "B", suit: "S" });
  const next = applyMove(state, { kind: "AnswerNo", target: "B", suit: "S" });

  assert.equal(next.handSizes.A, 8);
  assert.equal(next.handSizes[drawPile.playerId], 0);
  assert.equal(next.max.B.S, 0);
});
