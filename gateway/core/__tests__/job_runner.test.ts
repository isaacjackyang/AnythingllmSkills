import test from "node:test";
import assert from "node:assert/strict";
import { enqueueTask, getTaskById, resetTaskDbForTest } from "../tasks/store.ts";
import { runQueuedJobsOnce } from "../../workers/job_runner.ts";

test("job runner fails unknown task name", async () => {
  await resetTaskDbForTest();
  const task = await enqueueTask({ name: "unknown-task", payload: {}, max_attempts: 1 });

  await runQueuedJobsOnce();

  const updated = await getTaskById(task.id);
  assert.ok(updated);
  assert.equal(updated?.status, "failed");
  assert.match(updated?.last_error || "", /unknown task.name/);
});

test("job runner dispatches http_request handler and surfaces tool error", async () => {
  await resetTaskDbForTest();
  const task = await enqueueTask({
    name: "http_request",
    payload: { url: "https://not-allowed.example.com", method: "GET" },
    max_attempts: 1,
  });

  await runQueuedJobsOnce();

  const updated = await getTaskById(task.id);
  assert.ok(updated);
  assert.equal(updated?.status, "failed");
  assert.match(updated?.last_error || "", /host not allowed/);
});
