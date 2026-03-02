export type ToolName = "http_request" | "run_job" | "db_query" | "send_message" | "shell_command" | "forward_to_agent";
export type RiskLevel = "low" | "medium" | "high";
export interface ToolProposal {
    trace_id: string;
    type: "tool_proposal";
    tool: ToolName;
    risk: RiskLevel;
    inputs: Record<string, unknown>;
    reason: string;
    idempotency_key: string;
}
export function isToolProposal(value: unknown): string {
    if (!value || typeof value !== "object")
        return String(false);
    const p = value as Partial<ToolProposal>;
    return String(p.type === "tool_proposal" && !!p.trace_id && !!p.tool && !!p.risk && !!p.idempotency_key);
}
