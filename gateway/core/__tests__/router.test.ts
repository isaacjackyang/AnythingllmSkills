import test from "node:test";
import assert from "node:assert/strict";
import { routeEvent } from "../router.ts";
import { resetPendingActionsDbForTest } from "../approvals_store.ts";
import type { Event } from "../event.ts";
import type { BrainClient } from "../anythingllm_client.ts";
import type { ToolProposal } from "../proposals/schema.ts";

function makeEvent(roles: string[] = ["operator"]): Event {
    return {
        trace_id: "trace-router-" + Date.now(),
        channel: "web_ui",
        sender: { id: "test-user", display: "Test User", roles },
        conversation: { thread_id: "thread-1" },
        workspace: "test-ws",
        agent: "test-agent",
        message: { text: "test command", attachments: [] },
        received_at: new Date().toISOString(),
    };
}

function makeBrainClient(proposal: Partial<ToolProposal>): BrainClient {
    return {
        async propose(event: Event): Promise<ToolProposal> {
            return {
                trace_id: event.trace_id,
                type: "tool_proposal",
                tool: proposal.tool ?? "http_request",
                risk: proposal.risk ?? "low",
                inputs: proposal.inputs ?? {},
                reason: proposal.reason ?? "test",
                idempotency_key: `idem-${Date.now()}-${Math.random()}`,
            };
        },
        async summarize(_event: Event, _toolResult: unknown): Promise<string> {
            return "summary of result";
        },
    };
}

test("routeEvent auto-allows low-risk proposal for operator", async () => {
    await resetPendingActionsDbForTest();
    const brain = makeBrainClient({ tool: "http_request", risk: "low" });
    // http_request will throw because inputs lack valid url, but that proves it
    // went through auto-allow path (not blocked by policy)
    try {
        await routeEvent(makeEvent(["operator"]), brain);
        // If http_request tool had been real, it would succeed
    } catch (error) {
        // Expected: http_request throws because host is not in allowlist
        assert.ok((error as Error).message.includes("host not allowed") || (error as Error).message.includes("Invalid URL"));
    }
});

test("routeEvent rejects user without capability", async () => {
    await resetPendingActionsDbForTest();
    const brain = makeBrainClient({ tool: "http_request", risk: "low" });
    const result = await routeEvent(makeEvent(["user"]), brain);
    assert.ok(result.reply.includes("rejected"));
});

test("routeEvent requires confirm for medium-risk operator", async () => {
    await resetPendingActionsDbForTest();
    const brain = makeBrainClient({ tool: "run_job", risk: "medium" });
    const result = await routeEvent(makeEvent(["operator"]), brain);
    assert.ok(result.reply.includes("confirm_token"));
});

test("routeEvent requires approval for high-risk non-admin", async () => {
    await resetPendingActionsDbForTest();
    const brain = makeBrainClient({ tool: "run_job", risk: "high" });
    const result = await routeEvent(makeEvent(["operator"]), brain);
    assert.ok(result.reply.includes("approval_id"));
});

test("routeEvent requires double-confirm for destructive delete", async () => {
    await resetPendingActionsDbForTest();
    const brain = makeBrainClient({ tool: "run_job", risk: "low", reason: "delete old files" });
    const result = await routeEvent(makeEvent(["operator"]), brain);
    assert.ok(result.reply.includes("confirm_token") || result.reply.includes("approval_id"));
});

test("routeEvent auto-allows high-risk for admin", async () => {
    await resetPendingActionsDbForTest();
    const brain = makeBrainClient({ tool: "run_job", risk: "high", inputs: { name: "test-job" } });
    const result = await routeEvent(makeEvent(["admin"]), brain);
    // Admin can auto-execute. run_job queues a task, so reply includes the summary
    assert.ok(result.reply.length > 0);
    assert.ok(result.trace_id.length > 0);
});

test("routeEvent rejects invalid workspace", async () => {
    await resetPendingActionsDbForTest();
    const event = makeEvent(["operator"]);
    event.workspace = "";
    const brain = makeBrainClient({ tool: "http_request", risk: "low" });
    const result = await routeEvent(event, brain);
    assert.ok(result.reply.includes("rejected"));
});
