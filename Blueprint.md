# Quantum Go Fish — Deductive Card Game Engine

## Overview

Quantum Go Fish is a digital implementation of a Go Fish–style deduction game built around **explicit uncertainty tracking**.

Instead of storing exact hidden hands, the system maintains a **canonical knowledge state** for each player and suit:

* `min[player][suit]` — minimum cards the player must have
* `max[player][suit]` — maximum cards the player could have

All move legality, inference, and visualization derive strictly from this representation.

The engine is designed to be:

* Deterministic
* Monotonic under propagation
* UI-agnostic
* Multiplayer-ready

---

## Design Principles

### 1. Canonical State is the Single Source of Truth

There is no hidden parallel model.
No UI-derived knowledge.
No inferred assumptions outside propagation.

All logic flows from:

```
State = {
  min: matrix[player][suit],
  max: matrix[player][suit],
  handSizes: player → int,
  turnState: phase descriptor
}
```

---

### 2. Legality is Based on Possibility

Moves are validated against `min` and `max`:

* **Ask(P → Q, S)** is legal iff
  `max[P][S] > 0`

* **YES(Q, S)** is legal iff
  `max[Q][S] > 0`

* **NO(Q, S)** is legal iff
  `min[Q][S] == 0`

We check what is *possible*, not what is known.

---

### 3. State Mutation and Propagation Are Separate

Every move follows this sequence:

1. Validate preconditions
2. Apply immediate postconditions
3. Run propagation
4. Verify invariants

Propagation must:

* Be monotonic
* Never create impossible knowledge
* Converge deterministically
* Be idempotent

---

### 4. Visualization Mirrors State

The paperclip UI is a direct rendering of:

* Guaranteed cards → solid clips (`min`)
* Possible cards → ghost clips (`max`)
* Uncertainty → visible gap

The UI never performs reasoning.

---

## Architecture

```
/engine
  rules.ts
  state.ts
  moves.ts
  propagate.ts
  invariants.ts

/ui
  paperclips.ts
  interaction.ts
  turnController.ts

/app
  controller.ts
  history.ts
  serialization.ts

/tests
  engine.spec.ts
  propagation.spec.ts
  invariants.spec.ts
```

---

## Core Modules

### Engine

Responsible for correctness.

Public API:

```
isLegalMove(state, move) → boolean
applyMove(state, move) → newState
propagate(state) → newState
```

Properties:

* No UI dependencies
* Immutable state updates
* Assertion-backed invariants

---

### Propagation

Constraint-based refinement of bounds.

Examples:

* If `min == max`, the value is fixed.
* If a player's remaining hand size is known, bounds tighten.
* If total suit counts constrain distribution, adjust per player.

Must guarantee:

* `min ≤ max`
* Suit totals preserved
* Hand sizes respected

---

### Turn Controller

Explicit state machine:

```
Idle
→ Asking
→ AwaitingAnswer
→ Resolving
→ Propagating
→ NextTurn
```

No implicit transitions.

---

### History System

Supports:

* Undo
* Replay
* Deterministic re-execution
* Debugging

State transitions must be reproducible from initial conditions.

---

## Invariants

The engine must enforce:

1. `0 ≤ min[P][S] ≤ max[P][S]`
2. `Σ_suits min[P][S] ≤ handSize[P]`
3. `Σ_suits max[P][S] ≥ handSize[P]`
4. Suit totals conserved
5. Propagation never decreases certainty incorrectly

Violations throw hard errors.

---

## Testing Strategy

### Unit Tests

* Move legality
* Postconditions
* Propagation adjustments

### Property Tests

* Invariants hold after arbitrary legal sequences
* Propagation is idempotent

### Golden Scenarios

Hand-constructed edge cases:

* Tight bounds
* Near-zero uncertainty
* Multi-step inference chains
* Previously observed bugs

---

## Development Phases

### Phase 1 — Engine Stabilization

* Finalize rules
* Fix propagation bugs
* Add full invariant coverage

### Phase 2 — UX Refinement

* Clarify visual semantics
* Clean interaction flow
* Distinguish player action vs inference

### Phase 3 — Architectural Hardening

* Serialization
* Undo/replay
* Strict separation of concerns

### Phase 4 — Multiplayer Preparation

* Authoritative validation model
* State diffing
* Transport abstraction

---

## Non-Goals (Current Version)

* AI opponent
* Hidden physical deck simulation
* Complex animations
* Mobile optimization

---

## Success Criteria

The system is considered stable when:

* All invariants hold under random legal play
* Propagation bugs are eliminated
* UI never diverges from canonical state
* State can be replayed deterministically
* No illegal move can be executed via UI or API

---

## Guiding Constraint

If there is ever a discrepancy between:

* What the UI shows
* What a developer expects
* What propagation infers

The canonical min/max state wins.

Everything else must adapt.
