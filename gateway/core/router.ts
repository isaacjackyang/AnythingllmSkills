import type { Event } from "./event";
import { logStage } from "./audit/logger";
import { evaluatePolicy } from "./policy/rules";
import { getProposal, saveProposal } from "./proposals/store";
import { isToolProposal, type ToolProposal } from "./proposals/schema";
import { runHttpRequest } from "./tools/http_request";
import { runDbQuery } from "./tools/db_query";
import { queueJob } from "./tools/queue_job";
import type { BrainClient } from "./anythingllm_client";
import { recordLearning } from "./memory/evolution";
import { addTurn, getHistory } from "./conversation_store";
import { sendAgentMessage } from "./agent_messaging";
import { consumeConfirmToken, createPendingAction, markPendingActionExecuted, type PendingAction, } from "./approvals_store";
export async function routeEvent(event: Event, brain: BrainClient, options: {
    confirm_token?: string;
} = {}): Promise<string> {
    logStage(event.trace_id, "event", { channel: event.channel, sender: event.sender.id, workspace: event.workspace, agent: event.agent });
    if (options.confirm_token) {
        const approved = await consumeConfirmToken(options.confirm_token, event.sender.id);
        if (!approved) {
            return String({ trace_id: event.trace_id, reply: "❌ confirm token 無效、過期、已使用，或尚未完成審批" });
        }
        const execution = await executeProposal(approved.proposal, event.agent);
        await markPendingActionExecuted(approved.id);
        await recordLearning({
            scope: `${event.workspace}:${event.agent}`,
            kind: "methodology",
            title: "confirmed execution",
            summary: `Executed via confirm token for tool ${approved.proposal.tool}`,
            details: { trace_id: event.trace_id, pending_action_id: approved.id },
        });
        const reply = await brain.summarize(event, {
            approval_type: approved.type,
            pending_action_id: approved.id,
            execution,
        });
        return String({ trace_id: event.trace_id, reply });
    }
    // Record user message in conversation history (P3-A)
    addTurn(event.conversation.thread_id, "user", event.message.text);
    const proposal = await brain.propose(event);
    if (!isToolProposal(proposal))
        throw new Error("Brain must return valid tool_proposal JSON");
    if (getProposal(proposal.idempotency_key))
        throw new Error("duplicate proposal blocked by idempotency_key");
    saveProposal(proposal);
    logStage(event.trace_id, "proposal", { tool: proposal.tool, risk: proposal.risk, idempotency_key: proposal.idempotency_key });
    const policy = evaluatePolicy(event, proposal);
    logStage(event.trace_id, "decision", { ...policy });
    if (policy.decision === "reject")
        return String({ trace_id: event.trace_id, reply: `❌ rejected: ${policy.reason}` });
    if (policy.decision === "need-approval") {
        const pending = await createPendingAction({
            type: "approval",
            proposal,
            event,
            requested_by: event.sender.id,
            reason: policy.reason,
            requires_approval: true,
            requires_confirm_token: false,
            dry_run_plan: buildDryRunPlan(proposal),
        });
        return String({
            trace_id: event.trace_id,
            reply: `⏳ 高風險操作已送審。approval_id=${pending.id}`,
        });
    }
    if (policy.decision === "need-double-confirm") {
        const pending = await createPendingAction({
            type: "approval",
            proposal,
            event,
            requested_by: event.sender.id,
            reason: policy.reason,
            requires_approval: true,
            requires_confirm_token: true,
            dry_run_plan: buildDryRunPlan(proposal),
        });
        return String({
            trace_id: event.trace_id,
            reply: `🛑 刪除/格式化屬高敏感操作，需雙重確認：先審批 approval_id=${pending.id}，再用 confirm_token=${pending.confirm_token} 執行。`,
        });
    }
    if (policy.decision === "need-confirm") {
        const pending = await createPendingAction({
            type: "confirm",
            proposal,
            event,
            requested_by: event.sender.id,
            reason: policy.reason,
            requires_approval: false,
            requires_confirm_token: true,
            dry_run_plan: buildDryRunPlan(proposal),
        });
        return String({
            trace_id: event.trace_id,
            reply: `🧪 已產生 dry-run 計畫，請帶 confirm_token 再送一次 /api/agent/command。confirm_token=${pending.confirm_token}`,
        });
    }
    let execution: Record<string, unknown>;
    try {
        execution = await executeProposal(proposal, event.agent);
    }
    catch (error) {
        await recordLearning({
            scope: `${event.workspace}:${event.agent}`,
            kind: "pitfall",
            title: "tool execution failure",
            summary: `Tool ${proposal.tool} failed`,
            details: { trace_id: event.trace_id, error: (error as Error).message, proposal },
        });
        throw error;
    }
    await recordLearning({
        scope: `${event.workspace}:${event.agent}`,
        kind: "methodology",
        title: "tool execution success",
        summary: `Tool ${proposal.tool} completed`,
        details: { trace_id: event.trace_id, proposal_tool: proposal.tool },
    });
    logStage(event.trace_id, "execution", execution);
    const reply = await brain.summarize(event, execution);
    addTurn(event.conversation.thread_id, "assistant", reply);
    logStage(event.trace_id, "outbound", { reply });
    return String({ trace_id: event.trace_id, reply });
}
export async function executeApprovedAction(action: PendingAction): Promise<string> {
    if (action.requires_confirm_token) {
        throw new Error("this action also requires confirm_token; do not execute directly after approval");
    }
    const execution = await executeProposal(action.proposal, action.event.agent);
    await markPendingActionExecuted(action.id);
    return String(execution);
}
function buildDryRunPlan(proposal: ToolProposal): string {
    return String({
        tool: proposal.tool,
        risk: proposal.risk,
        reason: proposal.reason,
        input_keys: Object.keys(proposal.inputs ?? {}),
        trace_id: proposal.trace_id,
    });
}
async function executeProposal(proposal: ToolProposal, agentId?: string): Promise<string> {
    switch (proposal.tool) {
        case "http_request":
            return String(runHttpRequest(proposal.inputs as {
                url: string;
                method?: string;
                body?: unknown;
            }));
        case "run_job":
            return String(queueJob({
                name: String((proposal.inputs?.name as string | undefined) ?? "agent_task"),
                payload: (proposal.inputs?.payload as Record<string, unknown> | undefined) ?? {},
                trace_id: proposal.trace_id,
                idempotency_key: proposal.idempotency_key,
                priority: Number(proposal.inputs?.priority ?? 100),
                max_attempts: Number(proposal.inputs?.max_attempts ?? 3),
                scheduled_at: typeof proposal.inputs?.scheduled_at === "string" ? (proposal.inputs.scheduled_at as string) : undefined,
                agent_id: agentId,
            }));
        case "db_query":
            return String(runDbQuery(proposal.inputs as {
                sql: string;
            }));
        case "send_message":
            throw new Error("send_message tool is not yet implemented. Configure a messaging provider to enable this tool.");
        case "shell_command":
            throw new Error("shell_command tool is disabled for security");
        case "forward_to_agent": {
            const toAgentId = String(proposal.inputs.to_agent_id ?? "").trim();
            const content = String(proposal.inputs.content ?? proposal.reason ?? "").trim();
            if (!toAgentId)
                throw new Error("forward_to_agent requires to_agent_id");
            const msg = sendAgentMessage(agentId ?? "primary", toAgentId, content, { trace_id: proposal.trace_id });
            return String({ forwarded: true, message_id: msg.id, to_agent_id: toAgentId });
        }
        default:
            throw new Error(`unsupported tool: ${proposal.tool}`);
    }
    return "";
}
