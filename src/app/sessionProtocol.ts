import type { ClientId, SessionMessage } from "./sessionTypes.js";

let nextMessageNumber = 1;

function randomId(): string {
  const n = nextMessageNumber++;
  return `${Date.now().toString(36)}-${n.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeClientId(): ClientId {
  return `client-${randomId()}`;
}

export function buildMessage<TKind extends SessionMessage["kind"]>(
  fromClientId: ClientId,
  kind: TKind,
  payload: Omit<Extract<SessionMessage, { kind: TKind }>, "protocolVersion" | "messageId" | "sentAt" | "fromClientId" | "kind">
): Extract<SessionMessage, { kind: TKind }> {
  return {
    protocolVersion: 1,
    messageId: `msg-${randomId()}`,
    sentAt: new Date().toISOString(),
    fromClientId,
    kind,
    ...payload
  } as Extract<SessionMessage, { kind: TKind }>;
}

export function encodeMessage(message: SessionMessage): string {
  return JSON.stringify(message);
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === "string" && value[key].length > 0;
}

export function parseMessage(raw: string): SessionMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid session message JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid session message payload.");
  }

  const value = parsed as Record<string, unknown>;
  if (value.protocolVersion !== 1) {
    throw new Error(`Unsupported protocol version: ${String(value.protocolVersion)}`);
  }
  if (!hasString(value, "messageId")) {
    throw new Error("Session message missing messageId.");
  }
  if (!hasString(value, "sentAt")) {
    throw new Error("Session message missing sentAt.");
  }
  if (!hasString(value, "fromClientId")) {
    throw new Error("Session message missing fromClientId.");
  }
  if (!hasString(value, "kind")) {
    throw new Error("Session message missing kind.");
  }

  return value as unknown as SessionMessage;
}
