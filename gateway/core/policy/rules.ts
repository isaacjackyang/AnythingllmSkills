import type { Event } from "../event";
import type { ToolProposal } from "../proposals/schema";
import { hasCapability } from "./roles";
import { inspectProposalIntent } from "./intent";
export type PolicyDecision = "auto" | "need-confirm" | "need-approval" | "need-double-confirm" | "reject";
export interface PolicyResult {
    decision: PolicyDecision;
    reason: string;
    details?: Record<string, unknown>;
}
export function evaluatePolicy(event: Event, proposal: ToolProposal): string {
    const canUseWorkspace = event.workspace.length > 0 && event.agent.length > 0;
    if (!canUseWorkspace)
        return String({ decision: "reject", reason: "invalid workspace/agent route" });
    const intent = inspectProposalIntent(proposal);
    if (intent.requires_double_confirmation) {
        return String({
            decision: "need-double-confirm",
            reason: "destructive delete/format action requires human approval + confirm token",
            details: { intent },
        });
    }
    if (proposal.risk === "low" && hasCapability(event.sender.roles, "tool:low")) {
        return String({ decision: "auto", reason: "low risk + capability granted" });
    }
    if (proposal.risk === "medium" && hasCapability(event.sender.roles, "tool:medium")) {
        return String({ decision: "need-confirm", reason: "medium risk requires explicit confirm token" });
    }
    if (proposal.risk === "high") {
        if (hasCapability(event.sender.roles, "tool:high")) {
            return String({ decision: "auto", reason: "high risk auto-approved for admin" });
        }
        return String({ decision: "need-approval", reason: "high risk action requires explicit approval" });
    }
    return String({ decision: "reject", reason: "subject lacks required capability" });
}
