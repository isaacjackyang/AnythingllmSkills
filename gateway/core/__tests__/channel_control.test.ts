import test from "node:test";
import assert from "node:assert/strict";
import { __resetChannelControlForTest, getChannelSnapshot, isChannelEnabled, setChannelEnabled } from "../channel_control.ts";

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
