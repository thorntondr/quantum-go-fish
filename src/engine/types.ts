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
  | "NextTurn"
  | "GameOver";

export type WinReason =
  | "GuaranteedFourOfSuit"
  | "AllCardsKnown"
  | "GuaranteedFourOfSuitAndAllCardsKnown"
  | "NotEnoughPlayers";

export interface PendingAsk {
  asker: PlayerId;
  target: PlayerId;
  suit: SuitId;
}

export interface TurnState {
  phase: TurnPhase;
  currentPlayer: PlayerId;
  pendingAsk?: PendingAsk;
  winner?: PlayerId;
  winReason?: WinReason;
}

export interface DrawPileState {
  playerId: PlayerId;
  suitId: SuitId;
}

export interface GameState {
  players: PlayerId[];
  suits: SuitId[];
  suitTotals: Record<SuitId, number>;
  handSizes: Record<PlayerId, number>;
  min: BoundsMatrix;
  max: BoundsMatrix;
  allOrNothing: boolean;
  drawPile?: DrawPileState;
  inactivePlayers: PlayerId[];
  turnState: TurnState;
  version: number;
}

export type Move =
  | { kind: "Ask"; asker: PlayerId; target: PlayerId; suit: SuitId }
  | { kind: "AnswerYes"; target: PlayerId; suit: SuitId; count?: number }
  | { kind: "AnswerNo"; target: PlayerId; suit: SuitId };

export type LegalResult = { ok: true } | { ok: false; reason: string };

export interface SetupConfig {
  players: PlayerId[];
  suits: SuitId[];
  suitTotals: Record<SuitId, number>;
  handSizes: Record<PlayerId, number>;
  startingPlayer: PlayerId;
  initialSuitMax?: number;
  allOrNothing?: boolean;
  drawPile?: boolean;
  version?: number;
}

export interface ActionEnvelope {
  move: Move;
  actor: PlayerId;
  sequence: number;
  stateHash: string;
}
