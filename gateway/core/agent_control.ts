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

let currentState: AgentRunState = "idle";
let lastUpdatedAt = new Date().toISOString();

function touch(): void {
  lastUpdatedAt = new Date().toISOString();
}

function buildCan(state: AgentRunState): Record<AgentControlAction, boolean> {
  return {
    start: state === "idle" || state === "stopped",
    pause: state === "running",
    resume: state === "paused",
    stop: state === "running" || state === "paused",
  };
}

export function getAgentControlSnapshot(): AgentControlSnapshot {
  const view = stateToView[currentState];
  return {
    ...view,
    state: currentState,
    last_updated_at: lastUpdatedAt,
    can: buildCan(currentState),
  };
}

export function applyAgentControl(action: AgentControlAction): AgentControlSnapshot {
  const can = buildCan(currentState);
  if (!can[action]) {
    throw new Error(`invalid action '${action}' for state '${currentState}'`);
  }

  switch (action) {
    case "start":
      currentState = "running";
      break;
    case "pause":
      currentState = "paused";
      break;
    case "resume":
      currentState = "running";
      break;
    case "stop":
      currentState = "stopped";
      break;
  }

  touch();
  return getAgentControlSnapshot();
}

export function __resetAgentControlForTest(state: AgentRunState = "idle"): void {
  currentState = state;
  touch();
}
