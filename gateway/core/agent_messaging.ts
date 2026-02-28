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
    return `msg-${Date.now()}-${messageIdCounter}`;
}

/**
 * Send a message from one agent to another.
 */
export function sendAgentMessage(
    fromAgentId: string,
    toAgentId: string,
    content: string,
    metadata: Record<string, unknown> = {},
): AgentMessage {
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

    return message;
}

/**
 * List unread messages for an agent.
 */
export function listAgentMessages(agentId: string, onlyUnread = true): AgentMessage[] {
    const queue = queues.get(agentId) ?? [];
    if (onlyUnread) return queue.filter((m) => !m.read);
    return [...queue];
}

/**
 * Mark a message as read.
 */
export function markMessageRead(agentId: string, messageId: string): boolean {
    const queue = queues.get(agentId);
    if (!queue) return false;
    const msg = queue.find((m) => m.id === messageId);
    if (!msg) return false;
    msg.read = true;
    return true;
}

/**
 * Get pending message count for an agent.
 */
export function getPendingMessageCount(agentId: string): number {
    return (queues.get(agentId) ?? []).filter((m) => !m.read).length;
}

export function __resetAgentMessagingForTest(): void {
    queues.clear();
    messageIdCounter = 0;
}
