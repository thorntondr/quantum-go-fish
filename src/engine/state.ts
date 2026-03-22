import type { BoundsMatrix, GameState, SetupConfig } from "./types.js";

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
}

export function createInitialState(config: SetupConfig): GameState {
  validateSetup(config);
  const initialSuitMax = config.initialSuitMax ?? 4;

  return {
    players: [...config.players],
    suits: [...config.suits],
    suitTotals: { ...config.suitTotals },
    handSizes: { ...config.handSizes },
    min: buildMatrix(config.players, config.suits, () => 0),
    max: buildMatrix(config.players, config.suits, (suit) => Math.min(config.suitTotals[suit], initialSuitMax)),
    inactivePlayers: [],
    turnState: {
      phase: "Idle",
      currentPlayer: config.startingPlayer
    },
    version: config.version ?? 1
  };
}

export function cloneState(state: GameState): GameState {
  return {
    players: [...state.players],
    suits: [...state.suits],
    suitTotals: { ...state.suitTotals },
    handSizes: { ...state.handSizes },
    min: deepCloneMatrix(state.min, state.players, state.suits),
    max: deepCloneMatrix(state.max, state.players, state.suits),
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
