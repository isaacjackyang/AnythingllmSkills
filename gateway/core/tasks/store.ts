import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type TaskStatus = "pending" | "running" | "retry_scheduled" | "succeeded" | "failed" | "cancelled";

export interface TaskRecord {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  trace_id?: string;
  idempotency_key?: string;
  priority: number;
  status: TaskStatus;
  attempts: number;
  max_attempts: number;
  scheduled_at: string;
  created_at: string;
  updated_at: string;
  claimed_at?: string;
  claimed_by?: string;
  heartbeat_at?: string;
  last_error?: string;
  result?: Record<string, unknown>;
  agent_id?: string;
}

interface TaskDb {
  tasks: TaskRecord[];
}

export interface EnqueueTaskInput {
  name: string;
  payload: Record<string, unknown>;
  trace_id?: string;
  idempotency_key?: string;
  priority?: number;
  max_attempts?: number;
  scheduled_at?: string;
  agent_id?: string;
}

export interface ListTaskFilters {
  status?: TaskStatus;
  limit?: number;
  agent_id?: string;
}

const DEFAULT_DB_PATH = path.resolve(process.cwd(), "gateway/data/task_queue_db.json");
const TASK_DB_PATH = process.env.TASK_DB_PATH ? path.resolve(process.env.TASK_DB_PATH) : DEFAULT_DB_PATH;
let opChain: Promise<unknown> = Promise.resolve();

async function withLock<T>(operation: () => Promise<T>): Promise<T> {
  const next = opChain.then(operation);
  opChain = next.then(() => undefined, () => undefined);
  return next;
}

async function ensureDbPath(): Promise<void> {
  await mkdir(path.dirname(TASK_DB_PATH), { recursive: true });
}

async function readDb(): Promise<TaskDb> {
  try {
    const content = await readFile(TASK_DB_PATH, "utf8");
    const parsed = JSON.parse(content) as TaskDb;
    if (!parsed || !Array.isArray(parsed.tasks)) return { tasks: [] };
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { tasks: [] };
    throw error;
  }
}

