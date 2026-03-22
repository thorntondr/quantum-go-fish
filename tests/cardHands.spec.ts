import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState } from "../src/engine/state.js";
import type { SetupConfig } from "../src/engine/types.js";
import { renderCardHands } from "../src/ui/cardHands.js";

const config: SetupConfig = {
  players: ["A", "B", "C", "D"],
  suits: ["S1", "S2", "S3", "S4"],
  suitTotals: { S1: 4, S2: 4, S3: 4, S4: 4 },
  handSizes: { A: 4, B: 4, C: 4, D: 4 },
  startingPlayer: "A"
};

const sevenSuitConfig: SetupConfig = {
  players: ["A", "B", "C", "D", "E", "F", "G"],
  suits: ["S1", "S2", "S3", "S4", "S5", "S6", "S7"],
  suitTotals: { S1: 4, S2: 4, S3: 4, S4: 4, S5: 4, S6: 4, S7: 4 },
  handSizes: { A: 4, B: 4, C: 4, D: 4, E: 4, F: 4, G: 4 },
  startingPlayer: "A"
};

const sixSuitConfig: SetupConfig = {
  players: ["A", "B", "C", "D", "E", "F"],
  suits: ["S1", "S2", "S3", "S4", "S5", "S6"],
  suitTotals: { S1: 4, S2: 4, S3: 4, S4: 4, S5: 4, S6: 4 },
  handSizes: { A: 4, B: 4, C: 4, D: 4, E: 4, F: 4 },
  startingPlayer: "A"
};

function render(localPlayerId?: string): string {
  return renderCardHands(createInitialState(config), {
    formatPlayer: (playerId) => playerId,
    getSuitMeta: () => undefined,
    localPlayerId
  });
}

function labelIndex(html: string, playerId: string): number {
  return html.indexOf(`<div class="hand-label">${playerId}</div>`);
}

test("renderCardHands rotates opponents to start after the local player", () => {
  const html = render("B");

  assert.ok(labelIndex(html, "C") < labelIndex(html, "D"));
  assert.ok(labelIndex(html, "D") < labelIndex(html, "A"));
  assert.ok(html.indexOf("You") < labelIndex(html, "C"));
});

test("renderCardHands wraps opponent order around the table", () => {
  const html = render("D");

  assert.ok(labelIndex(html, "A") < labelIndex(html, "B"));
  assert.ok(labelIndex(html, "B") < labelIndex(html, "C"));
  assert.equal(labelIndex(html, "D"), -1);
});

test("renderCardHands preserves canonical order when no local player is set", () => {
  const html = render();

  assert.ok(labelIndex(html, "A") < labelIndex(html, "B"));
  assert.ok(labelIndex(html, "B") < labelIndex(html, "C"));
  assert.ok(labelIndex(html, "C") < labelIndex(html, "D"));
});

test("renderCardHands renders the local player only in the self-hand area", () => {
  const html = render("B");

  assert.equal(labelIndex(html, "B"), -1);
  assert.match(html, /You .* B/);
});

