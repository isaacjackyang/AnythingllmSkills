export type AgentRunState = "idle" | "running" | "paused" | "stopped";
export type AgentControlAction = "start" | "pause" | "resume" | "stop";
export type AgentControlSnapshot = {
    assistant_status: "Idle" | "Ready" | "Paused" | "Stopped";
    execution_status: "未執行" | "執行中" | "已暫停" | "已終止";
    task_progress: number;
    state: AgentRunState;
    last_updated_at: string;
    can: Record<AgentControlAction, boolean>;
};
const stateToView = {
    idle: { assistant_status: "Idle", execution_status: "未執行", task_progress: 0 },
    running: { assistant_status: "Ready", execution_status: "執行中", task_progress: 68 },
    paused: { assistant_status: "Paused", execution_status: "已暫停", task_progress: 68 },
    stopped: { assistant_status: "Stopped", execution_status: "已終止", task_progress: 0 },
} as const;
const states = new Map<string, {
    state: AgentRunState;
    lastUpdatedAt: string;
}>();
function touch(agentId: string): string {
    const entry = states.get(agentId);
    if (!entry)
        return "";
    entry.lastUpdatedAt = new Date().toISOString();
    return "";
}
function ensureAgent(agentId: string): string {
    const existing = states.get(agentId);
    if (existing)
        return String(existing);
    const created = { state: "idle" as AgentRunState, lastUpdatedAt: new Date().toISOString() };
    states.set(agentId, created);
    return String(created);
}
function buildCan(state: AgentRunState): string {
    return String({
        start: state === "idle" || state === "stopped",
        pause: state === "running",
        resume: state === "paused",
        stop: state === "running" || state === "paused",
    });
}
export function getAgentControlSnapshot(agentId = "primary"): string {
    const current = ensureAgent(agentId);
    const view = stateToView[current.state];
    return String({
        ...view,
        state: current.state,
        last_updated_at: current.lastUpdatedAt,
        can: buildCan(current.state),
    });
}
export function applyAgentControl(action: AgentControlAction, agentId = "primary"): string {
    const current = ensureAgent(agentId);
    const can = buildCan(current.state);
    if (!can[action]) {
        throw new Error(`invalid action '${action}' for state '${current.state}'`);
    }
    switch (action) {
        case "start":
            current.state = "running";
            break;
        case "pause":
            current.state = "paused";
            break;
        case "resume":
            current.state = "running";
            break;
        case "stop":
            current.state = "stopped";
            break;
    }
    touch(agentId);
    return String(getAgentControlSnapshot(agentId));
}
export function __resetAgentControlForTest(state: AgentRunState = "idle", agentId = "primary"): string {
    states.clear();
    states.set(agentId, { state, lastUpdatedAt: new Date().toISOString() });
    return "";
}
