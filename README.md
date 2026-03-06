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
3. Open `web/index.html` from that server in your browser (do not use `file://`).

## Multiplayer playtest flow (PeerJS Cloud)

Use two browser windows/devices: one **Host**, one **Join**.  
For 3-4 players, open additional Join clients with unique local peer ids.

1. Host sets:
   - `Role = Host`
   - `Host Code` (share this value with joiners)
   - `Local Peer ID` (usually same as host code)
2. Joiner sets:
   - `Role = Join`
   - `Host Code` (host's shared code)
   - `Local Peer ID` (unique per joiner)
3. Click `Initialize Session` on all clients.
4. PeerJS Cloud handles signaling and host/peer channels open automatically.
5. When peers are open, host clicks `Start Game`.

After host starts game and assigns you a player, your move buttons enable only when legal for your player/turn.

## Gameplay notes

- Host is authoritative for all moves.
- Peers submit `move_request`; host validates legality and commits canonical state.
- Peers auto-request sync if commit sequence is not contiguous.
- `Request/Send Sync` can be used manually:
  - Host broadcasts authoritative snapshot.
  - Peer requests snapshot from host.

## Project structure

- `src/engine/*`: deterministic game rules, moves, propagation, invariants
- `src/app/*`: session protocol, controller, transport, history/hash
- `src/ui/*`: state rendering utilities
- `src/web/main.ts`: browser integration and controls
- `web/index.html`: playtest interface
- `tests/*`: engine + replay + multiplayer protocol/controller tests

## Current limitations

- Depends on PeerJS Cloud availability for signaling bootstrap.
- No reconnect/resume after full disconnect.
- Host trust model only (not hardened for adversarial peers).
