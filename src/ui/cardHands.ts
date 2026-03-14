import type { GameState, PlayerId, SuitId } from "../engine/types.js";

export interface SuitMeta {
  name?: string;
  symbol?: string;
  color?: string;
}

export interface RenderCardsOptions {
  formatPlayer: (playerId: PlayerId) => string;
  getSuitMeta: (suitId: SuitId) => SuitMeta | undefined;
  localPlayerId?: PlayerId;
}

const DEFAULT_SUIT_SYMBOLS = ["◼", "▲", "◆", "●", "⬟", "⬣", "★", "✚"];
const UNKNOWN_LABEL = "Unknown";
const UNKNOWN_COLOR = "#d6d9de";

interface CardModel {
  bands: SuitId[];
}

function buildCardsForPlayer(state: GameState, playerId: PlayerId): CardModel[] {
  const total = state.handSizes[playerId] ?? 0;
  const cards: CardModel[] = Array.from({ length: total }, () => ({ bands: [] }));
  let frontIndex = 0;

  for (const suit of state.suits) {
    const min = state.min[playerId]?.[suit] ?? 0;
    const max = state.max[playerId]?.[suit] ?? 0;
    const guaranteed = Math.max(0, min);
    const possible = Math.max(0, max - min);

    for (let i = 0; i < guaranteed && frontIndex < cards.length; i += 1) {
      cards[frontIndex].bands.push(suit);
      frontIndex += 1;
    }

    for (let i = 0; i < possible; i += 1) {
      const index = total - 1 - i;
      if (index < 0 || index >= cards.length) {
        continue;
      }
      cards[index].bands.push(suit);
    }
  }

  return cards;
}

function defaultSymbolForSuit(suit: SuitId, suits: SuitId[]): string {
  const index = Math.max(0, suits.indexOf(suit));
  return DEFAULT_SUIT_SYMBOLS[index % DEFAULT_SUIT_SYMBOLS.length];
}

function resolveSuitName(suitMeta: SuitMeta | undefined): string {
  return suitMeta?.name?.trim() || UNKNOWN_LABEL;
}

function resolveSuitSymbol(suit: SuitId, suits: SuitId[], suitMeta: SuitMeta | undefined): string {
  const symbol = suitMeta?.symbol?.trim();
  return symbol && symbol.length > 0 ? symbol : defaultSymbolForSuit(suit, suits);
}

function resolveSuitColor(suitMeta: SuitMeta | undefined): string {
  return suitMeta?.color?.trim() || UNKNOWN_COLOR;
}

function renderBand(
  suit: SuitId,
  suits: SuitId[],
  suitMeta: SuitMeta | undefined,
  options: {
    includeCenter: boolean;
    includeName: boolean;
    includeTopLeft: boolean;
    includeBottomRight: boolean;
  }
): string {
  const symbol = resolveSuitSymbol(suit, suits, suitMeta);
  const label = resolveSuitName(suitMeta);
  const color = resolveSuitColor(suitMeta);
  const cornerHtml = `
      ${options.includeTopLeft ? `<div class="band-corner band-corner--tl">${symbol}</div>` : ""}
      ${options.includeBottomRight ? `<div class="band-corner band-corner--br">${symbol}</div>` : ""}
    `;
  const centerHtml = options.includeCenter
    ? `
      <div class="band-center">
        <div class="band-symbol">${symbol}</div>
        ${options.includeName ? `<div class="band-name">${label}</div>` : ""}
      </div>
    `
    : "";
  return `
    <div class="card-band" style="--band-color: ${color}">
      ${cornerHtml}
      ${centerHtml}
    </div>
  `;
}

function renderFrontCard(card: CardModel, suits: SuitId[], getSuitMeta: (id: SuitId) => SuitMeta | undefined): string {
  const bands = card.bands.length > 0 ? card.bands : [suits[0] ?? ""];
  const bandHtml = bands
    .filter((band) => band)
    .map((suit) => renderBand(suit, suits, getSuitMeta(suit), {
      includeCenter: true,
      includeName: true,
      includeTopLeft: true,
      includeBottomRight: true
    }))
    .join("");
  return `
    <div class="card card--front">
      <div class="card-bands">
        ${bandHtml}
      </div>
    </div>
  `;
}

function renderBackCard(
  card: CardModel,
  suits: SuitId[],
  getSuitMeta: (id: SuitId) => SuitMeta | undefined
): string {
  const bands = card.bands.length > 0 ? card.bands : [suits[0] ?? ""];
  const bandHtml = bands
    .filter((band) => band)
    .map((suit) =>
      renderBand(suit, suits, getSuitMeta(suit), {
        includeCenter: false,
        includeName: false,
        includeTopLeft: true,
        includeBottomRight: false
      })
    )
    .join("");
  return `
    <div class="card card--back">
      <div class="card-bands">
        ${bandHtml}
      </div>
    </div>
  `;
}

function renderCardStack(
  cards: CardModel[],
  suits: SuitId[],
  getSuitMeta: (id: SuitId) => SuitMeta | undefined
): string {
  if (cards.length === 0) {
    return `<div class="card-stack card-stack--empty" style="--stack-count: 1; --stack-offset: 26px;">
      <div class="card card--front">
        <div class="card-bands">
          ${renderBand("", suits, undefined, {
            includeCenter: true,
            includeName: true,
            includeTopLeft: true,
            includeBottomRight: true
          })}
        </div>
      </div>
    </div>`;
  }

  return `
    <div class="card-stack" style="--stack-count: ${cards.length}; --stack-offset: 26px;">
      ${cards
        .map((card, index) => {
          const isFront = index === 0;
          const stackIndex = cards.length - 1 - index;
          const offset = stackIndex * 26;
          const zIndex = 10 + (cards.length - index);
          const cardHtml = isFront ? renderFrontCard(card, suits, getSuitMeta) : renderBackCard(card, suits, getSuitMeta);
          return `<div class="card-slot" style="left: ${offset}px; z-index: ${zIndex};">
            ${cardHtml}
          </div>`;
        })
        .join("")}
    </div>
  `;
}

export function renderCardHands(state: GameState, options: RenderCardsOptions): string {
  const { formatPlayer, getSuitMeta, localPlayerId } = options;
  const otherPlayers = state.players.filter((player) => player !== localPlayerId);

  return `
    <div class="hand-board">
      <div class="hands-other">
        ${ (localPlayerId ? otherPlayers : state.players)
          .map((playerId) => {
            const cards = buildCardsForPlayer(state, playerId);
            return `
              <section class="hand">
                <div class="hand-label">${formatPlayer(playerId)}</div>
                ${renderCardStack(cards, state.suits, getSuitMeta)}
              </section>
            `;
          })
          .join("")}
      </div>
      ${
        localPlayerId
          ? `
        <div class="hands-self">
          <section class="hand hand--self">
            <div class="hand-label">You — ${formatPlayer(localPlayerId)}</div>
            ${renderCardStack(buildCardsForPlayer(state, localPlayerId), state.suits, getSuitMeta)}
          </section>
        </div>
      `
          : ""
      }
    </div>
  `;
}
