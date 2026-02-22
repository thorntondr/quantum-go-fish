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

## Multiplayer playtest flow (manual signaling)

Use two browser windows/devices: one **Host**, one **Join**.  
For 3-4 players, repeat the Join steps per peer (host uses a unique `Peer ID` for each).

### Host side

1. Set:
   - `Role = Host`
   - `Players = 2..4`
2. Click `Initialize Session`.
3. Enter `Peer ID` (for example `peer-1`).
4. Click `Create Host Offer`.
5. Copy `Host Signaling -> Offer` text to the joiner.

After joiner replies:

6. Paste joiner answer into `Answer from peer`.
7. Click `Accept Answer`.

ICE exchange (repeat as needed):

8. Click `Collect Local ICE`, copy `Local ICE bundle`, send to joiner.
9. Paste joiner ICE into `Remote ICE bundle from peer`.
10. Click `Apply Remote ICE`.

When peer state is `open`, click `Start Game`.

### Join side

1. Set:
   - `Role = Join`
   - `Name = your label`
   - `Players = same value as host`
2. Click `Initialize Session`.
3. Paste host offer into `Host offer`.
4. Click `Accept Offer + Create Answer`.
5. Copy `Peer answer` back to host.

ICE exchange (repeat as needed):

6. Click `Collect Local ICE`, copy bundle to host.
7. Paste host ICE into `Remote ICE bundle from host`.
8. Click `Apply Remote ICE`.

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

- Signaling is manual copy/paste (no signaling server).
- No reconnect/resume after full disconnect.
- Host trust model only (not hardened for adversarial peers).
