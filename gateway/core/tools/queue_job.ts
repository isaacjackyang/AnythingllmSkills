export interface QueueJobInput {
  name: string;
  payload: Record<string, unknown>;
}

const jobQueue: QueueJobInput[] = [];

export function queueJob(input: QueueJobInput): { queued: boolean; queueSize: number } {
  jobQueue.push(input);
  return { queued: true, queueSize: jobQueue.length };
}
