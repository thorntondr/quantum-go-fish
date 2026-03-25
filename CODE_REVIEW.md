# Code Review: Duplicate Code

Scope reviewed: `src/`, `tests/`, and the main app entrypoints.

## Findings

### Medium: suit-meta normalization and application logic is duplicated in both session roles

The host and peer halves of [src/app/sessionController.ts](/d:/quantum-go-fish/src/app/sessionController.ts) each define their own `emitSuitMeta`, `normalizeSuitMeta`, `hasSuitMeta`, and `applySuitMeta` helpers with nearly identical implementations.

- Host copy: [src/app/sessionController.ts](/d:/quantum-go-fish/src/app/sessionController.ts#L265), [src/app/sessionController.ts](/d:/quantum-go-fish/src/app/sessionController.ts#L269), [src/app/sessionController.ts](/d:/quantum-go-fish/src/app/sessionController.ts#L273), [src/app/sessionController.ts](/d:/quantum-go-fish/src/app/sessionController.ts#L290), [src/app/sessionController.ts](/d:/quantum-go-fish/src/app/sessionController.ts#L294)
- Peer copy: [src/app/sessionController.ts](/d:/quantum-go-fish/src/app/sessionController.ts#L735), [src/app/sessionController.ts](/d:/quantum-go-fish/src/app/sessionController.ts#L739), [src/app/sessionController.ts](/d:/quantum-go-fish/src/app/sessionController.ts#L743), [src/app/sessionController.ts](/d:/quantum-go-fish/src/app/sessionController.ts#L760), [src/app/sessionController.ts](/d:/quantum-go-fish/src/app/sessionController.ts#L764)

Why this is needlessly duplicated:

- The normalization rules are the same in both places.
- The "first writer wins" behavior is also the same.
- Any future change to suit-meta semantics has to be made twice and kept behaviorally aligned by hand.

Suggested refactor:

- Extract pure helpers such as `normalizeSuitMeta` and `hasSuitMeta` into a shared module.
- Consider a small `applySuitMetaOnce(store, suitId, meta)` helper that both host and peer can wrap with their different return-value needs.

### Medium: game-setup and move-derivation helpers are reimplemented in multiple entrypoints

The browser entrypoint redefines player/suit naming, setup construction, ask generation, and answer derivation locally instead of reusing shared helpers.

- Browser implementation: [src/web/main.ts](/d:/quantum-go-fish/src/web/main.ts#L296), [src/web/main.ts](/d:/quantum-go-fish/src/web/main.ts#L304), [src/web/main.ts](/d:/quantum-go-fish/src/web/main.ts#L308), [src/web/main.ts](/d:/quantum-go-fish/src/web/main.ts#L333), [src/web/main.ts](/d:/quantum-go-fish/src/web/main.ts#L355), [src/web/main.ts](/d:/quantum-go-fish/src/web/main.ts#L385), [src/web/main.ts](/d:/quantum-go-fish/src/web/main.ts#L432), [src/web/main.ts](/d:/quantum-go-fish/src/web/main.ts#L448)
- CLI duplicates the player/suit label rules and setup shaping: [src/cli/index.ts](/d:/quantum-go-fish/src/cli/index.ts#L280), [src/cli/index.ts](/d:/quantum-go-fish/src/cli/index.ts#L288), [src/cli/index.ts](/d:/quantum-go-fish/src/cli/index.ts#L303)
- Tests duplicate move enumeration again: [tests/helpers.ts](/d:/quantum-go-fish/tests/helpers.ts#L16)

Why this is needlessly duplicated:

- Player naming (`A`, `B`, ..., `P27`) and suit naming (`S1`, `S2`, ...) are domain rules, not UI-only rules.
- `legalAsks` and test-only move enumeration are both building the same move space from state.
- The browser's `legalYesCounts` and `legalAnswerMoves` encode turn rules outside the engine layer, increasing drift risk.

Suggested refactor:

- Move label/setup helpers into a shared app or engine utility module.
- Add shared move-derivation helpers such as `enumerateLegalAsks(state, asker)` and `enumerateLegalAnswers(state)`.
- Let CLI, web, and tests depend on those helpers rather than each carrying their own copy.

### Low: suit-presentation rules are split across two UI modules

[`src/ui/cardHands.ts`](/d:/quantum-go-fish/src/ui/cardHands.ts#L163) defines `defaultSymbolForSuit`, `resolveSuitName`, and `resolveSuitSymbol`, while [`src/ui/suitPresentation.ts`](/d:/quantum-go-fish/src/ui/suitPresentation.ts#L6) already owns default-symbol lookup and formatted label generation.

- Local wrapper and duplicated fallback logic: [src/ui/cardHands.ts](/d:/quantum-go-fish/src/ui/cardHands.ts#L163), [src/ui/cardHands.ts](/d:/quantum-go-fish/src/ui/cardHands.ts#L167), [src/ui/cardHands.ts](/d:/quantum-go-fish/src/ui/cardHands.ts#L174)
- Existing shared presentation helper: [src/ui/suitPresentation.ts](/d:/quantum-go-fish/src/ui/suitPresentation.ts#L6), [src/ui/suitPresentation.ts](/d:/quantum-go-fish/src/ui/suitPresentation.ts#L11)

Why this is needlessly duplicated:

- Both modules are responsible for "meta symbol if present, otherwise default symbol."
- The wrapper `defaultSymbolForSuit` in `cardHands.ts` adds no behavior beyond forwarding to `getDefaultSuitSymbol`.

Suggested refactor:

- Keep all suit text/symbol resolution in `suitPresentation.ts`.
- Have `cardHands.ts` call shared helpers for known suits and keep only the `UNKNOWN_SUIT_ID` special case locally.

### Low: connection-roster replacement code repeats across peer-session message handlers

The peer session clears and repopulates the `connections` map in several message branches instead of using one shared updater.

- Repeated roster replacement in [src/app/sessionController.ts](/d:/quantum-go-fish/src/app/sessionController.ts#L834), [src/app/sessionController.ts](/d:/quantum-go-fish/src/app/sessionController.ts#L865), [src/app/sessionController.ts](/d:/quantum-go-fish/src/app/sessionController.ts#L911)

Why this is needlessly duplicated:

- `welcome`, `start_game`, and `peer_joined`/`peer_left` all perform the same "replace local roster from message, then refresh hooks" flow.
- This makes the peer message dispatcher longer and easier to desynchronize when roster behavior changes.

Suggested refactor:

- Extract a small `replaceConnectionsFromRoster(roster)` helper inside `createPeerSession`.

## Summary

The largest avoidable duplication is in session handling and in entrypoint-specific game-rule helpers. If you want the biggest maintenance win first, I'd start with:

1. Shared suit-meta helpers for host/peer session code.
2. Shared setup/label/legal-move helpers used by web, CLI, and tests.
3. Shared suit-presentation helpers so UI rendering has one source of truth.
