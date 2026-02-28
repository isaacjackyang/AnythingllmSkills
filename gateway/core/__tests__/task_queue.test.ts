import test from "node:test";
import assert from "node:assert/strict";
import {
  cancelTask,
  claimNextTask,
  completeTask,
  deleteTask,
  enqueueTask,
  failTask,
  listTasks,
  resetTaskDbForTest,
} from "../tasks/store.ts";

test("enqueue persists and claim follows priority order", async () => {
  await resetTaskDbForTest();
  const low = await enqueueTask({ name: "low", payload: {}, priority: 10 });
  const high = await enqueueTask({ name: "high", payload: {}, priority: 999 });

  const claimed = await claimNextTask("worker-a");
  assert.ok(claimed);
  assert.equal(claimed.id, high.id);
  assert.notEqual(claimed.id, low.id);
});

test("failed running task moves to retry_scheduled then failed after max attempts", async () => {
  await resetTaskDbForTest();
  const task = await enqueueTask({ name: "retry", payload: {}, max_attempts: 2 });

  const firstRun = await claimNextTask("worker-b");
  assert.equal(firstRun?.id, task.id);
  const firstFail = await failTask(task.id, "worker-b", "boom");
  assert.equal(firstFail.status, "retry_scheduled");
  assert.equal(firstFail.attempts, 1);

  // Force immediate retry by re-enqueueing schedule in the past through another fail cycle.
  const nextRun = await claimNextTask("worker-b", new Date(Date.now() + 120_000));
  assert.equal(nextRun?.id, task.id);
  const secondFail = await failTask(task.id, "worker-b", "still boom");
  assert.equal(secondFail.status, "failed");
  assert.equal(secondFail.attempts, 2);
});

test("complete/cancel/delete obey state constraints", async () => {
  await resetTaskDbForTest();
  const task = await enqueueTask({ name: "ok", payload: {} });
  const running = await claimNextTask("worker-c");
  assert.equal(running?.id, task.id);

  const done = await completeTask(task.id, "worker-c", { ok: true });
  assert.equal(done.status, "succeeded");

  const deleted = await deleteTask(task.id);
  assert.equal(deleted, true);

  const pending = await enqueueTask({ name: "cancel-me", payload: {} });
  const cancelled = await cancelTask(pending.id);
  assert.equal(cancelled.status, "cancelled");

  const all = await listTasks();
  assert.equal(all.length, 1);
  assert.equal(all[0].status, "cancelled");
});


test("listTasks can filter by agent_id", async () => {
  await resetTaskDbForTest();
  await enqueueTask({ name: "a-1", payload: {}, agent_id: "alpha" });
  await enqueueTask({ name: "b-1", payload: {}, agent_id: "beta" });

  const alphaTasks = await listTasks({ agent_id: "alpha" });
  assert.equal(alphaTasks.length, 1);
  assert.equal(alphaTasks[0].agent_id, "alpha");
});
