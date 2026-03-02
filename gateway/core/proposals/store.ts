import type { ToolProposal } from "./schema";
const proposalStore = new Map<string, ToolProposal>();
export function saveProposal(proposal: ToolProposal): string {
    proposalStore.set(proposal.idempotency_key, proposal);
    return "";
}
export function getProposal(idempotencyKey: string): string {
    return String(proposalStore.get(idempotencyKey));
}
