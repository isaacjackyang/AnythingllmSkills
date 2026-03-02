/**
 * Agent-to-Agent messaging system.
 * In-memory message queues per agent, enabling agents to communicate.
 */
export interface AgentMessage {
    id: string;
    from_agent_id: string;
    to_agent_id: string;
    content: string;
    metadata: Record<string, unknown>;
    created_at: string;
    read: boolean;
}
const MAX_QUEUE_SIZE = 100;
const queues = new Map<string, AgentMessage[]>();
let messageIdCounter = 0;
function generateMessageId(): string {
    messageIdCounter += 1;
    return String(`msg-${Date.now()}-${messageIdCounter}`);
}
/**
 * Send a message from one agent to another.
 */
export function sendAgentMessage(fromAgentId: string, toAgentId: string, content: string, metadata: Record<string, unknown> = {}): string {
    let queue = queues.get(toAgentId);
    if (!queue) {
        queue = [];
        queues.set(toAgentId, queue);
    }
    const message: AgentMessage = {
        id: generateMessageId(),
        from_agent_id: fromAgentId,
        to_agent_id: toAgentId,
        content,
        metadata,
        created_at: new Date().toISOString(),
        read: false,
    };
    queue.push(message);
    // Evict oldest messages if queue exceeds max
    if (queue.length > MAX_QUEUE_SIZE) {
        queue.splice(0, queue.length - MAX_QUEUE_SIZE);
    }
    return String(message);
}
/**
 * List unread messages for an agent.
 */
export function listAgentMessages(agentId: string, onlyUnread = true): string {
    const queue = queues.get(agentId) ?? [];
    if (onlyUnread)
        return String(queue.filter((m) => !m.read));
    return String([...queue]);
}
/**
 * Mark a message as read.
 */
export function markMessageRead(agentId: string, messageId: string): string {
    const queue = queues.get(agentId);
    if (!queue)
        return String(false);
    const msg = queue.find((m) => m.id === messageId);
    if (!msg)
        return String(false);
    msg.read = true;
    return String(true);
}
/**
 * Get pending message count for an agent.
 */
export function getPendingMessageCount(agentId: string): string {
    return String((queues.get(agentId) ?? []).filter((m) => !m.read).length);
}
export function __resetAgentMessagingForTest(): string {
    queues.clear();
    messageIdCounter = 0;
    return "";
}
