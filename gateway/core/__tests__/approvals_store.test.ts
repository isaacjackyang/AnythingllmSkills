import test from "node:test";
import assert from "node:assert/strict";
import {
  consumeConfirmToken,
  createPendingAction,
  decidePendingAction,
  listPendingActions,
  markPendingActionExecuted,
  resetPendingActionsDbForTest,
} from "../approvals_store.ts";
import type { Event } from "../event.ts";
import type { ToolProposal } from "../proposals/schema.ts";

function makeEvent(): Event {
  return {
    trace_id: "trace-1",
    channel: "web_ui",
    sender: { id: "operator-1", display: "Operator", roles: ["operator"] },
    conversation: { thread_id: "thread-1" },
    workspace: "ws",
    agent: "ag",
    message: { text: "run", attachments: [] },
    received_at: new Date().toISOString(),
  };
}

function makeProposal(risk: "low" | "medium" | "high"): ToolProposal {
  return {
    trace_id: "trace-1",
    type: "tool_proposal",
    tool: "run_job",
    risk,
    inputs: { name: "job1" },
    reason: "testing",
    idempotency_key: `id-${risk}-${Date.now()}`,
  };
}

test("confirm-only action executes after token consume", async () => {
  await resetPendingActionsDbForTest();
  const action = await createPendingAction({
    type: "confirm",
    proposal: makeProposal("medium"),
    event: makeEvent(),
    reason: "medium needs confirm",
    requested_by: "operator-1",
    requires_confirm_token: true,
    dry_run_plan: { ok: true },
  });

  const approved = await consumeConfirmToken(action.confirm_token as string, "operator-1");
  assert.ok(approved);

  const executed = await markPendingActionExecuted(action.id);
  assert.equal(executed.status, "executed");
});

test("double-confirm action rejects token before approval", async () => {
  await resetPendingActionsDbForTest();
  const action = await createPendingAction({
    type: "approval",
    proposal: makeProposal("high"),
    event: makeEvent(),
    reason: "destructive operation",
    requested_by: "operator-1",
    requires_approval: true,
    requires_confirm_token: true,
    dry_run_plan: { dry_run: true },
  });

  const beforeApprove = await consumeConfirmToken(action.confirm_token as string, "operator-1");
  assert.equal(beforeApprove, undefined);

  const approved = await decidePendingAction(action.id, "approver-1", "approve", "looks good");
  assert.equal(approved.status, "approved");

  const afterApprove = await consumeConfirmToken(action.confirm_token as string, "operator-1");
  assert.ok(afterApprove);

  const executed = await markPendingActionExecuted(action.id);
  assert.equal(executed.status, "executed");

  const all = await listPendingActions({ limit: 10 });
  assert.equal(all.length, 1);
});
