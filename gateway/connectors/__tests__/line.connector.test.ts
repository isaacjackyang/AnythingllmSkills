import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { LineConnector } from "../line/connector.ts";

const buildConnector = () => new LineConnector({
  channelAccessToken: "token",
  channelSecret: "secret",
  defaultWorkspace: "workspace-a",
  defaultAgent: "agent-a",
});

test("line connector parses text message into event", () => {
  const connector = buildConnector();
  const event = connector.toEvent({
    events: [
      {
        type: "message",
        timestamp: 1730000000000,
        replyToken: "reply-1",
        source: { type: "user", userId: "u123" },
        message: { id: "m1", type: "text", text: "hello" },
      },
    ],
  });

  assert.equal(event.channel, "line");
  assert.equal(event.conversation.thread_id, "reply-1");
  assert.equal(event.sender.id, "u123");
  assert.equal(event.workspace, "workspace-a");
  assert.equal(event.agent, "agent-a");
  assert.equal(event.message.text, "hello");
});

test("line connector supports route override", () => {
  const connector = buildConnector();
  const event = connector.toEvent({
    events: [
      {
        type: "message",
        timestamp: 1730000000000,
        replyToken: "reply-2",
        source: { type: "user", userId: "u456" },
        message: {
          id: "m2",
          type: "text",
          text: "/route workspace=w2 agent=a2 幫我整理問題",
        },
      },
    ],
  });

  assert.equal(event.workspace, "w2");
  assert.equal(event.agent, "a2");
  assert.equal(event.message.text, "幫我整理問題");
});

test("line connector verifies line signature", () => {
  const connector = buildConnector();
  const body = JSON.stringify({ hello: "world" });
  const signature = crypto.createHmac("sha256", "secret").update(body).digest("base64");

  assert.equal(connector.verifySignature(body, signature), true);
  assert.equal(connector.verifySignature(body, "bad-signature"), false);
  assert.equal(connector.verifySignature(body), false);
});
