import { applyMove } from "../engine/moves.js";
import { cloneState } from "../engine/state.js";
import type { GameState, Move } from "../engine/types.js";
import { stateHash } from "./hash.js";

export interface HistoryEntry {
  move: Move;
  beforeHash: string;
  afterHash: string;
  timestamp: string;
}

export interface HistoryState {
  initial: GameState;
  snapshots: GameState[];
  entries: HistoryEntry[];
  index: number;
}

export function createHistory(initial: GameState): HistoryState {
  return {
    initial: cloneState(initial),
    snapshots: [cloneState(initial)],
    entries: [],
    index: 0
  };
}

export function currentState(history: HistoryState): GameState {
  return cloneState(history.snapshots[history.index]);
}

export function applyMoveToHistory(history: HistoryState, move: Move): HistoryState {
  const base = currentState(history);
  const next = applyMove(base, move);

  const prunedSnapshots = history.snapshots.slice(0, history.index + 1);
  const prunedEntries = history.entries.slice(0, history.index);

  const entry: HistoryEntry = {
    move,
    beforeHash: stateHash(base),
    afterHash: stateHash(next),
    timestamp: new Date().toISOString()
  };

  const snapshots = [...prunedSnapshots, cloneState(next)];
  const entries = [...prunedEntries, entry];

  return {
    initial: cloneState(history.initial),
    snapshots,
    entries,
    index: snapshots.length - 1
  };
}

export function replay(initial: GameState, moves: Move[]): GameState {
  let state = cloneState(initial);
  for (const move of moves) {
    state = applyMove(state, move);
  }
  return state;
}

export function undo(history: HistoryState): HistoryState {
  const nextIndex = Math.max(0, history.index - 1);
  return {
    initial: cloneState(history.initial),
    snapshots: history.snapshots.map(cloneState),
    entries: [...history.entries],
    index: nextIndex
  };
}
