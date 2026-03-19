# Quantum Go Fish

Deterministic deduction engine for a Go Fish-style game, with a browser playtest UI and host-authoritative WebRTC multiplayer.

## Requirements

- Node.js 20+ (Node 22 recommended)
- npm
- Modern browser with WebRTC DataChannel support

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

Compiled output is written to `dist/`.

## Test

```bash
npm test
```

This runs TypeScript build + Node test suite (engine + session/protocol tests).

## Run the web playtest UI

1. Build once:
   ```bash
   npm run build
   ```
2. Serve the repo root with any static server (example):
   ```bash
   npx serve .
   ```
3. Open `web/index.html` from that server in your browser for the default single-device mode (do not use `file://`).
4. Open `web/multi_device_beta.html` for the host/join multiplayer beta UI.

## Multiplayer playtest flow (PeerJS Cloud)

Use two browser windows/devices: one **Host**, one **Join**.  
For 3-4 players, open additional Join clients.

1. Host enters a name and clicks `Host`.
2. The app creates a room code and share link in the waiting room.
3. Each joiner enters a name, pastes the host's room code into `Room Code to Join`, and clicks `Join`.
4. PeerJS Cloud handles signaling and host/peer channels open automatically.
5. When players are connected, the host clicks `Start Game`.

After host starts game and assigns you a player, your move buttons enable only when legal for your player/turn.

## Gameplay notes

- Host is authoritative for all moves.
- Peers submit `move_request`; host validates legality and commits canonical state.
- Peers auto-request sync if commit sequence is not contiguous.
- Non-host peers can use `Leave Game` to exit the current game; this is treated as final for that seat.
- If a non-host peer disconnects unexpectedly, the host reserves that seat for about 2 minutes and may pause the game if that player is needed to act.
- `Request/Send Sync` can be used manually:
  - Host broadcasts authoritative snapshot.
  - Peer requests snapshot from host.

## Project structure

- `src/engine/*`: deterministic game rules, moves, propagation, invariants
- `src/app/*`: session protocol, controller, transport, history/hash
- `src/ui/*`: state rendering utilities
- `src/web/main.ts`: multiplayer browser integration and controls
- `src/web/singleDevice.ts`: single-device browser integration and controls
- `web/index.html`: default single-device playtest interface
- `web/multi_device_beta.html`: host/join multiplayer beta interface
- `tests/*`: engine + replay + multiplayer protocol/controller tests

## Current limitations

- Depends on PeerJS Cloud availability for signaling bootstrap.
- Host disconnect ends the session; host migration is not supported.
- The controller has partial same-device reconnect support for non-host peers, but the browser UI does not yet expose a polished resume flow after refresh or a full disconnect.
- Host trust model only (not hardened for adversarial peers).
