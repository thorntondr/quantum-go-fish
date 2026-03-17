import { cloneState } from "./state.js";
import type { GameState } from "./types.js";

type BoundsOverride = {
  player: string;
  suit: string;
  min?: number;
  max?: number;
};

type Edge = {
  to: number;
  rev: number;
  cap: number;
};

function addEdge(graph: Edge[][], from: number, to: number, cap: number): void {
  graph[from].push({ to, rev: graph[to].length, cap });
  graph[to].push({ to: from, rev: graph[from].length - 1, cap: 0 });
}

function maxFlow(graph: Edge[][], source: number, sink: number): number {
  let flow = 0;
  const n = graph.length;
  while (true) {
    const parent = Array.from({ length: n }, () => ({ node: -1, edge: -1 }));
    const queue: number[] = [source];
    parent[source] = { node: source, edge: -1 };

    for (let qi = 0; qi < queue.length; qi += 1) {
      const v = queue[qi];
      if (v === sink) {
        break;
      }
      for (let i = 0; i < graph[v].length; i += 1) {
        const edge = graph[v][i];
        if (edge.cap <= 0 || parent[edge.to].node !== -1) {
          continue;
        }
        parent[edge.to] = { node: v, edge: i };
        queue.push(edge.to);
      }
    }

    if (parent[sink].node === -1) {
      break;
    }

    let aug = Number.POSITIVE_INFINITY;
    for (let v = sink; v !== source; ) {
      const p = parent[v];
      const edge = graph[p.node][p.edge];
      aug = Math.min(aug, edge.cap);
      v = p.node;
    }

    for (let v = sink; v !== source; ) {
      const p = parent[v];
      const edge = graph[p.node][p.edge];
      edge.cap -= aug;
      graph[v][edge.rev].cap += aug;
      v = p.node;
    }

    flow += aug;
  }
  return flow;
}

function isFeasible(state: GameState, override?: BoundsOverride): boolean {
  const players = state.players;
  const suits = state.suits;
  const playerCount = players.length;
  const suitCount = suits.length;

  const playerIndex = new Map(players.map((p, i) => [p, i]));
  const suitIndex = new Map(suits.map((s, i) => [s, i]));

  const minMatrix: number[][] = Array.from({ length: playerCount }, () =>
    Array.from({ length: suitCount }, () => 0)
  );
  const maxMatrix: number[][] = Array.from({ length: playerCount }, () =>
    Array.from({ length: suitCount }, () => 0)
  );

  for (let pi = 0; pi < playerCount; pi += 1) {
    const player = players[pi];
    for (let si = 0; si < suitCount; si += 1) {
      const suit = suits[si];
      minMatrix[pi][si] = state.min[player][suit];
      maxMatrix[pi][si] = state.max[player][suit];
    }
  }

  if (override) {
    const pi = playerIndex.get(override.player);
    const si = suitIndex.get(override.suit);
    if (pi === undefined || si === undefined) {
      return false;
    }
    if (override.min !== undefined) {
      minMatrix[pi][si] = override.min;
    }
    if (override.max !== undefined) {
      maxMatrix[pi][si] = override.max;
    }
  }

  const playerRemaining: number[] = [];
  for (let pi = 0; pi < playerCount; pi += 1) {
    const player = players[pi];
    const minSum = minMatrix[pi].reduce((acc, v) => acc + v, 0);
    const remaining = state.handSizes[player] - minSum;
    if (remaining < 0) {
      return false;
    }
    playerRemaining.push(remaining);
  }

  const suitRemaining: number[] = [];
  for (let si = 0; si < suitCount; si += 1) {
    const suit = suits[si];
    let minSum = 0;
    for (let pi = 0; pi < playerCount; pi += 1) {
      minSum += minMatrix[pi][si];
    }
    const remaining = state.suitTotals[suit] - minSum;
    if (remaining < 0) {
      return false;
    }
    suitRemaining.push(remaining);
  }

  const nodeCount = 2 + playerCount + suitCount;
  const source = 0;
  const sink = nodeCount - 1;
  const graph: Edge[][] = Array.from({ length: nodeCount }, () => []);

  let totalDemand = 0;
  for (let pi = 0; pi < playerCount; pi += 1) {
    addEdge(graph, source, 1 + pi, playerRemaining[pi]);
  }
  for (let si = 0; si < suitCount; si += 1) {
    totalDemand += suitRemaining[si];
    addEdge(graph, 1 + playerCount + si, sink, suitRemaining[si]);
  }

  for (let pi = 0; pi < playerCount; pi += 1) {
    for (let si = 0; si < suitCount; si += 1) {
      const cap = maxMatrix[pi][si] - minMatrix[pi][si];
      if (cap < 0) {
        return false;
      }
      addEdge(graph, 1 + pi, 1 + playerCount + si, cap);
    }
  }

  const flow = maxFlow(graph, source, sink);
  return flow === totalDemand;
}

