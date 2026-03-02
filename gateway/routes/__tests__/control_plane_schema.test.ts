import test from "node:test";
import assert from "node:assert/strict";
import {
  validateAgentCommandInput,
  validateLineWebhookInput,
  validateRunOnceInput,
  validateTelegramWebhookInput,
} from "../../schemas/control_plane.ts";

test("agent command schema validates path and value types", () => {
  const ok = validateAgentCommandInput({ text: "hello", path: "anythingllm", agent_id: "a1" });
  assert.equal(ok.ok, true);

  const bad = validateAgentCommandInput({ path: "bad-path" });
  assert.equal(bad.ok, false);
});

test("run once schema only accepts empty object", () => {
  assert.equal(validateRunOnceInput({}).ok, true);
  assert.equal(validateRunOnceInput({ force: true }).ok, false);
});

test("telegram webhook schema validates minimal message shape", () => {
  const ok = validateTelegramWebhookInput({
    message: { text: "hi", from: { id: 1 }, chat: { id: 99 }, date: 1700000000 },
  });
  assert.equal(ok.ok, true);

  const bad = validateTelegramWebhookInput({ message: { text: "", from: { id: 1 }, chat: { id: 99 }, date: 1700000000 } });
  assert.equal(bad.ok, false);
});

test("line webhook schema validates text message event", () => {
  const ok = validateLineWebhookInput({
    events: [
      {
        type: "message",
        replyToken: "token-1",
        source: { userId: "u1" },
        message: { type: "text", text: "hello" },
      },
    ],
  });
  assert.equal(ok.ok, true);

  const bad = validateLineWebhookInput({ events: [{ type: "message", message: { type: "text", text: "" } }] });
  assert.equal(bad.ok, false);
});
