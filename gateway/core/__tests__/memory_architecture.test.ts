import test from "node:test";
import assert from "node:assert/strict";
import { getLdbArchitectureSnapshot } from "../memory/ldb_architecture.ts";

test("ldb architecture snapshot exposes seven-layer retrieval", () => {
  const snapshot = getLdbArchitectureSnapshot();
  assert.equal(snapshot.engine, "lancedb");
  assert.equal(snapshot.retrieval_layers.length, 7);
  assert.equal(snapshot.supports.hybrid_search, true);
});
