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
  askingPlayerId?: PlayerId;
  answeringPlayerId?: PlayerId;
  selectedTargetPlayerId?: PlayerId;
  winnerPlayerId?: PlayerId;
}

const DEFAULT_SUIT_SYMBOLS = ["◼", "▲", "◆", "●", "⬟", "⬣", "★", "✚"];
const UNKNOWN_LABEL = "Unknown";
const UNKNOWN_COLOR = "#d6d9de";
const UNKNOWN_SUIT_ID: SuitId = "__unknown__";
const LIGHT_BAND_INK = "#dee2e0";
const DARK_BAND_INK = "#1a2a24";

interface CardModel {
  bands: SuitId[];
}

function sortBandsForDisplay(bands: SuitId[], suits: SuitId[]): SuitId[] {
  return [...bands].sort((a, b) => {
    if (a === b) {
      return 0;
    }
    if (a === UNKNOWN_SUIT_ID) {
      return 1;
    }
    if (b === UNKNOWN_SUIT_ID) {
      return -1;
    }
    return suits.indexOf(a) - suits.indexOf(b);
  });
}

function handSizingStyle(suitCount: number): string {
  if (suitCount >= 8) {
    return "--card-height: calc(var(--card-width) * 2);";
  }
  if (suitCount >= 7) {
    return "--card-height: calc(var(--card-width) * 16 / 9);";
  }
  return "";
}

function rotatePlayersFromLocal(players: PlayerId[], localPlayerId?: PlayerId): PlayerId[] {
  if (!localPlayerId) {
    return players;
  }
  const localIndex = players.indexOf(localPlayerId);
  if (localIndex === -1) {
    return players.filter((player) => player !== localPlayerId);
  }
  return players.slice(localIndex + 1).concat(players.slice(0, localIndex));
}

