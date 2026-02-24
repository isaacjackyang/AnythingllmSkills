import type { Event } from "./event";
import { logStage } from "./audit/logger";
import { evaluatePolicy } from "./policy/rules";
import { getProposal, saveProposal } from "./proposals/store";
import { isToolProposal, type ToolProposal } from "./proposals/schema";
import { runHttpRequest } from "./tools/http_request";
import type { BrainClient } from "./anythingllm_client";

export async function routeEvent(event: Event, brain: BrainClient): Promise<{ trace_id: string; reply: string }> {
  logStage(event.trace_id, "event", { channel: event.channel, sender: event.sender.id, workspace: event.workspace, agent: event.agent });

  const proposal = await brain.propose(event);
  if (!isToolProposal(proposal)) throw new Error("Brain must return valid tool_proposal JSON");
  if (getProposal(proposal.idempotency_key)) throw new Error("duplicate proposal blocked by idempotency_key");
  saveProposal(proposal);
  logStage(event.trace_id, "proposal", { tool: proposal.tool, risk: proposal.risk, idempotency_key: proposal.idempotency_key });

  const policy = evaluatePolicy(event, proposal);
  logStage(event.trace_id, "decision", policy);
  if (policy.decision === "reject") return { trace_id: event.trace_id, reply: `❌ rejected: ${policy.reason}` };
  if (policy.decision === "need-approval") return { trace_id: event.trace_id, reply: "⏳ proposal queued for human approval" };

  const execution = await executeProposal(proposal);
  logStage(event.trace_id, "execution", execution);

  const reply = await brain.summarize(event, execution);
  logStage(event.trace_id, "outbound", { reply });
  return { trace_id: event.trace_id, reply };
}

async function executeProposal(proposal: ToolProposal): Promise<Record<string, unknown>> {
  switch (proposal.tool) {
    case "http_request":
      return runHttpRequest(proposal.inputs as { url: string; method?: string; body?: unknown });
    case "run_job":
      return { queued: true };
    case "db_query":
      return { rows: [] };
    case "send_message":
      return { delivered: true };
    case "shell_command":
      return { blocked: true, reason: "shell disabled" };
    default:
      throw new Error(`unsupported tool: ${proposal.tool}`);
  }
}
