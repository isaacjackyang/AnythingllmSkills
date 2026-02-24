import type { ToolProposal } from "./schema";

const proposalStore = new Map<string, ToolProposal>();

export function saveProposal(proposal: ToolProposal): void {
  proposalStore.set(proposal.idempotency_key, proposal);
}

export function getProposal(idempotencyKey: string): ToolProposal | undefined {
  return proposalStore.get(idempotencyKey);
}