function buildCardsForPlayer(state: GameState, playerId: PlayerId): CardModel[] {
  const total = state.handSizes[playerId] ?? 0;
  const cards: CardModel[] = Array.from({ length: total }, () => ({ bands: [] }));
  let fixedIndex = 0;

  const remaining: Record<SuitId, number> = {};
  for (const suit of state.suits) {
    const min = Math.max(0, state.min[playerId]?.[suit] ?? 0);
    const max = Math.max(0, state.max[playerId]?.[suit] ?? 0);
    const guaranteed = Math.min(min, total - fixedIndex);
    for (let i = 0; i < guaranteed && fixedIndex < cards.length; i += 1) {
      cards[fixedIndex].bands = [suit];
      fixedIndex += 1;
    }
    remaining[suit] = Math.max(0, max - min);
  }

  const uncertain = cards.slice(fixedIndex);
  const uncertainCount = uncertain.length;
  if (uncertainCount === 0) {
    return cards;
  }

  const minPerCard = 2;

  const pickSuit = (exclude: Set<SuitId>): SuitId | undefined => {
    let best: SuitId | undefined;
    for (const suit of state.suits) {
      if (exclude.has(suit)) {
        continue;
      }
      if (remaining[suit] <= 0) {
        continue;
      }
      if (!best || remaining[suit] > remaining[best]) {
        best = suit;
      }
    }
    return best;
  };

  for (const card of uncertain) {
    const chosen = new Set<SuitId>();
    for (let i = 0; i < minPerCard; i += 1) {
      const suit = pickSuit(chosen);
      if (!suit) {
        break;
      }
      chosen.add(suit);
      remaining[suit] -= 1;
    }
    while (chosen.size < minPerCard) {
      chosen.add(UNKNOWN_SUIT_ID);
    }
    card.bands = [...chosen];
  }

  while (true) {
    let suitToPlace: SuitId | undefined;
    for (const suit of state.suits) {
      if (remaining[suit] > 0 && (!suitToPlace || remaining[suit] > remaining[suitToPlace])) {
        suitToPlace = suit;
      }
    }
    if (!suitToPlace) {
      break;
    }
    let candidate: CardModel | undefined;
    for (const card of uncertain) {
      if (card.bands.includes(suitToPlace)) {
        continue;
      }
      if (!candidate || card.bands.length < candidate.bands.length) {
        candidate = card;
      }
    }
    if (!candidate) {
      remaining[suitToPlace] = 0;
      continue;
    }
    candidate.bands.push(suitToPlace);
    remaining[suitToPlace] -= 1;
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
  if (suit === UNKNOWN_SUIT_ID) {
    return "∅";
  }
  const symbol = suitMeta?.symbol?.trim();
  return symbol && symbol.length > 0 ? symbol : defaultSymbolForSuit(suit, suits);
}

function resolveSuitColor(suitMeta: SuitMeta | undefined): string {
  return suitMeta?.color?.trim() || UNKNOWN_COLOR;
}

function resolveBandInkColor(color: string): string {
  const normalized = color.trim();
  const hex = normalized.startsWith("#") ? normalized.slice(1) : normalized;
  const expanded = hex.length === 3 ? hex.split("").map((char) => char + char).join("") : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return DARK_BAND_INK;
  }
  const red = Number.parseInt(expanded.slice(0, 2), 16) / 255;
  const green = Number.parseInt(expanded.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(expanded.slice(4, 6), 16) / 255;
  const channel = (value: number) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
  return luminance < 0.35 ? LIGHT_BAND_INK : DARK_BAND_INK;
}

function bandSymbolSize(bandCount: number): string {
  if (bandCount <= 1) {
    return "3.3rem";
  }
  if (bandCount === 2) {
    return "2.5rem";
  }
  if (bandCount === 3) {
    return "2rem";
  }
  return "1.6rem";
}

function frontCardBandStyle(bandCount: number): string {
  const symbolSize = bandSymbolSize(bandCount);
  if (bandCount >= 6) {
    return `--band-symbol-size: ${symbolSize}; --band-name-size: 0.48rem; --band-center-gap: 1px;`;
  }
  if (bandCount === 5) {
    return `--band-symbol-size: ${symbolSize}; --band-name-size: 0.58rem; --band-center-gap: 2px;`;
  }
  return `--band-symbol-size: ${symbolSize};`;
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
  const ink = resolveBandInkColor(color);
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
    <div class="card-band" style="--band-color: ${color}; --band-ink: ${ink}">
      ${cornerHtml}
      ${centerHtml}
    </div>
  `;
}

function renderFrontCard(card: CardModel, suits: SuitId[], getSuitMeta: (id: SuitId) => SuitMeta | undefined): string {
  if (card.bands.length === 0) {
    return `
      <div class="card card--front card--blank">
        <div class="card-bands">
          <div class="card-band card-band--blank"></div>
        </div>
      </div>
    `;
  }
  const bands = sortBandsForDisplay(card.bands, suits);
  const bandCount = bands.length;
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
      <div class="card-bands" style="${frontCardBandStyle(bandCount)}">
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
  if (card.bands.length === 0) {
    return `
      <div class="card card--back card--blank">
        <div class="card-bands">
          <div class="card-band card-band--blank"></div>
        </div>
      </div>
    `;
  }
  const bands = sortBandsForDisplay(card.bands, suits);
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
      <div class="card card--front card--blank">
        <div class="card-bands">
          <div class="card-band card-band--blank"></div>
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
  const { formatPlayer, getSuitMeta, localPlayerId, askingPlayerId, answeringPlayerId, selectedTargetPlayerId, winnerPlayerId } = options;
  const displayedPlayers = rotatePlayersFromLocal(state.players, localPlayerId);
  const otherPlayers = localPlayerId ? displayedPlayers.filter((player) => player !== localPlayerId) : displayedPlayers;
  const handStyle = handSizingStyle(state.suits.length);
  const handStateClasses = (playerId: PlayerId): string =>
    [
      askingPlayerId === playerId ? "hand--asker" : "",
      answeringPlayerId === playerId ? "hand--answerer" : "",
      selectedTargetPlayerId === playerId ? "hand--selected-target" : "",
      winnerPlayerId === playerId ? "hand--winner" : ""
    ]
      .filter(Boolean)
      .join(" ");

  return `
    <div class="hand-board">
      ${
        localPlayerId
          ? `
        <div class="hands-self">
          <section class="hand hand--self ${handStateClasses(localPlayerId)}" ${handStyle ? `style="${handStyle}"` : ""}>
            <div class="hand-label">You — ${formatPlayer(localPlayerId)}</div>
            ${renderCardStack(buildCardsForPlayer(state, localPlayerId), state.suits, getSuitMeta)}
          </section>
        </div>
      `
          : ""
      }
      <div class="hands-other">
        ${otherPlayers
          .map((playerId) => {
            const cards = buildCardsForPlayer(state, playerId);
            const handClass = ["hand", handStateClasses(playerId)].filter(Boolean).join(" ");
            return `
              <section class="${handClass}" ${handStyle ? `style="${handStyle}"` : ""}>
                <div class="hand-label">${formatPlayer(playerId)}</div>
                ${renderCardStack(cards, state.suits, getSuitMeta)}
              </section>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}
