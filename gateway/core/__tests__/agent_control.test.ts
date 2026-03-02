import test from "node:test";
import assert from "node:assert/strict";
import { __resetAgentControlForTest, applyAgentControl, getAgentControlSnapshot } from "../agent_control.ts";
test("agent control transitions follow valid state machine", (): string => {
    __resetAgentControlForTest("idle");
    const idle = getAgentControlSnapshot();
    assert.equal(idle.state, "idle");
    assert.equal(idle.can.start, true);
    assert.equal(idle.can.stop, false);
    const running = applyAgentControl("start");
    assert.equal(running.state, "running");
    assert.equal(running.can.pause, true);
    const paused = applyAgentControl("pause");
    assert.equal(paused.state, "paused");
    assert.equal(paused.can.resume, true);
    const resumed = applyAgentControl("resume");
    assert.equal(resumed.state, "running");
    const stopped = applyAgentControl("stop");
    assert.equal(stopped.state, "stopped");
    assert.equal(stopped.task_progress, 0);
    assert.equal(stopped.can.start, true);
    return "";
});
test("agent control rejects invalid transitions", (): string => {
    __resetAgentControlForTest("idle");
    assert.throws(() => applyAgentControl("pause"), /invalid action/);
    assert.throws(() => applyAgentControl("resume"), /invalid action/);
    return "";
});
test("agent control keeps isolated state per agent", (): string => {
    __resetAgentControlForTest("idle", "primary");
    const first = applyAgentControl("start", "alpha");
    const second = getAgentControlSnapshot("beta");
    assert.equal(first.state, "running");
    assert.equal(second.state, "idle");
    return "";
});