test("renderCardHands uses light ink for dark suit backgrounds", () => {
  const html = renderCardHands(createInitialState(config), {
    formatPlayer: (playerId) => playerId,
    getSuitMeta: (suitId) => (suitId === "S1" ? { color: "#123456", name: "Deep Sea" } : undefined),
    localPlayerId: "A"
  });

  assert.match(html, /--band-color: #123456; --band-ink: #dee2e0/);
});

test("renderCardHands keeps dark ink for light suit backgrounds", () => {
  const html = renderCardHands(createInitialState(config), {
    formatPlayer: (playerId) => playerId,
    getSuitMeta: (suitId) => (suitId === "S1" ? { color: "#f4e7a1", name: "Sunlight" } : undefined),
    localPlayerId: "A"
  });

  assert.match(html, /--band-color: #f4e7a1; --band-ink: #1a2a24/);
});

test("renderCardHands sorts unresolved card bands by suit order for display", () => {
  const state = createInitialState(config);
  state.handSizes.A = 1;
  state.handSizes.B = 5;
  state.max.A.S1 = 1;
  state.max.A.S2 = 0;
  state.max.A.S3 = 2;
  state.max.A.S4 = 2;

  const html = renderCardHands(state, {
    formatPlayer: (playerId) => playerId,
    getSuitMeta: (suitId) =>
      ({ S1: { name: "Alpha" }, S3: { name: "Gamma" }, S4: { name: "Delta" } })[suitId],
    localPlayerId: "A"
  });

  const alpha = html.indexOf("Alpha");
  const gamma = html.indexOf("Gamma");
  const delta = html.indexOf("Delta");

  assert.notEqual(alpha, -1);
  assert.notEqual(gamma, -1);
  assert.notEqual(delta, -1);
  assert.ok(alpha < gamma);
  assert.ok(gamma < delta);
});

test("renderCardHands marks the asker and answerer with distinct hand classes", () => {
  const html = renderCardHands(createInitialState(config), {
    formatPlayer: (playerId) => playerId,
    getSuitMeta: () => undefined,
    localPlayerId: "A",
    askingPlayerId: "A",
    answeringPlayerId: "C"
  });

  assert.match(html, /hand hand--self hand--asker/);
  assert.match(html, /<section class="hand hand--answerer"\s*>\s*<div class="hand-label">C<\/div>/);
});

test("renderCardHands highlights the selected ask target before an answer is pending", () => {
  const html = renderCardHands(createInitialState(config), {
    formatPlayer: (playerId) => playerId,
    getSuitMeta: () => undefined,
    localPlayerId: "A",
    askingPlayerId: "A",
    selectedTargetPlayerId: "D"
  });

  assert.match(html, /<section class="hand hand--selected-target"\s*>\s*<div class="hand-label">D<\/div>/);
});

test("renderCardHands scales center symbol size based on band count", () => {
  const singleBandState = createInitialState(config);
  singleBandState.handSizes.A = 1;
  singleBandState.min.A.S1 = 1;
  singleBandState.max.A.S1 = 1;
  singleBandState.max.A.S2 = 0;
  singleBandState.max.A.S3 = 0;
  singleBandState.max.A.S4 = 0;

  const multiBandState = createInitialState(config);
  multiBandState.handSizes.A = 1;
  multiBandState.max.A.S1 = 1;
  multiBandState.max.A.S2 = 1;
  multiBandState.max.A.S3 = 1;
  multiBandState.max.A.S4 = 1;

  const singleBandHtml = renderCardHands(singleBandState, {
    formatPlayer: (playerId) => playerId,
    getSuitMeta: () => undefined,
    localPlayerId: "A"
  });
  const multiBandHtml = renderCardHands(multiBandState, {
    formatPlayer: (playerId) => playerId,
    getSuitMeta: () => undefined,
    localPlayerId: "A"
  });

  assert.match(singleBandHtml, /--band-symbol-size: 3.3rem/);
  assert.match(multiBandHtml, /--band-symbol-size: 1.6rem/);
});

test("renderCardHands increases card height when seven suits are in play", () => {
  const html = renderCardHands(createInitialState(sevenSuitConfig), {
    formatPlayer: (playerId) => playerId,
    getSuitMeta: () => undefined,
    localPlayerId: "A"
  });

  assert.match(html, /--card-height: calc\(var\(--card-width\) \* 16 \/ 9\);/);
});

test("renderCardHands shrinks front-card content styling for six-band cards", () => {
  const html = renderCardHands(createInitialState(sixSuitConfig), {
    formatPlayer: (playerId) => playerId,
    getSuitMeta: () => undefined,
    localPlayerId: "A"
  });

  assert.match(html, /--band-name-size: 0.48rem;/);
  assert.match(html, /--band-center-gap: 1px;/);
});
