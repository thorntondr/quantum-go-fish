import { dispatchMove } from "../app/controller.js";
import { renderCardHands, type SuitMeta } from "./cardHands.js";
import type { GameState, Move } from "../engine/types.js";

export interface UiBindings {
  stateRoot: HTMLElement;
  statusRoot: HTMLElement;
}

export interface RenderOptions {
  formatPlayer?: (playerId: string) => string;
  formatSuit?: (suitId: string) => string;
  getSuitMeta?: (suitId: string) => SuitMeta | undefined;
  localPlayerId?: string;
}

function formatWinReason(reason?: string): string {
  if (reason === "GuaranteedFourOfSuit") {
    return "guaranteed four-of-a-suit";
  }
  if (reason === "AllCardsKnown") {
    return "all card suits known";
  }
  if (reason === "NotEnoughPlayers") {
    return "not enough active players";
  }
  return "unknown";
}

export function renderState(
  bindings: UiBindings,
  state: GameState,
  options: RenderOptions = {}
): void {
  const formatPlayer = options.formatPlayer ?? ((playerId: string) => playerId);
  const getSuitMeta =
    options.getSuitMeta ??
    ((suitId: string) => {
      const label = (options.formatSuit ?? ((id: string) => id))(suitId);
      return label === suitId ? undefined : { name: label };
    });

  bindings.stateRoot.innerHTML = renderCardHands(state, {
    formatPlayer,
    getSuitMeta,
    localPlayerId: options.localPlayerId
  });
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
