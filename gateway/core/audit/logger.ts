import { writeAudit } from "./persistence";

export function logStage(traceId: string, stage: "event" | "llm_call" | "proposal" | "decision" | "execution" | "outbound", payload: Record<string, unknown>): void {
  writeAudit({
    trace_id: traceId,
    stage,
    payload,
    created_at: new Date().toISOString(),
  });
}
