import test from "node:test";
import assert from "node:assert/strict";
import { buildMessage, encodeMessage, parseMessage } from "../src/app/sessionProtocol.js";

test("Protocol encode/parse roundtrip for move_request", () => {
  const message = buildMessage("client-a", "move_request", {
    move: { kind: "Ask", asker: "A", target: "B", suit: "S" },
    knownSeq: 3,
    knownHash: "abc123"
  });
  const encoded = encodeMessage(message);
  const parsed = parseMessage(encoded);
  assert.equal(parsed.kind, "move_request");
  assert.equal(parsed.protocolVersion, 1);
  assert.equal(parsed.fromClientId, "client-a");
  if (parsed.kind === "move_request") {
    assert.equal(parsed.knownSeq, 3);
    assert.equal(parsed.move.kind, "Ask");
  }
});

test("Protocol parse rejects unknown protocolVersion", () => {
  const raw = JSON.stringify({
    protocolVersion: 2,
    messageId: "m1",
    sentAt: new Date().toISOString(),
    fromClientId: "c1",
    kind: "ping",
    nonce: "n"
  });
  assert.throws(() => parseMessage(raw), /Unsupported protocol version/);
});

test("Protocol parse rejects missing required fields", () => {
  const raw = JSON.stringify({
    protocolVersion: 1,
    kind: "pong",
    nonce: "n"
  });
  assert.throws(() => parseMessage(raw), /missing messageId/);
});