async function writeDb(db: TaskDb): Promise<void> {
  await ensureDbPath();
  const tmpPath = `${TASK_DB_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(db, null, 2), "utf8");
  await rename(tmpPath, TASK_DB_PATH);
}

function nowIso(): string {
  return new Date().toISOString();
}

function byQueueOrder(a: TaskRecord, b: TaskRecord): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  if (a.scheduled_at !== b.scheduled_at) return a.scheduled_at.localeCompare(b.scheduled_at);
  return a.created_at.localeCompare(b.created_at);
}

export async function enqueueTask(input: EnqueueTaskInput): Promise<TaskRecord> {
  return withLock(async () => {
    const db = await readDb();
    if (input.idempotency_key) {
      const existing = db.tasks.find((task) => task.idempotency_key === input.idempotency_key);
      if (existing) return existing;
    }

    const createdAt = nowIso();
    const task: TaskRecord = {
      id: randomUUID(),
      name: input.name,
      payload: input.payload,
      trace_id: input.trace_id,
      idempotency_key: input.idempotency_key,
      priority: Number.isFinite(input.priority) ? Number(input.priority) : 100,
      status: "pending",
      attempts: 0,
      max_attempts: Math.max(1, Math.trunc(input.max_attempts ?? 3)),
      scheduled_at: input.scheduled_at ?? createdAt,
      agent_id: input.agent_id,
      created_at: createdAt,
      updated_at: createdAt,
    };

    db.tasks.push(task);
    await writeDb(db);
    return task;
  });
}

export async function listTasks(filters: ListTaskFilters = {}): Promise<TaskRecord[]> {
  return withLock(async () => {
    const db = await readDb();
    let filtered = filters.status ? db.tasks.filter((task) => task.status === filters.status) : db.tasks;
    if (filters.agent_id) filtered = filtered.filter((task) => task.agent_id === filters.agent_id);
    const sorted = [...filtered].sort(byQueueOrder);
    if (filters.limit && filters.limit > 0) return sorted.slice(0, filters.limit);
    return sorted;
  });
}

export async function getTaskById(taskId: string): Promise<TaskRecord | undefined> {
  return withLock(async () => {
    const db = await readDb();
    return db.tasks.find((task) => task.id === taskId);
  });
}

export async function claimNextTask(workerId: string, now = new Date()): Promise<TaskRecord | undefined> {
  return withLock(async () => {
    const db = await readDb();
    const nowIsoTime = now.toISOString();
    const claimable = db.tasks
      .filter((task) => (task.status === "pending" || task.status === "retry_scheduled") && task.scheduled_at <= nowIsoTime)
      .sort(byQueueOrder);

    const task = claimable[0];
    if (!task) return undefined;

    task.status = "running";
    task.claimed_by = workerId;
    task.claimed_at = nowIsoTime;
    task.heartbeat_at = nowIsoTime;
    task.updated_at = nowIsoTime;
    await writeDb(db);
    return task;
  });
}

export async function heartbeatTask(taskId: string, workerId: string): Promise<void> {
  return withLock(async () => {
    const db = await readDb();
    const task = db.tasks.find((item) => item.id === taskId);
    if (!task || task.status !== "running" || task.claimed_by !== workerId) return;
    task.heartbeat_at = nowIso();
    task.updated_at = task.heartbeat_at;
    await writeDb(db);
  });
}

export async function completeTask(taskId: string, workerId: string, result: Record<string, unknown>): Promise<TaskRecord> {
  return withLock(async () => {
    const db = await readDb();
    const task = db.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error("task not found");
    if (task.status !== "running") throw new Error("task is not running");
    if (task.claimed_by !== workerId) throw new Error("task claimed by different worker");

    task.attempts += 1;
    task.status = "succeeded";
    task.result = result;
    task.last_error = undefined;
    task.updated_at = nowIso();
    await writeDb(db);
    return task;
  });
}

export async function failTask(taskId: string, workerId: string, error: string): Promise<TaskRecord> {
  return withLock(async () => {
    const db = await readDb();
    const task = db.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error("task not found");
    if (task.status !== "running") throw new Error("task is not running");
    if (task.claimed_by !== workerId) throw new Error("task claimed by different worker");

    task.attempts += 1;
    task.last_error = error;
    task.updated_at = nowIso();

    if (task.attempts >= task.max_attempts) {
      task.status = "failed";
      task.scheduled_at = task.updated_at;
      await writeDb(db);
      return task;
    }

    const retryDelayMs = Math.min(60_000, 1_000 * 2 ** (task.attempts - 1));
    task.status = "retry_scheduled";
    task.scheduled_at = new Date(Date.now() + retryDelayMs).toISOString();
    await writeDb(db);
    return task;
  });
}

export async function cancelTask(taskId: string): Promise<TaskRecord> {
  return withLock(async () => {
    const db = await readDb();
    const task = db.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error("task not found");
    if (task.status === "succeeded" || task.status === "failed") throw new Error("cannot cancel terminal task");

    task.status = "cancelled";
    task.updated_at = nowIso();
    await writeDb(db);
    return task;
  });
}

export async function deleteTask(taskId: string): Promise<boolean> {
  return withLock(async () => {
    const db = await readDb();
    const index = db.tasks.findIndex((task) => task.id === taskId);
    if (index < 0) return false;
    const [target] = db.tasks.splice(index, 1);
    if (!["succeeded", "failed", "cancelled"].includes(target.status)) {
      throw new Error("only terminal tasks can be deleted");
    }
    await writeDb(db);
    return true;
  });
}

export async function resetTaskDbForTest(): Promise<void> {
  return withLock(async () => {
    await writeDb({ tasks: [] });
  });
}
