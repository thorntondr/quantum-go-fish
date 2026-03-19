export type InstructionsMode = "multiplayer" | "single-device";

interface InstructionSection {
  heading: string;
  body?: string[];
  bullets?: string[];
  ordered?: string[];
}

const COMMON_SECTIONS: InstructionSection[] = [
  {
    heading: "Intro",
    body: [
      "Quantum Go Fish is a game of possibilities and strategy.",
      "As in the classic game of Go Fish, your goal is to collect matching cards by asking your opponents questions.",
      "But these cards are unlike any you have ever used before."
    ]
  },
  {
    heading: "The Cards",
    bullets: [
      "There are exactly four identical cards of each suit in the deck.",
      "There are exactly as many suits in the deck as there are players.",
      "Each card begins in a quantum superposition of all suits.",
      "Each player starts with four of these quantum cards.",
      "The quantum states of the cards will resolve as the game progresses."
    ]
  },
  {
    heading: "On Your Turn",
    bullets: [
      "On your turn, you choose an opponent to ask and a suit to ask them for.",
      "If the opponent has a fully resolved card of that suit, they must answer Yes.",
      "If the opponent has no cards that could be resolved to that suit, they must answer No.",
      "If the opponent has no fully resolved cards of that suit, but they do have at least one unresolved card that could be of that suit, they must choose which answer to give.",
      "Whether you are asking or answering, the choice you make will usually impact the state of one or more cards, even ones you are not holding. So choose wisely."
    ]
  },
  {
    heading: "Winning",
    body: ["You can win the game by achieving one of two things during your turn:"],
    ordered: [
      "Collect four cards that are fully resolved to the same suit.",
      "Ask a question that causes the last unresolved card to resolve, either as a direct result of the question or as a result of your opponent's answer."
    ]
  },
  {
    heading: "Game State",
    bullets: [
      "Hands: Each player's hand is shown to every player.",
      "Cards: Fully resolved cards show exactly one suit. Unresolved cards show the additional suits that could still be in that hand, in no particular order.",
      "For each suit, the first player to ask for it gets to name it and choose the symbol and color shown on the cards.",
      "Table: The table shows the complete set of possible states.",
      "Number values indicate how many fully resolved cards a player has of each suit.",
      "X means no cards of the given suit are possible for the given player.",
      "? represents a card the given player's hand that could resolve to the given suit."
    ]
  }
];

const MODE_SECTIONS: Record<InstructionsMode, InstructionSection> = {
  multiplayer: {
    heading: "Starting the Game",
    bullets: [
      "The host starts the game after players join the waiting room.",
      "Each player can see the entire Game State."
    ]
  },
  "single-device": {
    heading: "Starting the Game",
    bullets: [
      "Enter two or more player names, then click Start Game.",
      "The Game State view automatically follows the player who is currently asking or answering."
    ]
  }
};

function formatInline(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\bYes\b/g, "<strong>Yes</strong>")
    .replace(/\bNo\b/g, "<strong>No</strong>")
    .replace(/\b((fully )?resolved?)\b/gi, "<strong>$1</strong>")
    .replace(/\b(unresolved)\b/gi, "<strong>$1</strong>")
    .replace(/\bHands:/g, "<strong>Hands</strong>:")
    .replace(/\bCards:/g, "<strong>Cards</strong>:")
    .replace(/\bTable:/g, "<strong>Table</strong>:")
    .replace(/\bX\b/g, "<strong>X</strong>")
    .replace(/\?/g, "<strong>?</strong>")
    .replace(/\bStart Game\b/g, "<code>Start Game</code>");
}

function renderList(tag: "ul" | "ol", items: string[]): string {
  return `<${tag}>${items.map((item) => `<li>${formatInline(item)}</li>`).join("")}</${tag}>`;
}

function renderSection(section: InstructionSection): string {
  const parts: string[] = [];
  if (section.heading !== "Intro") {
    parts.push(`<p><strong>${section.heading}</strong></p>`);
  }
  if (section.body) {
    parts.push(...section.body.map((paragraph) => `<p>${formatInline(paragraph)}</p>`));
  }
  if (section.bullets) {
    parts.push(renderList("ul", section.bullets));
  }
  if (section.ordered) {
    parts.push(renderList("ol", section.ordered));
  }
  return parts.join("");
}

export function renderInstructions(mode: InstructionsMode): string {
  return [...COMMON_SECTIONS, MODE_SECTIONS[mode]].map(renderSection).join("");
}
