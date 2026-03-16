import { applyMove } from "../engine/moves.js";
import { isLegalMove } from "../engine/rules.js";
import { createInitialState } from "../engine/state.js";
import type { GameState, Move, PlayerId, SetupConfig } from "../engine/types.js";

type ActionRecord = {
  sequence: number;
  actor: PlayerId;
  move: Move;
};

type MatchDetails = {
  player: PlayerId;
  unknownSuitSum: number;
  hand: number;
  minSum: number;
  rhs: number;
};

type FailurePayload = {
  error: string;
  config: SetupConfig;
  sequence: number;
  failingMove: Move;
  stateBefore: GameState;
  actionsBefore: ActionRecord[];
  legalMoves: Move[];
};

function randomInt(minInclusive: number, maxInclusive: number): number {
  const span = maxInclusive - minInclusive + 1;
  return minInclusive + Math.floor(Math.random() * span);
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

function randomConfig(): SetupConfig {
  const playerCount = randomInt(2, 4);
  const players = Array.from({ length: playerCount }, (_, i) => playerLabel(i));
  const suits = Array.from({ length: playerCount }, (_, i) => suitLabel(i));
  const suitTotals: Record<string, number> = Object.fromEntries(suits.map((suit) => [suit, 4]));
  const handSizes: Record<string, number> = Object.fromEntries(players.map((player) => [player, 4]));
  const startingPlayer = players[randomInt(0, players.length - 1)];

  return {
    players,
    suits,
    suitTotals,
    handSizes,
    startingPlayer
  };
}

function listLegalMoves(state: GameState): Move[] {
  if (state.turnState.phase === "GameOver" || state.turnState.winner) {
    return [];
  }

  if (state.turnState.pendingAsk) {
    const pending = state.turnState.pendingAsk;
    const candidates: Move[] = [
      { kind: "AnswerYes", target: pending.target, suit: pending.suit },
      { kind: "AnswerNo", target: pending.target, suit: pending.suit }
    ];
    return candidates.filter((move) => isLegalMove(state, move).ok);
  }

  const current = state.turnState.currentPlayer;
  const moves: Move[] = [];
  for (const target of state.players) {
    if (target === current || state.inactivePlayers.includes(target)) {
      continue;
    }
    for (const suit of state.suits) {
      const move: Move = { kind: "Ask", asker: current, target, suit };
      if (isLegalMove(state, move).ok) {
        moves.push(move);
      }
    }
  }
  return moves;
}

function evaluateCondition(state: GameState): MatchDetails | undefined {
  for (const player of state.players) {
    if (state.inactivePlayers.includes(player)) {
      continue;
    }

    let unknownSuitSum = 0;
    let minSum = 0;
    for (const suit of state.suits) {
      const minValue = state.min[player][suit];
      const maxValue = state.max[player][suit];
      minSum += minValue;
      unknownSuitSum += maxValue - minValue;
    }

    const hand = state.handSizes[player];
    const rhs = 2 * (hand - minSum);
    if (unknownSuitSum < rhs) {
      return { player, unknownSuitSum, hand, minSum, rhs };
    }
  }

  return undefined;
}

function actorForMove(move: Move): PlayerId {
  return move.kind === "Ask" ? move.asker : move.target;
}

function run(): void {
  const maxStepsPerGame = 10000;

  while (true) {
    const config = randomConfig();
    let state = createInitialState(config);
    const actions: ActionRecord[] = [];

    for (let step = 0; step < maxStepsPerGame; step += 1) {
      const legalMoves = listLegalMoves(state);
      if (legalMoves.length === 0) {
        break;
      }

      const move = legalMoves[randomInt(0, legalMoves.length - 1)];
      const action: ActionRecord = {
        sequence: actions.length + 1,
        actor: actorForMove(move),
        move
      };
      try {
        state = applyMove(state, move);
        actions.push(action);
      } catch (error) {
        const payload: FailurePayload = {
          error: error instanceof Error ? error.message : String(error),
          config,
          sequence: action.sequence,
          failingMove: action.move,
          stateBefore: state,
          actionsBefore: actions,
          legalMoves
        };
        console.log(JSON.stringify(payload, null, 2));
        throw error;
      }

      const match = evaluateCondition(state);
      if (match) {
        const payload = {
          matchingPlayer: match.player,
          matchingPlayerStats: {
            unknownSuitSum: match.unknownSuitSum,
            hand: match.hand,
            minSum: match.minSum,
            rhs: match.rhs
          },
          config,
          actions,
          state
        };
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      if (state.turnState.phase === "GameOver" || state.turnState.winner) {
        break;
      }
    }
  }
}

run();
