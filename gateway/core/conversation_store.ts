/**
 * In-memory conversation history store.
 * Keeps the last N turns per thread_id for context continuity.
 */

export interface ConversationTurn {
    role: "user" | "assistant";
    content: string;
    timestamp: string;
}

const MAX_TURNS = Number(process.env.MAX_CONVERSATION_TURNS) || 10;
const MAX_THREADS = 1000; // prevent unbounded memory growth

const threads = new Map<string, ConversationTurn[]>();

export function addTurn(threadId: string, role: "user" | "assistant", content: string): void {
    let turns = threads.get(threadId);
    if (!turns) {
        // Evict oldest thread if too many
        if (threads.size >= MAX_THREADS) {
            const oldestKey = threads.keys().next().value;
            if (oldestKey) threads.delete(oldestKey);
        }
        turns = [];
        threads.set(threadId, turns);
    }
    turns.push({ role, content, timestamp: new Date().toISOString() });
    // Keep only last N turns
    if (turns.length > MAX_TURNS) {
        turns.splice(0, turns.length - MAX_TURNS);
    }
}

export function getHistory(threadId: string): ConversationTurn[] {
    return threads.get(threadId) ?? [];
}

export function clearThread(threadId: string): void {
    threads.delete(threadId);
}

export function getThreadCount(): number {
    return threads.size;
}

export function __resetConversationStoreForTest(): void {
    threads.clear();
}
