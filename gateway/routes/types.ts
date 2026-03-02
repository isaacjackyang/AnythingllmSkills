/** Shared types for route handler dependencies */
export interface AgentContext {
    agent_id: string;
    agent_name: string;
    memory_namespace: string;
}
export type ResolveAgentContext = (agentId?: string) => Promise<AgentContext>;
export type SendReplyByChannel = (event: import("../core/event.js").Event, reply: string) => Promise<void>;
