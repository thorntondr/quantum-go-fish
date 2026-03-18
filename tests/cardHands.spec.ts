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
  assert.ok(labelIndex(html, "A") < html.indexOf("You"));
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

  assert.match(html, /--band-color: #123456; --band-ink: #f7fbf9/);
});

test("renderCardHands keeps dark ink for light suit backgrounds", () => {
  const html = renderCardHands(createInitialState(config), {
    formatPlayer: (playerId) => playerId,
    getSuitMeta: (suitId) => (suitId === "S1" ? { color: "#f4e7a1", name: "Sunlight" } : undefined),
    localPlayerId: "A"
  });

  assert.match(html, /--band-color: #f4e7a1; --band-ink: #1a2a24/);
});
