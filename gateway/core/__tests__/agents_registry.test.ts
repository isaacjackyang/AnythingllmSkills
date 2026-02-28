import test from "node:test";
import assert from "node:assert/strict";
import { createAgent, ensurePrimaryAgent, listAgents, resetAgentsForTest } from "../agents_registry.ts";

test("agents registry creates primary and secondary agents", async () => {
  await resetAgentsForTest();
  const primary = await ensurePrimaryAgent("ops-agent", "gpt-oss:20b");
  assert.equal(primary.is_primary, true);

  const created = await createAgent({ name: "planner", model: "qwen2.5", soul: "plan", communication_mode: "direct" });
  assert.equal(created.is_primary, false);
  assert.equal(created.communication_mode, "direct");

  const all = await listAgents();
  assert.equal(all.length, 2);
  assert.equal(all[0].is_primary, true);
});
