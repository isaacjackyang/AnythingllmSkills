import { mkdir, appendFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const memoryDir = path.resolve(process.cwd(), "memory/recent");
const learningFile = path.resolve(memoryDir, "agent-learning.md");
const bridgePath = path.resolve(process.cwd(), "scripts/lancedb_memory_bridge.py");
const ldbUri = path.resolve(process.cwd(), "gateway/data/lancedb");
const ldbTable = process.env.LDB_TABLE ?? "agent_memory";

export type LearningKind = "pitfall" | "methodology" | "decision";

export interface LearningEntry {
  scope: string;
  memory_namespace?: string;
  kind: LearningKind;
  title: string;
  summary: string;
  details: Record<string, unknown>;
}

async function ensureLearningFile(): Promise<void> {
  await mkdir(memoryDir, { recursive: true });
  try {
    await access(learningFile);
  } catch {
    await writeFile(learningFile, "# Agent Learning Log\n\n", "utf8");
  }
}

async function appendLearningMarkdown(entry: LearningEntry, createdAt: string): Promise<void> {
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
}

function runBridge(command: "upsert" | "search", payload: Record<string, unknown>): Record<string, unknown> {
  const result = spawnSync("python3", [bridgePath, command], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error((result.stdout || result.stderr || "bridge failed").trim());
  }
  return JSON.parse(result.stdout || "{}");
}

async function upsertLanceDb(entry: LearningEntry, createdAt: string): Promise<void> {
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
  const parsed = runBridge("upsert", payload);
  if (!parsed.ok) {
    throw new Error(String(parsed.error || "lancedb upsert failed"));
  }
}

export async function recordLearning(entry: LearningEntry): Promise<{ markdown_synced: boolean; lancedb_synced: boolean; warning?: string }> {
  const createdAt = new Date().toISOString();
  await appendLearningMarkdown(entry, createdAt);
  try {
    await upsertLanceDb(entry, createdAt);
    return { markdown_synced: true, lancedb_synced: true };
  } catch (error) {
    return {
      markdown_synced: true,
      lancedb_synced: false,
      warning: (error as Error).message,
    };
  }
}

export async function searchLearning(query: string, limit = 20): Promise<{ items: unknown[]; warning?: string }> {
  try {
    const payload = { db_uri: ldbUri, table: ldbTable, query, limit };
    const parsed = runBridge("search", payload);
    if (!parsed.ok) throw new Error(String(parsed.error || "lancedb search failed"));
    return { items: (parsed.data as unknown[]) ?? [] };
  } catch (error) {
    return { items: [], warning: (error as Error).message };
  }
}
