/**
 * Built-in autonomy hooks — proactive behaviors driven by the heartbeat.
 *
 * Each hook runs periodically on heartbeat ticks. They make the agent
 * self-aware and self-maintaining without external triggers.
 */

import { registerHeartbeatHook } from "./lifecycle.js";
import { getPendingMessageCount } from "./agent_messaging.js";
import { getThreadCount } from "./conversation_store.js";
import { getChannelSnapshot } from "./channel_control.js";
import { listPendingActions, expireStalePendingActions } from "./approvals_store.js";
import { listTasks } from "./tasks/store.js";

/**
 * Register all built-in autonomy hooks.
 * Called once during app initialization (create_app.ts).
 */
export function registerBuiltInHooks(): void {

    // ── Hook 1: Self-Health Awareness (every 6 beats ≈ 60s) ──
    // Logs a summary of system vital signs
    registerHeartbeatHook("self-health", async (snapshot) => {
        const channels = getChannelSnapshot();
        const activeChannels = Object.entries(channels).filter(([, ch]) => ch.connected).map(([k]) => k);
        const pendingApprovals = (await listPendingActions({ status: "pending" })).length;
        const runningTasks = (await listTasks({ status: "running" })).length;
        const pendingTasks = (await listTasks({ status: "pending" })).length;

        console.log(
            `[heartbeat:self-health] seq=${snapshot.heartbeat.sequence} ` +
            `uptime=${Math.floor(snapshot.soul.uptime_ms / 1000)}s ` +
            `status=${snapshot.status} ` +
            `channels=[${activeChannels.join(",")}] ` +
            `approvals_pending=${pendingApprovals} ` +
            `tasks_running=${runningTasks} tasks_pending=${pendingTasks} ` +
            `conversations=${getThreadCount()} ` +
            `strategy=${snapshot.soul.thinking_strategy}`
        );
    }, 6);

    // ── Hook 2: Expired Approval Cleanup (every 30 beats ≈ 5m) ──
    // Automatically expires stale pending actions
    registerHeartbeatHook("expire-approvals", async () => {
        const expired = await expireStalePendingActions();
        if (expired > 0) {
            console.log(`[heartbeat:expire-approvals] expired ${expired} stale pending actions`);
        }
    }, 30);

    // ── Hook 3: Pending Agent Messages Alert (every 3 beats ≈ 30s) ──
    // Checks if any agent has unread messages
    registerHeartbeatHook("agent-messages", async () => {
        const primaryPending = getPendingMessageCount("primary");
        if (primaryPending > 0) {
            console.log(`[heartbeat:agent-messages] primary agent has ${primaryPending} unread message(s)`);
        }
    }, 3);

    // ── Hook 4: Stale Task Detection (every 12 beats ≈ 2m) ──
    // Warns about tasks running too long without heartbeat
    registerHeartbeatHook("stale-tasks", async () => {
        const running = await listTasks({ status: "running" });
        const now = Date.now();
        const staleThresholdMs = 5 * 60_000; // 5 minutes

        for (const task of running) {
            const lastActivity = task.heartbeat_at ?? task.claimed_at ?? task.updated_at;
            if (!lastActivity) continue;
            const age = now - new Date(lastActivity).getTime();
            if (age > staleThresholdMs) {
                console.warn(
                    `[heartbeat:stale-tasks] task ${task.id} (${task.name}) has been running for ${Math.floor(age / 1000)}s without heartbeat`
                );
            }
        }
    }, 12);
}
