import type { PeerId, SessionMessage } from "./sessionTypes.js";

export interface SessionTransport {
  send: (to: PeerId, message: SessionMessage) => void;
  broadcast: (message: SessionMessage) => void;
  listPeers: () => PeerId[];
  onMessage: (handler: (from: PeerId, message: SessionMessage) => void) => void;
  onPeerState: (handler: (peerId: PeerId, status: "new" | "connecting" | "open" | "closed" | "error") => void) => void;
  close: () => void;
}
