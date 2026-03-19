import { renderInstructions, type InstructionsMode } from "./instructions.js";

export interface SuitMetaLike {
  name?: string;
  symbol?: string;
  color?: string;
}

const EMOJILIB_URL = "https://unpkg.com/emojilib@4.0.2/dist/emoji-en-US.json";
let emojiKeywordMap: Record<string, string[]> | undefined;
let emojiKeywordMapPromise: Promise<Record<string, string[]> | undefined> | undefined;

export function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing required element: #${id}`);
  }
  return node;
}

export function getEl(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export function requireEl(id: string): HTMLElement {
  return byId(id);
}

export function extractEmoji(label: string): string | undefined {
  const match = label.match(/\p{Extended_Pictographic}/u);
  return match ? match[0] : undefined;
}

function singularizeToken(token: string): string {
  if (token.endsWith("ies") && token.length > 3) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith("es") && token.length > 3) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s") && token.length > 2) {
    return token.slice(0, -1);
  }
  return token;
}

function normalizeQueryTokens(query: string): string[] {
  const rawTokens = query.split(/[^a-z0-9]+/).filter((token) => token.length > 1);
  const tokens = new Set<string>();
  for (const token of rawTokens) {
    tokens.add(token);
    tokens.add(singularizeToken(token));
  }
  return [...tokens];
}

async function ensureEmojiLibrary(): Promise<Record<string, string[]> | undefined> {
  if (emojiKeywordMap) {
    return emojiKeywordMap;
  }
  if (!emojiKeywordMapPromise) {
    emojiKeywordMapPromise = (async () => {
      try {
        const response = await fetch(EMOJILIB_URL);
        if (!response.ok) {
          return undefined;
        }
        emojiKeywordMap = (await response.json()) as Record<string, string[]>;
        return emojiKeywordMap;
      } catch {
        return undefined;
      }
    })();
  }
  return emojiKeywordMapPromise;
}

function renderEmojiSuggestions(suggestionsRoot: HTMLElement | null, query: string): void {
  if (!suggestionsRoot) {
    return;
  }
  const trimmed = query.trim().toLowerCase();
  if (!trimmed || !emojiKeywordMap) {
    suggestionsRoot.innerHTML = "";
    return;
  }
  const tokens = normalizeQueryTokens(trimmed);
  if (tokens.length === 0) {
    suggestionsRoot.innerHTML = "";
    return;
  }
  const scores = new Map<string, number>();
  for (const [emoji, keywords] of Object.entries(emojiKeywordMap)) {
    let score = 0;
    for (const token of tokens) {
      if (keywords.includes(token)) {
        score += 2;
      } else if (keywords.some((keyword) => keyword.startsWith(token))) {
        score += 1;
      }
    }
    if (score > 0) {
      scores.set(emoji, score);
    }
  }
  const results = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([emoji]) => emoji);

  if (results.length === 0) {
    suggestionsRoot.innerHTML = "";
    return;
  }

  suggestionsRoot.innerHTML = results
    .map((emoji) => `<button class="emoji-suggestion" type="button" data-emoji="${emoji}">${emoji}</button>`)
    .join("");
}

export function bindInfoOverlay(options: {
  infoBtn: HTMLButtonElement | null;
  infoOverlay: HTMLElement | null;
  infoCloseBtn: HTMLButtonElement | null;
  infoContent: HTMLElement | null;
  mode: InstructionsMode;
}): void {
  const { infoBtn, infoOverlay, infoCloseBtn, infoContent, mode } = options;

  function openInfoOverlay(): void {
    if (!infoOverlay) {
      return;
    }
    infoOverlay.hidden = false;
    infoOverlay.classList.add("active");
  }

  function closeInfoOverlay(): void {
    if (!infoOverlay) {
      return;
    }
    infoOverlay.classList.remove("active");
    infoOverlay.hidden = true;
  }

  if (infoBtn) {
    infoBtn.addEventListener("click", () => {
      openInfoOverlay();
    });
  }

  if (infoCloseBtn) {
    infoCloseBtn.addEventListener("click", () => {
      closeInfoOverlay();
    });
  }

  if (infoOverlay) {
    infoOverlay.addEventListener("click", (event) => {
      if (event.target === infoOverlay) {
        closeInfoOverlay();
      }
    });
  }

  if (infoContent) {
    infoContent.innerHTML = renderInstructions(mode);
  }
}

export function createSuitOverlayController<TMove>(options: {
  overlay: HTMLElement | null;
  labelEl: HTMLElement | null;
  nameInput: HTMLInputElement | null;
  symbolInput: HTMLInputElement | null;
  colorInput: HTMLInputElement | null;
  saveBtn: HTMLButtonElement | null;
  cancelBtn: HTMLButtonElement | null;
  suggestionsRoot: HTMLElement | null;
  formatSuit: (suitId: string) => string;
  getMeta: (suitId: string) => SuitMetaLike | undefined;
  getDefaultColor: (suitId: string) => string;
  onSave: (suitId: string, meta: SuitMetaLike, move: TMove | undefined) => void;
}): { open: (suitId: string, move?: TMove) => void; close: () => void } {
  const {
    overlay,
    labelEl,
    nameInput,
    symbolInput,
    colorInput,
    saveBtn,
    cancelBtn,
    suggestionsRoot,
    formatSuit,
    getMeta,
    getDefaultColor,
    onSave
  } = options;

  let pending: { suitId: string; move?: TMove } | undefined;

  function close(): void {
    if (!overlay) {
      return;
    }
    overlay.classList.remove("active");
    pending = undefined;
  }

  function open(suitId: string, move?: TMove): void {
    if (!overlay || !nameInput || !symbolInput || !colorInput) {
      return;
    }
    pending = { suitId, move };
    const meta = getMeta(suitId) ?? {};
    const name = meta.name ?? "";
    const symbol = meta.symbol ?? (name ? extractEmoji(name) ?? "" : "");
    const color = meta.color ?? getDefaultColor(suitId);
    nameInput.value = name;
    symbolInput.value = symbol;
    colorInput.value = color;
    if (labelEl) {
      labelEl.textContent = `Suit ${formatSuit(suitId)}`;
    }
    overlay.classList.add("active");
    void ensureEmojiLibrary().then(() => renderEmojiSuggestions(suggestionsRoot, nameInput.value));
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      close();
    });
  }

  if (overlay) {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        close();
      }
    });
  }

  if (nameInput) {
    nameInput.addEventListener("input", () => {
      renderEmojiSuggestions(suggestionsRoot, nameInput.value);
    });
  }

  if (suggestionsRoot && symbolInput) {
    suggestionsRoot.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      const emoji = target.getAttribute("data-emoji");
      if (!emoji) {
        return;
      }
      symbolInput.value = emoji;
    });
  }

  if (saveBtn && nameInput && symbolInput && colorInput) {
    saveBtn.addEventListener("click", () => {
      if (!pending) {
        return;
      }
      onSave(
        pending.suitId,
        {
          name: nameInput.value.trim() || undefined,
          symbol: symbolInput.value.trim() || undefined,
          color: colorInput.value.trim() || undefined
        },
        pending.move
      );
      close();
    });
  }

  return { open, close };
}
