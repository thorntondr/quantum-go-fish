import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { replay } from "../app/history.js";
import { serialize, deserialize } from "../app/serialization.js";
import { stateHash } from "../app/hash.js";
import { applyMove } from "../engine/moves.js";
import { createInitialState } from "../engine/state.js";
import { assertInvariants } from "../engine/invariants.js";
import type { Move, SetupConfig } from "../engine/types.js";
import type { GameState } from "../engine/types.js";
import { isLegalMove } from "../engine/rules.js";

function usage(): string {
  return [
    "Usage:",
    "  qgf init <config-file>",
    "  qgf move <state-file> <move-json>",
    "  qgf replay <initial-state-file> <moves-file>",
    "  qgf validate <state-file>",
    "  qgf shell",
    "  qgf shell <config-file>",
    "  qgf shell --state <state-file>"
  ].join("\n");
}

function loadText(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function parseMove(input: string): Move {
  return JSON.parse(input) as Move;
}

function formatWinReason(reason?: string): string {
  if (reason === "GuaranteedFourOfSuit") {
    return "guaranteed four-of-a-suit";
  }
  if (reason === "AllCardsKnown") {
    return "all card suits known";
  }
  if (reason === "GuaranteedFourOfSuitAndAllCardsKnown") {
    return "guaranteed four-of-a-suit and all card suits known";
  }
  if (reason === "NotEnoughPlayers") {
    return "not enough active players";
  }
  return "unknown";
}

function formatStateTable(state: GameState): string {
  const cols = ["Player", ...state.suits, "Hand", "Turn"];
  const rows: string[][] = [];

  for (const player of state.players) {
    const row: string[] = [player];
    for (const suit of state.suits) {
      const minValue = state.min[player][suit];
      const maxValue = state.max[player][suit];
      const cell = maxValue === 0 ? "X" : `${minValue}-${maxValue}`;
      row.push(cell);
    }
    row.push(`${state.handSizes[player]}`);
    row.push(player === state.turnState.currentPlayer ? "*" : "");
    rows.push(row);
  }

  const widths = cols.map((header, i) =>
    Math.max(header.length, ...rows.map((row) => row[i].length))
  );

  const renderRow = (cells: string[]): string =>
    cells.map((cell, i) => cell.padEnd(widths[i], " ")).join(" | ");

  const divider = widths.map((w) => "-".repeat(w)).join("-+-");
  const lines = [renderRow(cols), divider, ...rows.map(renderRow)];

  if (state.turnState.pendingAsk) {
    const p = state.turnState.pendingAsk;
    lines.push(
      "",
      `Pending Ask: ${p.asker} -> ${p.target} for ${p.suit}`,
      `Phase: ${state.turnState.phase}`
    );
  } else {
    lines.push("", `Phase: ${state.turnState.phase}`);
  }
  if (state.turnState.phase === "GameOver" && state.turnState.winner) {
    lines.push(
      `Winner: ${state.turnState.winner} (${formatWinReason(state.turnState.winReason)})`
    );
  }
  lines.push(`State Hash: ${stateHash(state)}`);
  return lines.join("\n");
}

function legalMovesText(state: GameState): string {
  if (state.turnState.pendingAsk) {
    const pending = state.turnState.pendingAsk;
    const noMove: Move = { kind: "AnswerNo", target: pending.target, suit: pending.suit };
    const noLegal = isLegalMove(state, noMove);

    if (state.allOrNothing) {
      const minCount = state.min[pending.target][pending.suit];
      const maxCount = state.max[pending.target][pending.suit];
      const yesLines: string[] = [];
      for (let count = minCount; count <= maxCount; count += 1) {
        const yesMove: Move = { kind: "AnswerYes", target: pending.target, suit: pending.suit, count };
        const yesLegal = isLegalMove(state, yesMove);
        yesLines.push(
          `  yes ${count} (${pending.target}, ${pending.suit}) -> ${yesLegal.ok ? "legal" : yesLegal.reason}`
        );
      }
      return [
        "Legal responses:",
        ...yesLines,
        `  no     (${pending.target}, ${pending.suit}) -> ${noLegal.ok ? "legal" : noLegal.reason}`
      ].join("\n");
    }

    const yesMove: Move = { kind: "AnswerYes", target: pending.target, suit: pending.suit };
    const yesLegal = isLegalMove(state, yesMove);
    return [
      "Legal responses:",
      `  yes (${pending.target}, ${pending.suit}) -> ${yesLegal.ok ? "legal" : yesLegal.reason}`,
      `  no  (${pending.target}, ${pending.suit}) -> ${noLegal.ok ? "legal" : noLegal.reason}`
    ].join("\n");
  }

  const current = state.turnState.currentPlayer;
  const lines = ["Legal asks:"];
  for (const target of state.players) {
    if (target === current) {
      continue;
    }
    for (const suit of state.suits) {
      const move: Move = { kind: "Ask", asker: current, target, suit };
      const legal = isLegalMove(state, move);
      if (legal.ok) {
        lines.push(`  ask ${target} ${suit}`);
      }
    }
  }
  return lines.join("\n");
}

function shellHelp(): string {
  return [
    "Interactive commands:",
    "  show                     Show current state table",
    "  legal                    Show legal moves from current state",
    "  ask <target> <suit>      Submit Ask move (asker is current player)",
    "  yes [count]              Submit AnswerYes for pending ask",
    "  no                       Submit AnswerNo for pending ask",
    "  move <json>              Apply a raw move JSON object",
    "  save <state-file>        Save serialized current state",
    "  hash                     Print current state hash",
    "  help                     Show this help",
    "  exit                     Quit shell"
  ].join("\n");
}

async function runShell(state: GameState): Promise<void> {
  const rl = createInterface({ input, output });
  let currentState = state;

  console.log("Quantum Go Fish interactive shell");
  console.log("Type `help` for commands.");
  console.log(formatStateTable(currentState));

  try {
    while (true) {
      const line = (await rl.question("qgf> ")).trim();
      if (!line) {
        continue;
      }

      if (line === "exit" || line === "quit") {
        break;
      }
      if (line === "help") {
        console.log(shellHelp());
        continue;
      }
      if (line === "show") {
        console.log(formatStateTable(currentState));
        continue;
      }
      if (line === "legal") {
        console.log(legalMovesText(currentState));
        continue;
      }
      if (line === "hash") {
        console.log(stateHash(currentState));
        continue;
      }
      if (line.startsWith("save ")) {
        const filePath = line.slice("save ".length).trim();
        if (!filePath) {
          console.log("save requires <state-file>");
          continue;
        }
        writeFileSync(resolve(filePath), serialize(currentState), "utf8");
        console.log(`Saved ${filePath}`);
        continue;
      }
      if (line.startsWith("ask ")) {
        const [, target, suit] = line.split(/\s+/);
        if (!target || !suit) {
          console.log("ask requires <target> <suit>");
          continue;
        }
        const move: Move = {
          kind: "Ask",
          asker: currentState.turnState.currentPlayer,
          target,
          suit
        };
        try {
          currentState = applyMove(currentState, move);
          console.log(formatStateTable(currentState));
        } catch (error) {
          console.log(error instanceof Error ? error.message : String(error));
        }
        continue;
      }
      if (line === "no" || line === "yes" || line.startsWith("yes ")) {
        const pending = currentState.turnState.pendingAsk;
        if (!pending) {
          console.log("No pending ask to answer.");
          continue;
        }

        let move: Move;
        if (line === "no") {
          move = { kind: "AnswerNo", target: pending.target, suit: pending.suit };
        } else if (currentState.allOrNothing) {
          const [, rawCount] = line.split(/\s+/, 2);
          if (!rawCount) {
            console.log("All-or-nothing is enabled. Use: yes <count>");
            continue;
          }
          const count = Number.parseInt(rawCount, 10);
          if (!Number.isInteger(count)) {
            console.log("yes requires an integer count.");
            continue;
          }
          move = { kind: "AnswerYes", target: pending.target, suit: pending.suit, count };
        } else {
          move = { kind: "AnswerYes", target: pending.target, suit: pending.suit };
        }

        try {
          currentState = applyMove(currentState, move);
          console.log(formatStateTable(currentState));
        } catch (error) {
          console.log(error instanceof Error ? error.message : String(error));
        }
        continue;
      }
      if (line.startsWith("move ")) {
        try {
          const move = parseMove(line.slice("move ".length).trim());
          currentState = applyMove(currentState, move);
          console.log(formatStateTable(currentState));
        } catch (error) {
          console.log(error instanceof Error ? error.message : String(error));
        }
        continue;
      }

      console.log("Unknown command. Type `help`.");
    }
  } finally {
    rl.close();
  }
}

function playerLabel(index: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < alphabet.length) {
    return alphabet[index];
  }
  return `P${index + 1}`;
}

