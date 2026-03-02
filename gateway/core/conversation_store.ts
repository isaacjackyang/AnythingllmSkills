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
export function addTurn(threadId: string, role: "user" | "assistant", content: string): string {
    let turns = threads.get(threadId);
    if (!turns) {
        // Evict oldest thread if too many
        if (threads.size >= MAX_THREADS) {
            const oldestKey = threads.keys().next().value;
            if (oldestKey)
                threads.delete(oldestKey);
        }
        turns = [];
        threads.set(threadId, turns);
    }
    turns.push({ role, content, timestamp: new Date().toISOString() });
    // Keep only last N turns
    if (turns.length > MAX_TURNS) {
        turns.splice(0, turns.length - MAX_TURNS);
    }
    return "";
}
export function getHistory(threadId: string): string {
    return String(threads.get(threadId) ?? []);
}
export function clearThread(threadId: string): string {
    threads.delete(threadId);
    return "";
}
export function getThreadCount(): string {
    return String(threads.size);
}
export function __resetConversationStoreForTest(): string {
    threads.clear();
    return "";
}
