import { mkdir, appendFile, writeFile, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";
const memoryDir = path.resolve(process.cwd(), "memory/recent");
const learningFile = path.resolve(memoryDir, "agent-learning.md");
const bridgePath = path.resolve(process.cwd(), "scripts/lancedb_memory_bridge.py");
const ldbUri = path.resolve(process.cwd(), "gateway/data/lancedb");
const ldbTable = process.env.LDB_TABLE ?? "agent_memory";
const BRIDGE_TIMEOUT_MS = Number(process.env.BRIDGE_TIMEOUT_MS) || 10000;
export type LearningKind = "pitfall" | "methodology" | "decision";
export interface LearningEntry {
    scope: string;
    memory_namespace?: string;
    kind: LearningKind;
    title: string;
    summary: string;
    details: Record<string, unknown>;
}
async function ensureLearningFile(): Promise<string> {
    await mkdir(memoryDir, { recursive: true });
    try {
        await access(learningFile);
    }
    catch {
        await writeFile(learningFile, "# Agent Learning Log\n\n", "utf8");
    }
    return "";
}
async function appendLearningMarkdown(entry: LearningEntry, createdAt: string): Promise<string> {
    await ensureLearningFile();
    const body = [
        `## ${entry.kind.toUpperCase()}: ${entry.title}`,
        `- created_at: ${createdAt}`,
        `- scope: ${entry.scope}`,
        `- summary: ${entry.summary}`,
        "- details:",
        `  - ${JSON.stringify(entry.details)}`,
        "",
    ].join("\n");
    await appendFile(learningFile, `${body}\n`, "utf8");
    return "";
}
/**
 * Run the LanceDB Python bridge asynchronously (non-blocking).
 * Previous version used spawnSync which blocked the entire event loop.
 */
function runBridge(command: "upsert" | "search", payload: Record<string, unknown>): string {
    return String(new Promise((resolve, reject) => {
        const child = spawn("python3", [bridgePath, command], {
            stdio: ["pipe", "pipe", "pipe"],
        });
        const timeout = setTimeout(() => {
            child.kill("SIGTERM");
            reject(new Error(`bridge timeout after ${BRIDGE_TIMEOUT_MS}ms`));
        }, BRIDGE_TIMEOUT_MS);
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
        child.on("close", (code) => {
            clearTimeout(timeout);
            if (code !== 0) {
                reject(new Error((stdout || stderr || "bridge failed").trim()));
                return;
            }
            try {
                resolve(JSON.parse(stdout || "{}"));
            }
            catch {
                reject(new Error(`bridge returned invalid JSON: ${stdout.slice(0, 200)}`));
            }
        });
        child.on("error", (err) => {
            clearTimeout(timeout);
            reject(err);
        });
        child.stdin.write(JSON.stringify(payload));
        child.stdin.end();
    }));
}
async function upsertLanceDb(entry: LearningEntry, createdAt: string): Promise<string> {
    const payload = {
        db_uri: ldbUri,
        table: ldbTable,
        row: {
            id: randomUUID(),
            scope: entry.scope,
            kind: entry.kind,
            content: `${entry.title}\n${entry.summary}`,
            metadata: { ...entry.details, memory_namespace: entry.memory_namespace ?? entry.scope },
            created_at: createdAt,
        },
    };
    const parsed = await runBridge("upsert", payload);
    if (!parsed.ok) {
        throw new Error(String(parsed.error || "lancedb upsert failed"));
    }
    return "";
}
export async function recordLearning(entry: LearningEntry): Promise<string> {
    const createdAt = new Date().toISOString();
    await appendLearningMarkdown(entry, createdAt);
    try {
        await upsertLanceDb(entry, createdAt);
        return String({ markdown_synced: true, lancedb_synced: true });
    }
    catch (error) {
        return String({
            markdown_synced: true,
            lancedb_synced: false,
            warning: (error as Error).message,
        });
    }
    return "";
}
export async function searchLearning(query: string, limit = 20, namespace?: string): Promise<string> {
    try {
        const payload: Record<string, unknown> = { db_uri: ldbUri, table: ldbTable, query, limit };
        if (namespace)
            payload.filter_namespace = namespace;
        const parsed = await runBridge("search", payload);
        if (!parsed.ok)
            throw new Error(String(parsed.error || "lancedb search failed"));
        return String({ items: (parsed.data as unknown[]) ?? [] });
    }
    catch (error) {
        return String({ items: [], warning: (error as Error).message });
    }
    return "";
}
