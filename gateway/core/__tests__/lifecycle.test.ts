import test from "node:test";
import assert from "node:assert/strict";
import {
  __setLastBeatEpochMsForTest,
  getLifecycleSnapshot,
  parseHeartbeatInterval,
  startHeartbeat,
  stopHeartbeat,
  updateSoul,
} from "../lifecycle.ts";

test("parseHeartbeatInterval falls back for invalid values", () => {
  assert.equal(parseHeartbeatInterval(undefined, 1234), 1234);
  assert.equal(parseHeartbeatInterval("0", 1234), 1234);
  assert.equal(parseHeartbeatInterval("-9", 1234), 1234);
  assert.equal(parseHeartbeatInterval("foo", 1234), 1234);
  assert.equal(parseHeartbeatInterval("999.9", 1234), 999);
});

test("startHeartbeat emits beats and exposes soul data", async () => {
  stopHeartbeat();
  startHeartbeat(20);
  const first = getLifecycleSnapshot();
  await new Promise((r) => setTimeout(r, 40));
  const second = getLifecycleSnapshot();

  assert.equal(first.status, "ok");
  assert.equal(second.status, "ok");
  assert.ok(second.heartbeat.sequence >= first.heartbeat.sequence);
  assert.ok(second.soul.instance_id.length > 0);
  assert.ok(second.soul.uptime_ms >= 0);

  stopHeartbeat();
});

test("snapshot becomes stale when last beat exceeds threshold", () => {
  stopHeartbeat();
  startHeartbeat(50);
  const now = Date.now();
  __setLastBeatEpochMsForTest(now - 500);
  const snapshot = getLifecycleSnapshot();
  assert.equal(snapshot.status, "stale");
  assert.ok(snapshot.heartbeat.age_ms >= 500);
  stopHeartbeat();
});

test("soul can be updated with revision increment", async () => {
  const before = getLifecycleSnapshot().soul;
  await new Promise((r) => setTimeout(r, 5));
  const updated = updateSoul({ role: "ops", node_env: "production" });
  const after = getLifecycleSnapshot().soul;

  assert.equal(updated.role, "ops");
  assert.equal(updated.node_env, "production");
  assert.equal(after.role, "ops");
  assert.equal(after.node_env, "production");
  assert.ok(after.revision > before.revision);
  assert.ok(after.last_updated_epoch_ms >= before.last_updated_epoch_ms);
});
