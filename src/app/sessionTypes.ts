import type { GameState, Move, PlayerId, SetupConfig, SuitId } from "../engine/types.js";

export type SessionRole = "host" | "peer";
export type ConnectionStatus = "new" | "connecting" | "open" | "closed" | "error" | "reserved" | "inactive";
export type PeerId = string;
export type ClientId = string;

export interface RoomConfig {
  setup: SetupConfig;
}

export interface SuitMeta {
  name?: string;
  symbol?: string;
  color?: string;
}

export interface ConnectionState {
  peerId: PeerId;
  clientId?: ClientId;
  playerId?: PlayerId;
  status: ConnectionStatus;
  label: string;
}

export interface SessionSnapshot {
  state: GameState;
  stateHash: string;
  sessionSeq: number;
}

interface BaseSessionMessage {
  protocolVersion: 1;
  messageId: string;
  sentAt: string;
  fromClientId: ClientId;
  kind:
    | "hello"
    | "welcome"
    | "start_game"
    | "move_request"
    | "move_reject"
    | "state_commit"
    | "sync_request"
    | "sync_response"
    | "setup_update"
    | "peer_joined"
    | "peer_left"
    | "suit_meta"
    | "leave_game"
    | "join_reject"
    | "ping"
    | "pong";
}

export type SessionMessage =
  | (BaseSessionMessage & {
      kind: "hello";
      displayName: string;
    })
  | (BaseSessionMessage & {
      kind: "welcome";
      assignedPlayerId: PlayerId;
      roster: ConnectionState[];
      hostClientId: ClientId;
      suitMeta: Record<SuitId, SuitMeta>;
      setup: SetupConfig;
    })
  | (BaseSessionMessage & {
      kind: "start_game";
      snapshot: SessionSnapshot;
      roster: ConnectionState[];
      suitMeta: Record<SuitId, SuitMeta>;
    })
  | (BaseSessionMessage & {
      kind: "suit_meta";
      suitId: SuitId;
      meta: SuitMeta;
    })
  | (BaseSessionMessage & {
      kind: "leave_game";
    })
  | (BaseSessionMessage & {
      kind: "join_reject";
      reason: string;
    })
  | (BaseSessionMessage & {
      kind: "move_request";
      move: Move;
      knownSeq: number;
      knownHash: string;
    })
  | (BaseSessionMessage & {
      kind: "move_reject";
      reason: string;
      expectedSeq: number;
      expectedHash: string;
    })
  | (BaseSessionMessage & {
      kind: "state_commit";
      acceptedMove: Move;
      snapshot: SessionSnapshot;
    })
  | (BaseSessionMessage & {
      kind: "sync_request";
      knownSeq: number;
      knownHash: string;
    })
  | (BaseSessionMessage & {
      kind: "sync_response";
      snapshot: SessionSnapshot;
      reason: string;
    })
  | (BaseSessionMessage & {
      kind: "setup_update";
      setup: SetupConfig;
    })
  | (BaseSessionMessage & {
      kind: "peer_joined";
      peer: ConnectionState;
      roster: ConnectionState[];
    })
  | (BaseSessionMessage & {
      kind: "peer_left";
      peerId: PeerId;
      roster: ConnectionState[];
    })
  | (BaseSessionMessage & {
      kind: "ping";
      nonce: string;
    })
  | (BaseSessionMessage & {
      kind: "pong";
      nonce: string;
    });

export interface SessionUiHooks {
  onLog: (line: string) => void;
  onSessionError: (message: string) => void;
  onMoveError: (message: string) => void;
  onConnectionsChanged: (connections: ConnectionState[]) => void;
  onSnapshot: (snapshot: SessionSnapshot) => void;
  onAssignedPlayer: (playerId: string | undefined) => void;
  onGameStarted: (started: boolean) => void;
  onSuitMetaChanged: (suitMeta: Record<SuitId, SuitMeta>) => void;
  onSetupChanged: (setup: SetupConfig) => void;
}
