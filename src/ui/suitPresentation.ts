import type { SuitId } from "../engine/types.js";
import type { SuitMeta } from "./cardHands.js";

const DEFAULT_SUIT_SYMBOLS = ["◼", "▲", "◆", "●", "⬟", "⬣", "★", "✚"];

export function getDefaultSuitSymbol(suit: SuitId, suits: SuitId[]): string {
  const index = Math.max(0, suits.indexOf(suit));
  return DEFAULT_SUIT_SYMBOLS[index % DEFAULT_SUIT_SYMBOLS.length];
}

export function formatSuitLabel(suit: SuitId, suits: SuitId[], meta?: SuitMeta): string {
  const symbol = meta?.symbol?.trim() || getDefaultSuitSymbol(suit, suits);
  const text = meta?.name?.trim() || suit;
  return `${symbol} ${text}`;
}
