import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { replay } from "../app/history.js";
import { serialize, deserialize } from "../app/serialization.js";
import { stateHash } from "../app/hash.js";
import { applyMove } from "../engine/moves.js";
import { createInitialState } from "../engine/state.js";
import { assertInvariants } from "../engine/invariants.js";
import type { Move, SetupConfig } from "../engine/types.js";

function usage(): string {
  return [
    "Usage:",
    "  qgf init <config-file>",
    "  qgf move <state-file> <move-json>",
    "  qgf replay <initial-state-file> <moves-file>",
    "  qgf validate <state-file>"
  ].join("\n");
}

function loadText(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function parseMove(input: string): Move {
  return JSON.parse(input) as Move;
}

function run(): void {
  const [, , command, ...args] = process.argv;

  if (!command) {
    console.log(usage());
    process.exit(1);
  }

  if (command === "init") {
    const [configPath] = args;
    if (!configPath) {
      throw new Error("init requires <config-file>");
    }
    const config = JSON.parse(loadText(configPath)) as SetupConfig;
    const state = createInitialState(config);
    assertInvariants(state);
    console.log(serialize(state));
    return;
  }

  if (command === "move") {
    const [statePath, moveJson] = args;
    if (!statePath || !moveJson) {
      throw new Error("move requires <state-file> <move-json>");
    }
    const state = deserialize(loadText(statePath));
    const move = parseMove(moveJson);
    const next = applyMove(state, move);
    console.log(serialize(next));
    return;
  }

  if (command === "replay") {
    const [statePath, movesPath] = args;
    if (!statePath || !movesPath) {
      throw new Error("replay requires <initial-state-file> <moves-file>");
    }
    const initial = deserialize(loadText(statePath));
    const moves = JSON.parse(loadText(movesPath)) as Move[];
    const finalState = replay(initial, moves);
    console.log(JSON.stringify({ hash: stateHash(finalState), finalState }, null, 2));
    return;
  }

  if (command === "validate") {
    const [statePath] = args;
    if (!statePath) {
      throw new Error("validate requires <state-file>");
    }
    const state = deserialize(loadText(statePath));
    assertInvariants(state);
    console.log(JSON.stringify({ valid: true, hash: stateHash(state) }, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

try {
  run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("\n" + usage());
  process.exit(1);
}