function tightenGlobalBounds(state: GameState): boolean {
  let changed = false;
  const players = state.players;
  const suits = state.suits;

  if (!isFeasible(state)) {
    throw new Error("Propagation found no feasible assignment for current bounds.");
  }

  for (const player of players) {
    for (const suit of suits) {
      const currentMin = state.min[player][suit];
      const currentMax = state.max[player][suit];

      let newMin = currentMin;
      for (let candidate = currentMin; candidate <= currentMax; candidate += 1) {
        if (isFeasible(state, { player, suit, max: candidate })) {
          newMin = candidate;
          break;
        }
      }

      let newMax = currentMax;
      for (let candidate = currentMax; candidate >= newMin; candidate -= 1) {
        if (isFeasible(state, { player, suit, min: candidate })) {
          newMax = candidate;
          break;
        }
      }

      if (newMin !== currentMin) {
        state.min[player][suit] = newMin;
        changed = true;
      }
      if (newMax !== currentMax) {
        state.max[player][suit] = newMax;
        changed = true;
      }
    }
  }

  return changed;
}

function tightenPlayerBounds(state: GameState, player: string, suit: string): boolean {
  const handSize = state.handSizes[player];
  const minOthers = state.suits
    .filter((s) => s !== suit)
    .reduce((acc, s) => acc + state.min[player][s], 0);
  const maxOthers = state.suits
    .filter((s) => s !== suit)
    .reduce((acc, s) => acc + state.max[player][s], 0);

  const newMax = Math.max(0, Math.min(state.max[player][suit], handSize - minOthers));
  const newMin = Math.min(state.suitTotals[suit], Math.max(state.min[player][suit], handSize - maxOthers));

  let changed = false;
  if (newMax !== state.max[player][suit]) {
    state.max[player][suit] = newMax;
    changed = true;
  }
  if (newMin !== state.min[player][suit]) {
    state.min[player][suit] = newMin;
    changed = true;
  }
  return changed;
}

function tightenSuitBounds(state: GameState, player: string, suit: string): boolean {
  const total = state.suitTotals[suit];
  const minOthers = state.players
    .filter((p) => p !== player)
    .reduce((acc, p) => acc + state.min[p][suit], 0);
  const maxOthers = state.players
    .filter((p) => p !== player)
    .reduce((acc, p) => acc + state.max[p][suit], 0);

  const newMax = Math.max(0, Math.min(state.max[player][suit], total - minOthers));
  const newMin = Math.min(total, Math.max(state.min[player][suit], total - maxOthers));

  let changed = false;
  if (newMax !== state.max[player][suit]) {
    state.max[player][suit] = newMax;
    changed = true;
  }
  if (newMin !== state.min[player][suit]) {
    state.min[player][suit] = newMin;
    changed = true;
  }
  return changed;
}

export function propagate(input: GameState): GameState {
  const state = cloneState(input);

  let changed: boolean;
  let loopGuard = 0;
  do {
    changed = false;
    for (const player of state.players) {
      for (const suit of state.suits) {
        if (tightenPlayerBounds(state, player, suit)) {
          changed = true;
        }
      }
    }

    for (const suit of state.suits) {
      for (const player of state.players) {
        if (tightenSuitBounds(state, player, suit)) {
          changed = true;
        }
      }
    }

    if (tightenGlobalBounds(state)) {
      changed = true;
    }

    loopGuard += 1;
    if (loopGuard > 1024) {
      throw new Error("Propagation did not converge within loop guard.");
    }
  } while (changed);

  return state;
}
