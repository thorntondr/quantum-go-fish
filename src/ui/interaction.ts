import { dispatchMove } from "../app/controller.js";
import { renderPaperclipTable } from "./paperclips.js";
import type { GameState, Move } from "../engine/types.js";

export interface UiBindings {
  stateRoot: HTMLElement;
  statusRoot: HTMLElement;
}

function formatWinReason(reason?: string): string {
  if (reason === "GuaranteedFourOfSuit") {
    return "guaranteed four-of-a-suit";
  }
  if (reason === "AllCardsKnown") {
    return "all card suits known";
  }
  return "unknown";
}

export function renderState(
  bindings: UiBindings,
  state: GameState,
  formatPlayer: (playerId: string) => string = (playerId) => playerId,
  formatSuit: (suitId: string) => string = (suitId) => suitId
): void {
  bindings.stateRoot.innerHTML = renderPaperclipTable(state, formatPlayer, formatSuit);
  if (state.turnState.phase === "GameOver" && state.turnState.winner) {
    bindings.statusRoot.textContent =
      `Game Over. Winner: ${formatPlayer(state.turnState.winner)} (${formatWinReason(state.turnState.winReason)})`;
    return;
  }
  bindings.statusRoot.textContent =
    `Turn: ${formatPlayer(state.turnState.currentPlayer)} (${state.turnState.phase})`;
}

export function submitMove(state: GameState, move: Move): GameState {
  return dispatchMove(state, move);
}
