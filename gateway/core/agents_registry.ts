import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type AgentCommMode = "hub_and_spoke" | "direct";

export interface AgentProfile {
  id: string;
  name: string;
  model: string;
  soul: string;
  task_board: string;
  memory_namespace: string;
  communication_mode: AgentCommMode;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

interface AgentDb {
  agents: AgentProfile[];
}

const DEFAULT_DB_PATH = path.resolve(process.cwd(), "gateway/data/agent_registry.json");
const AGENT_DB_PATH = process.env.AGENT_DB_PATH ? path.resolve(process.env.AGENT_DB_PATH) : DEFAULT_DB_PATH;

let opChain: Promise<unknown> = Promise.resolve();

function withLock<T>(operation: () => Promise<T>): Promise<T> {
  const next = opChain.then(operation);
  opChain = next.then(() => undefined, () => undefined);
  return next;
}

async function ensureDbPath(): Promise<void> {
  await mkdir(path.dirname(AGENT_DB_PATH), { recursive: true });
}

async function readDb(): Promise<AgentDb> {
  try {
    const content = await readFile(AGENT_DB_PATH, "utf8");
    const parsed = JSON.parse(content) as AgentDb;
    if (!parsed || !Array.isArray(parsed.agents)) return { agents: [] };
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { agents: [] };
    throw error;
  }
}

async function writeDb(db: AgentDb): Promise<void> {
  await ensureDbPath();
  const tmpPath = `${AGENT_DB_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(db, null, 2), "utf8");
  await rename(tmpPath, AGENT_DB_PATH);
}

function nowIso(): string {
  return new Date().toISOString();
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "agent";
}

export async function ensurePrimaryAgent(defaultName: string, defaultModel: string): Promise<AgentProfile> {
  return withLock(async () => {
    const db = await readDb();
    const existingPrimary = db.agents.find((item) => item.is_primary);
    if (existingPrimary) return existingPrimary;

    const createdAt = nowIso();
    const base = slug(defaultName);
    const profile: AgentProfile = {
      id: base,
      name: defaultName,
      model: defaultModel,
      soul: "operations",
      task_board: `${base}-board`,
      memory_namespace: `${base}-memory`,
      communication_mode: "hub_and_spoke",
      is_primary: true,
      created_at: createdAt,
      updated_at: createdAt,
    };
    db.agents.push(profile);
    await writeDb(db);
    return profile;
  });
}

export async function listAgents(): Promise<AgentProfile[]> {
  return withLock(async () => {
    const db = await readDb();
    return [...db.agents].sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      return a.created_at.localeCompare(b.created_at);
    });
  });
}

export async function getAgentById(agentId: string): Promise<AgentProfile | undefined> {
  return withLock(async () => {
    const db = await readDb();
    return db.agents.find((item) => item.id === agentId);
  });
}

export async function createAgent(input: {
  name: string;
  model: string;
  soul: string;
  communication_mode?: AgentCommMode;
}): Promise<AgentProfile> {
  return withLock(async () => {
    const db = await readDb();
    const createdAt = nowIso();
    const base = slug(input.name);
    const taken = new Set(db.agents.map((item) => item.id));
    let candidate = base;
    let index = 1;
    while (taken.has(candidate)) {
      index += 1;
      candidate = `${base}-${index}`;
    }

    const profile: AgentProfile = {
      id: candidate,
      name: input.name,
      model: input.model,
      soul: input.soul,
      task_board: `${candidate}-board`,
      memory_namespace: `${candidate}-memory`,
      communication_mode: input.communication_mode ?? "hub_and_spoke",
      is_primary: false,
      created_at: createdAt,
      updated_at: createdAt,
    };

    db.agents.push(profile);
    await writeDb(db);
    return profile;
  });
}

export async function updateAgent(agentId: string, patch: Partial<Pick<AgentProfile, "name" | "model" | "soul" | "task_board" | "memory_namespace" | "communication_mode">>): Promise<AgentProfile> {
  return withLock(async () => {
    const db = await readDb();
    const target = db.agents.find((item) => item.id === agentId);
    if (!target) throw new Error("agent not found");

    target.name = patch.name?.trim() ? patch.name.trim() : target.name;
    target.model = patch.model?.trim() ? patch.model.trim() : target.model;
    target.soul = patch.soul?.trim() ? patch.soul.trim() : target.soul;
    target.task_board = patch.task_board?.trim() ? patch.task_board.trim() : target.task_board;
    target.memory_namespace = patch.memory_namespace?.trim() ? patch.memory_namespace.trim() : target.memory_namespace;
    target.communication_mode = patch.communication_mode ?? target.communication_mode;
    target.updated_at = nowIso();

    await writeDb(db);
    return target;
  });
}

export async function resetAgentsForTest(): Promise<void> {
  return withLock(async () => {
    await writeDb({ agents: [] });
  });
}
