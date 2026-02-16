import { createHash } from "node:crypto";
import type { GameState } from "../engine/types.js";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function stateHash(state: GameState): string {
  const canonical = JSON.stringify(canonicalize(state));
  return createHash("sha256").update(canonical).digest("hex");
}
