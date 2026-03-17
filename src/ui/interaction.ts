import { dispatchMove } from "../app/controller.js";
import { renderCardHands, type SuitMeta } from "./cardHands.js";
import { renderPaperclipTable } from "./paperclips.js";
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
  highlightedPlayerId?: string;
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
  const winner = state.turnState.phase === "GameOver" ? state.turnState.winner : undefined;
  const isGameOver = state.turnState.phase === "GameOver" && Boolean(winner);
  const getSuitMeta =
    options.getSuitMeta ??
    ((suitId: string) => {
      const label = (options.formatSuit ?? ((id: string) => id))(suitId);
      return label === suitId ? undefined : { name: label };
    });

  const cardHtml = renderCardHands(state, {
    formatPlayer,
    getSuitMeta,
    localPlayerId: options.localPlayerId,
    highlightedPlayerId: options.highlightedPlayerId,
    winnerPlayerId: winner
  });
  const tableHtml = renderPaperclipTable(state, formatPlayer, options.formatSuit);
  const gameOverBanner = isGameOver
    ? `
    <section class="game-over-banner" aria-live="polite">
      <p class="game-over-eyebrow">Game Over</p>
      <h3>${formatPlayer(winner ?? state.turnState.currentPlayer)} wins</h3>
      <p>Reason: ${formatWinReason(state.turnState.winReason)}</p>
    </section>
  `
    : "";
  bindings.stateRoot.innerHTML = `
    ${gameOverBanner}
    ${cardHtml}
    <div class="debug-table ${isGameOver ? "debug-table--game-over" : ""}">
      ${tableHtml}
    </div>
  `;
  if (isGameOver && state.turnState.winner) {
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
