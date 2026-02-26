import test from "node:test";
import assert from "node:assert/strict";
import { __resetChannelControlForTest, __setChannelLastActivityForTest, getChannelSnapshot, isChannelEnabled, markChannelActivity, setChannelEnabled } from "../channel_control.ts";

test("channel control default state is enabled", () => {
  __resetChannelControlForTest();
  const snapshot = getChannelSnapshot();
  assert.equal(snapshot.telegram.enabled, true);
  assert.equal(snapshot.line.enabled, true);
  assert.equal(snapshot.web_ui.enabled, true);
});

test("channel control can toggle channel independently", () => {
  __resetChannelControlForTest();
  setChannelEnabled("line", false);

  assert.equal(isChannelEnabled("line"), false);
  assert.equal(isChannelEnabled("telegram"), true);
  assert.equal(isChannelEnabled("web_ui"), true);
});


test("channel connectivity should depend on activity", () => {
  __resetChannelControlForTest();
  let snapshot = getChannelSnapshot();
  assert.equal(snapshot.telegram.connected, false);
  assert.equal(snapshot.telegram.last_activity_at, null);

  markChannelActivity("telegram");
  snapshot = getChannelSnapshot();
  assert.equal(snapshot.telegram.connected, true);
  assert.ok(snapshot.telegram.last_activity_at);

  setChannelEnabled("telegram", false);
  snapshot = getChannelSnapshot();
  assert.equal(snapshot.telegram.connected, false);
});


test("channel connectivity should expire when activity is stale", () => {
  __resetChannelControlForTest();
  const stale = new Date(Date.now() - 120_000).toISOString();
  __setChannelLastActivityForTest("telegram", stale);

  const next = getChannelSnapshot();
  assert.equal(next.telegram.connected, false);
});
