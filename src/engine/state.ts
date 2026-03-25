import { propagate } from "./propagate.js";
import type { BoundsMatrix, GameState, SetupConfig } from "./types.js";

interface CreateInitialStateOptions {
  propagate?: boolean;
}

interface CreateInitialStateTestOnlyOptions {
  propagate: boolean;
}

function buildMatrix(players: string[], suits: string[], fill: (suit: string) => number): BoundsMatrix {
  const matrix: BoundsMatrix = {};
  for (const player of players) {
    matrix[player] = {};
    for (const suit of suits) {
      matrix[player][suit] = fill(suit);
    }
  }
  return matrix;
}

function uniqueReservedId(existing: string[], base: string): string {
  let candidate = base;
  let index = 1;
  while (existing.includes(candidate)) {
    candidate = `${base}_${index}`;
    index += 1;
  }
  return candidate;
}

export function validateSetup(config: SetupConfig): void {
  if (config.players.length === 0) {
    throw new Error("Setup requires at least one player.");
  }
  if (config.suits.length === 0) {
    throw new Error("Setup requires at least one suit.");
  }
  if (config.suits.length !== config.players.length) {
    throw new Error("Setup requires number of suits to equal number of players.");
  }

  for (const player of config.players) {
    if (!(player in config.handSizes)) {
      throw new Error(`Missing hand size for player ${player}.`);
    }
    if (config.handSizes[player] !== 4) {
      throw new Error(`Player ${player} must start with exactly 4 cards.`);
    }
  }

  for (const suit of config.suits) {
    if (!(suit in config.suitTotals)) {
      throw new Error(`Missing suit total for suit ${suit}.`);
    }
    if (config.suitTotals[suit] !== 4) {
      throw new Error(`Suit ${suit} must have exactly 4 total cards.`);
    }
  }

  if (!config.players.includes(config.startingPlayer)) {
    throw new Error(`Starting player ${config.startingPlayer} is not in players.`);
  }

  if (config.initialSuitMax !== undefined) {
    if (!Number.isInteger(config.initialSuitMax) || config.initialSuitMax < 1 || config.initialSuitMax > 4) {
      throw new Error("Initial suit max must be an integer from 1 to 4.");
    }
  }

  if (config.allOrNothing !== undefined && typeof config.allOrNothing !== "boolean") {
    throw new Error("All-or-nothing rule flag must be a boolean when provided.");
  }

  if (config.drawPile !== undefined && typeof config.drawPile !== "boolean") {
    throw new Error("Draw-pile rule flag must be a boolean when provided.");
  }
}

function createInitialStateInternal(config: SetupConfig, options: CreateInitialStateOptions = {}): GameState {
  validateSetup(config);
  const initialSuitMax = config.initialSuitMax ?? 4;
  const drawPile = config.drawPile
    ? {
        playerId: uniqueReservedId(config.players, "__DRAW_PILE__"),
        suitId: uniqueReservedId(config.suits, "__DRAW_SUIT__")
      }
    : undefined;
  const players = drawPile ? [...config.players, drawPile.playerId] : [...config.players];
  const suits = drawPile ? [...config.suits, drawPile.suitId] : [...config.suits];
  const suitTotals = drawPile ? { ...config.suitTotals, [drawPile.suitId]: 4 } : { ...config.suitTotals };
  const handSizes = drawPile ? { ...config.handSizes, [drawPile.playerId]: 4 } : { ...config.handSizes };
  const state: GameState = {
    players,
    suits,
    suitTotals,
    handSizes,
    min: buildMatrix(players, suits, () => 0),
    max: buildMatrix(players, suits, (suit) => {
      if (drawPile && suit in suitTotals) {
        return Math.min(suitTotals[suit], initialSuitMax);
      }
      return Math.min(suitTotals[suit], initialSuitMax);
    }),
    allOrNothing: config.allOrNothing ?? false,
    drawPile,
    inactivePlayers: drawPile ? [drawPile.playerId] : [],
    turnState: {
      phase: "Idle",
      currentPlayer: config.startingPlayer
    },
    version: config.version ?? 1
  };

  if (drawPile) {
    for (const suit of suits) {
      state.max[drawPile.playerId][suit] = suitTotals[suit];
    }
  }

  if (options.propagate ?? true) {
    return propagate(state);
  }
  return state;
}

export function createInitialState(config: SetupConfig): GameState {
  return createInitialStateInternal(config, { propagate: true });
}

export function createInitialStateTestOnly(
  config: SetupConfig,
  options: CreateInitialStateTestOnlyOptions
): GameState {
  return createInitialStateInternal(config, options);
}

export function cloneState(state: GameState): GameState {
  return {
    players: [...state.players],
    suits: [...state.suits],
    suitTotals: { ...state.suitTotals },
    handSizes: { ...state.handSizes },
    min: deepCloneMatrix(state.min, state.players, state.suits),
    max: deepCloneMatrix(state.max, state.players, state.suits),
    allOrNothing: state.allOrNothing,
    drawPile: state.drawPile ? { ...state.drawPile } : undefined,
    inactivePlayers: [...state.inactivePlayers],
    turnState: {
      phase: state.turnState.phase,
      currentPlayer: state.turnState.currentPlayer,
      pendingAsk: state.turnState.pendingAsk ? { ...state.turnState.pendingAsk } : undefined,
      winner: state.turnState.winner,
      winReason: state.turnState.winReason
    },
    version: state.version
  };
}

function deepCloneMatrix(matrix: BoundsMatrix, players: string[], suits: string[]): BoundsMatrix {
  const cloned: BoundsMatrix = {};
  for (const player of players) {
    cloned[player] = {};
    for (const suit of suits) {
      cloned[player][suit] = matrix[player][suit];
    }
  }
  return cloned;
}
