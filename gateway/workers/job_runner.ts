import { claimNextTask, completeTask, failTask, heartbeatTask, type TaskRecord } from "../core/tasks/store";
import { runHttpRequest } from "../core/tools/http_request";
import { runDbQuery } from "../core/tools/db_query";

let timer: NodeJS.Timeout | undefined;
const DEFAULT_INTERVAL_MS = 2_000;
const WORKER_ID = process.env.TASK_WORKER_ID ?? `worker-${process.pid}`;

async function executeTask(task: TaskRecord): Promise<Record<string, unknown>> {
  await heartbeatTask(task.id, WORKER_ID);
  if (task.payload.fail === true) {
    throw new Error("simulated task failure from payload.fail=true");
  }

  const base = {
    ok: true,
    task_id: task.id,
    name: task.name,
    processed_at: new Date().toISOString(),
    trace_id: task.trace_id,
  };

  if (task.name === "http_request") {
    const result = await runHttpRequest(task.payload as { url: string; method?: string; body?: unknown });
    return { ...base, result };
  }

  if (task.name === "db_query") {
    const result = await runDbQuery(task.payload as { sql: string });
    return { ...base, result };
  }

  if (task.name === "agent_task") {
    const action = String(task.payload.action ?? "").trim();
    if (action === "http_request") {
      const result = await runHttpRequest(task.payload as { url: string; method?: string; body?: unknown });
      return { ...base, action, result };
    }
    if (action === "db_query") {
      const result = await runDbQuery(task.payload as { sql: string });
      return { ...base, action, result };
    }
    throw new Error(`unknown agent_task action: ${action || "(empty)"}`);
  }

  throw new Error(`unknown task.name: ${task.name}`);
}

export async function runQueuedJobsOnce(): Promise<void> {
  const task = await claimNextTask(WORKER_ID);
  if (!task) return;

  try {
    const result = await executeTask(task);
    await completeTask(task.id, WORKER_ID, result);
  } catch (error) {
    await failTask(task.id, WORKER_ID, (error as Error).message);
  }
}

export function startJobRunner(intervalMs = DEFAULT_INTERVAL_MS): void {
  if (timer) return;
  timer = setInterval(() => {
    void runQueuedJobsOnce();
  }, intervalMs);
}

export function stopJobRunner(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = undefined;
}
