import { claimNextTask, completeTask, failTask, heartbeatTask, type TaskRecord } from "../core/tasks/store";

let timer: NodeJS.Timeout | undefined;
const DEFAULT_INTERVAL_MS = 2_000;
const WORKER_ID = process.env.TASK_WORKER_ID ?? `worker-${process.pid}`;

async function executeTask(task: TaskRecord): Promise<Record<string, unknown>> {
  await heartbeatTask(task.id, WORKER_ID);
  if (task.payload.fail === true) {
    throw new Error("simulated task failure from payload.fail=true");
  }

  // TODO: implement real task execution based on task.name / task.payload
  console.warn(`[job_runner] task ${task.id} (${task.name}): real execution not implemented, completed as no-op`);

  return {
    ok: true,
    warning: "no-op execution: real task handler not yet implemented",
    task_id: task.id,
    name: task.name,
    processed_at: new Date().toISOString(),
    trace_id: task.trace_id,
  };
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
