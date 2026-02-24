import type { Event } from "../event";
import type { ToolProposal } from "../proposals/schema";
import { hasCapability } from "./roles";

export type PolicyDecision = "auto" | "need-approval" | "reject";

export interface PolicyResult {
  decision: PolicyDecision;
  reason: string;
}

export function evaluatePolicy(event: Event, proposal: ToolProposal): PolicyResult {
  const canUseWorkspace = event.workspace.length > 0 && event.agent.length > 0;
  if (!canUseWorkspace) return { decision: "reject", reason: "invalid workspace/agent route" };

  if (proposal.risk === "low" && hasCapability(event.sender.roles, "tool:low")) {
    return { decision: "auto", reason: "low risk + capability granted" };
  }

  if (proposal.risk === "medium" && hasCapability(event.sender.roles, "tool:medium")) {
    return { decision: "auto", reason: "medium risk + capability granted" };
  }

  if (proposal.risk === "high") {
    if (hasCapability(event.sender.roles, "tool:high")) {
      return { decision: "auto", reason: "high risk auto-approved for admin" };
    }
    return { decision: "need-approval", reason: "high risk action requires explicit approval" };
  }

  return { decision: "reject", reason: "subject lacks required capability" };
}
