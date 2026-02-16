export type PlayerId = string;
export type SuitId = string;

export interface BoundsMatrix {
  [playerId: PlayerId]: { [suitId: SuitId]: number };
}

export type TurnPhase =
  | "Idle"
  | "Asking"
  | "AwaitingAnswer"
  | "Resolving"
  | "Propagating"
  | "NextTurn";

export interface PendingAsk {
  asker: PlayerId;
  target: PlayerId;
  suit: SuitId;
}

export interface TurnState {
  phase: TurnPhase;
  currentPlayer: PlayerId;
  pendingAsk?: PendingAsk;
}

export interface GameState {
  players: PlayerId[];
  suits: SuitId[];
  suitTotals: Record<SuitId, number>;
  handSizes: Record<PlayerId, number>;
  min: BoundsMatrix;
  max: BoundsMatrix;
  turnState: TurnState;
  version: number;
}

export type Move =
  | { kind: "Ask"; asker: PlayerId; target: PlayerId; suit: SuitId }
  | { kind: "AnswerYes"; target: PlayerId; suit: SuitId }
  | { kind: "AnswerNo"; target: PlayerId; suit: SuitId };

export type LegalResult = { ok: true } | { ok: false; reason: string };

export interface SetupConfig {
  players: PlayerId[];
  suits: SuitId[];
  suitTotals: Record<SuitId, number>;
  handSizes: Record<PlayerId, number>;
  startingPlayer: PlayerId;
  version?: number;
}

export interface ActionEnvelope {
  move: Move;
  actor: PlayerId;
  sequence: number;
  stateHash: string;
}
