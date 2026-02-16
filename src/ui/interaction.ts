import { dispatchMove } from "../app/controller.js";
import { renderPaperclipTable } from "./paperclips.js";
import type { GameState, Move } from "../engine/types.js";

export interface UiBindings {
  stateRoot: HTMLElement;
  statusRoot: HTMLElement;
}

export function renderState(bindings: UiBindings, state: GameState): void {
  bindings.stateRoot.innerHTML = renderPaperclipTable(state);
  bindings.statusRoot.textContent = `Turn: ${state.turnState.currentPlayer} (${state.turnState.phase})`;
}

export function submitMove(state: GameState, move: Move): GameState {
  return dispatchMove(state, move);
}
