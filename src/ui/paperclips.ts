import type { GameState } from "../engine/types.js";

function cellContent(min: number, max: number): string {
  if (max === 0) {
    return "<span class=\"impossible\">X</span>";
  }
  const guaranteed = min > 0 ? `${min}` : "";
  const ghosts = max - min;
  const ghostMarks = ghosts > 0 ? ` <span class=\"ghost\">${"?".repeat(Math.min(ghosts, 4))}</span>` : "";
  return `<span class=\"guaranteed\">${guaranteed}</span>${ghostMarks}`;
}

export function renderPaperclipTable(
  state: GameState,
  formatPlayer: (playerId: string) => string = (playerId) => playerId,
  formatSuit: (suitId: string) => string = (suitId) => suitId
): string {
  let html = "<table><thead><tr><th>Player</th>";
  for (const suit of state.suits) {
    html += `<th>${formatSuit(suit)}</th>`;
  }
  html += "<th>Hand</th></tr></thead><tbody>";

  for (const player of state.players) {
    html += `<tr><td>${formatPlayer(player)}</td>`;
    for (const suit of state.suits) {
      html += `<td>${cellContent(state.min[player][suit], state.max[player][suit])}</td>`;
    }
    html += `<td>${state.handSizes[player]}</td></tr>`;
  }

  html += "</tbody></table>";
  return html;
}