function suitLabel(index: number): string {
  return `S${index + 1}`;
}

async function createQuickStartState(): Promise<GameState> {
  const rl = createInterface({ input, output });
  try {
    while (true) {
      const raw = (await rl.question("How many players? ")).trim();
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || Number.isNaN(n) || n < 2) {
        console.log("Enter an integer >= 2.");
        continue;
      }

      const suits = Array.from({ length: n }, (_, i) => suitLabel(i));
      const suitTotals: Record<string, number> = Object.fromEntries(suits.map((suit) => [suit, 4]));
      const players = Array.from({ length: n }, (_, i) => playerLabel(i));
      const handSizes: Record<string, number> = Object.fromEntries(players.map((player) => [player, 4]));

      const config: SetupConfig = {
        players,
        suits,
        suitTotals,
        handSizes,
        startingPlayer: players[0]
      };
      const state = createInitialState(config);
      assertInvariants(state);
      return state;
    }
  } finally {
    rl.close();
  }
}

async function run(): Promise<void> {
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

  if (command === "shell") {
    const [firstArg, secondArg] = args;
    if (!firstArg) {
      const state = await createQuickStartState();
      await runShell(state);
      return;
    }
    if (firstArg === "--state") {
      if (!secondArg) {
        throw new Error("shell --state requires <state-file>");
      }
      await runShell(deserialize(loadText(secondArg)));
      return;
    }
    const config = JSON.parse(loadText(firstArg)) as SetupConfig;
    const state = createInitialState(config);
    assertInvariants(state);
    await runShell(state);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("\n" + usage());
  process.exit(1);
});
