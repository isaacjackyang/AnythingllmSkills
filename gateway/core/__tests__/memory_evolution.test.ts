import test from "node:test";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { recordLearning } from "../memory/evolution.ts";

const learningFile = path.resolve(process.cwd(), "memory/recent/agent-learning.md");

test("recordLearning syncs markdown even when lancedb may be unavailable", async () => {
  await rm(learningFile, { force: true });
  const result = await recordLearning({
    scope: "test:agent",
    kind: "pitfall",
    title: "unit-test",
    summary: "test summary",
    details: { from: "test" },
  });

  assert.equal(result.markdown_synced, true);
  const content = await readFile(learningFile, "utf8");
  assert.match(content, /unit-test/);
});
