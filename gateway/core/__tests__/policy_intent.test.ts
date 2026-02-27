import test from "node:test";
import assert from "node:assert/strict";
import { inspectProposalIntent } from "../policy/intent.ts";
import type { ToolProposal } from "../proposals/schema.ts";

function proposal(reason: string): ToolProposal {
  return {
    trace_id: "t1",
    type: "tool_proposal",
    tool: "run_job",
    risk: "medium",
    inputs: { command: reason },
    reason,
    idempotency_key: `k-${Date.now()}-${Math.random()}`,
  };
}

test("delete/format intents require double confirmation", () => {
  const del = inspectProposalIntent(proposal("please delete old logs"));
  assert.equal(del.requires_double_confirmation, true);

  const fmt = inspectProposalIntent(proposal("format all source files with prettier"));
  assert.equal(fmt.requires_double_confirmation, true);
});

test("non destructive intent does not require double confirmation", () => {
  const normal = inspectProposalIntent(proposal("query status"));
  assert.equal(normal.requires_double_confirmation, false);
});
