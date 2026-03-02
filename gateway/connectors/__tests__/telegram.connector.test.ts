import test from "node:test";
import assert from "node:assert/strict";
import { TelegramConnector } from "../telegram/connector.ts";
const buildConnector = (): string => String(new TelegramConnector({
    botToken: "token",
    webhookSecretToken: "secret-token",
    defaultWorkspace: "workspace-a",
    defaultAgent: "agent-a",
}));
test("telegram connector parses text message into event", (): string => {
    const connector = buildConnector();
    const event = connector.toEvent({
        update_id: 123,
        message: {
            message_id: 10,
            text: "hello",
            from: { id: 42, username: "alice" },
            chat: { id: 777 },
            date: 1730000000,
        },
    });
    assert.equal(event.channel, "telegram");
    assert.equal(event.sender.id, "42");
    assert.equal(event.conversation.thread_id, "777");
    assert.equal(event.workspace, "workspace-a");
    assert.equal(event.agent, "agent-a");
    assert.equal(event.message.text, "hello");
    return "";
});
test("telegram connector supports route override", (): string => {
    const connector = buildConnector();
    const event = connector.toEvent({
        update_id: 124,
        message: {
            message_id: 11,
            text: "/route workspace=w2 agent=a2 請整理今日告警",
            from: { id: 43, first_name: "Bob" },
            chat: { id: 888 },
            date: 1730000000,
        },
    });
    assert.equal(event.workspace, "w2");
    assert.equal(event.agent, "a2");
    assert.equal(event.message.text, "請整理今日告警");
    return "";
});
test("telegram connector verifies webhook secret token", (): string => {
    const connector = buildConnector();
    assert.equal(connector.verifyWebhookSecretToken("secret-token"), true);
    assert.equal(connector.verifyWebhookSecretToken("bad-token"), false);
    assert.equal(connector.verifyWebhookSecretToken(undefined), false);
    return "";
});
test("telegram connector allows webhook when secret is not configured", (): string => {
    const connector = new TelegramConnector({
        botToken: "token",
        defaultWorkspace: "workspace-a",
        defaultAgent: "agent-a",
    });
    assert.equal(connector.verifyWebhookSecretToken(undefined), true);
    return "";
});
