# Disconnect / Reconnect Plan

Reconnect behavior is partially implemented in the session/controller layer, but transport reliability, product expectations, UI messaging, and docs are not yet aligned. This document separates current facts from engineering tasks and PM decisions so the team can move the work forward without overloading `TODO.md`.

## What We Know

- Host/peer multiplayer currently uses PeerJS Cloud for signaling/bootstrap.
- The session controller already supports temporary reserved-seat reconnect windows via seat claims.
- Explicit `leave_game` is treated differently from accidental disconnect.
- Controller tests already cover leave, reconnect, seat-claim expiry, and restart-game cleanup behavior.
- `README.md` still understates or misstates some reconnect support and multiplayer expectations.
- A real-world join failure has been observed on the family PC / Chromebook path, but it has not yet been reproduced locally with diagnostics.

## Dev Team Tasks

### Investigation

- [ ] [Needs playtest] Reproduce the family-PC / Chromebook join failure on real browsers, devices, and network conditions.
- [ ] [Needs playtest] Capture logs, exact room-code behavior, and browser-visible errors during failed joins.
- [ ] [Codex solo] Review the browser/session bootstrap path for readiness races or misleading join-failure handling.
- [ ] [Codex solo] Audit and document the current disconnect/reconnect state machine implemented in `sessionController.ts`.
- [ ] [Codex solo] Determine if it is feasible to intercept back navigation during gameplay.  If so, can we redirect it to the landing page and/or prompt the user for confirmation?  This could reduce accidental disconnects, mitigating the need for reconnects in practice.

### Product / Behavior Definition

- [x] [Needs PM] Define the intended reconnect promise for players.
- [x] [Needs PM] Decide whether host disconnect recovery is in scope.
- [x] [Needs PM] Decide whether reconnect is same-device-only or cross-device.
- [x] [Needs PM] Decide how long reserved seats should persist.
- [x] [Needs PM] Decide whether `Leave Game` is final for the current game.
- [x] [Needs PM] Decide how prominently reconnect / reserved-seat state should appear in the UI.

### Session / Transport Implementation

- [ ] [Codex solo] Add or improve structured diagnostics for host ready, peer ready, `hello`, `welcome`, `join_reject`, and connection state transitions.
- [ ] [Shared follow-up] Harden transport/session behavior based on findings from diagnostics and playtests.
- [ ] [Shared follow-up] Implement the final reconnect semantics once PM decisions are made.

### UI / UX Alignment and Refinement

- [ ] [Needs playtest] Validate whether reconnect UX is understandable in actual multiplayer playtests.
- [ ] [Shared follow-up] Implement final reconnect/reserved-seat UI once PM decisions are made.
- [ ] Remove "Return Home" button and replace it with "Leave Game" button.  Ensure that "Leave Game" button is visible in waiting room and not landing page.

### Tests / Docs

- [ ] [Codex solo] Add targeted automated tests for uncovered disconnect/reconnect controller paths that do not require product decisions.
- [x] [Codex solo] Align `README.md` with the actual currently supported reconnect behavior.
- [ ] [Codex solo] Prepare a follow-up implementation plan once PM answers are available.
- [ ] [Shared follow-up] Prioritize transport hardening vs. UI messaging vs. docs polish based on diagnostics and playtest results.

## PM Questions

1. What user promise are we making for reconnect?
    Answer: peer disconnects are best-effort recoverable for a short window, while host disconnect ends the session.
2. Should host disconnect recovery be in scope for this phase?
    Answer: No host migration for now; host disconnect ends the session cleanly.
3. Is reconnect intended to work only after refresh on the same device, or also across devices/tabs?
    Answer: Same-device only.  Migration is out of scope.
4. How long should a reserved seat remain reclaimable after disconnect?
    Answer: keep the current 2-minute window unless playtesting shows it is too short or confusing.
5. Is `Leave Game` final for that seat in the current game?
    Answer: Yes.
6. How visible should reconnect / reserved-seat state be in the product UI?
    Answer: Surfacing it in the roster plus one prominent top-level notice should suffice.

## Tasks Codex Can Complete Solo

- [ ] Audit and document the current disconnect/reconnect state machine from `sessionController.ts`.
- [ ] Add or improve structured diagnostics for host ready, peer ready, `hello`, `welcome`, `join_reject`, and connection state transitions.
- [x] Align `README.md` with the actual currently supported reconnect behavior.
- [ ] Add targeted automated tests for any currently uncovered disconnect/reconnect controller paths that do not require product decisions.
- [ ] Review the browser/session bootstrap path for readiness races or misleading error handling around join failures.
- [ ] Prepare a follow-up implementation plan once PM answers are available.
