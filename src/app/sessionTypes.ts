import type { GameState, Move, PlayerId, SetupConfig } from "../engine/types.js";

export type SessionRole = "host" | "peer";
export type ConnectionStatus = "new" | "connecting" | "open" | "closed" | "error";
export type PeerId = string;
export type ClientId = string;

export interface RoomConfig {
  expectedPlayers: number;
  setup: SetupConfig;
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
    | "peer_joined"
    | "peer_left"
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
      expectedPlayers: number;
      hostClientId: ClientId;
    })
  | (BaseSessionMessage & {
      kind: "start_game";
      snapshot: SessionSnapshot;
      roster: ConnectionState[];
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
}
