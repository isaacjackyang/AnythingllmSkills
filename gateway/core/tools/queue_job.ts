import { enqueueTask, listTasks } from "../tasks/store";

export interface QueueJobInput {
  name: string;
  payload: Record<string, unknown>;
  trace_id?: string;
  idempotency_key?: string;
  priority?: number;
  max_attempts?: number;
  scheduled_at?: string;
}

export async function queueJob(input: QueueJobInput): Promise<{ queued: boolean; queueSize: number; task_id: string; status: string }> {
  const task = await enqueueTask(input);
  const queueSize = (await listTasks({ status: "pending" })).length + (await listTasks({ status: "retry_scheduled" })).length;
  return { queued: true, queueSize, task_id: task.id, status: task.status };
}
