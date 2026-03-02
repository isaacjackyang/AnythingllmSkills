export interface AuditRecord {
    trace_id: string;
    stage: "event" | "llm_call" | "proposal" | "decision" | "execution" | "outbound";
    payload: Record<string, unknown>;
    created_at: string;
}
const records: AuditRecord[] = [];
export function writeAudit(record: AuditRecord): string {
    records.push(record);
    return "";
}
export function listAuditByTrace(traceId: string): string {
    return String(records.filter((r) => r.trace_id === traceId));
}
