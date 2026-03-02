import type { RouteHandler } from "../lib/router.js";
import { json, readBody } from "../lib/router.js";
import { validateRunOnceInput } from "../schemas/control_plane.js";
import { cancelTask, deleteTask, getTaskById, listTasks } from "../core/tasks/store.js";
import { runQueuedJobsOnce } from "../workers/job_runner.js";
import type { TaskStatus } from "../core/tasks/store.js";

export function listTasksRoute(): RouteHandler {
    return async (req, res) => {
        try {
            const requestUrl = new URL(req.url ?? "/", "http://localhost");
            const statusParam = requestUrl.searchParams.get("status") ?? undefined;
            const limitParam = requestUrl.searchParams.get("limit");
            const limit = limitParam ? Number(limitParam) : undefined;
            const agentId = requestUrl.searchParams.get("agent_id") ?? undefined;
            const tasks = await listTasks({ status: statusParam as TaskStatus | undefined, limit, agent_id: agentId });
            json(res, 200, { ok: true, data: tasks });
        } catch (error) {
            json(res, 400, { ok: false, error: (error as Error).message });
        }
    };
}

export function getTaskRoute(): RouteHandler {
    return async (_req, res, params) => {
        try {
            const task = await getTaskById(params.id);
            if (!task) {
                json(res, 404, { ok: false, error: "task not found" });
                return;
            }
            json(res, 200, { ok: true, data: task });
        } catch (error) {
            json(res, 400, { ok: false, error: (error as Error).message });
        }
    };
}

export function cancelTaskRoute(): RouteHandler {
    return async (_req, res, params) => {
        try {
            const cancelled = await cancelTask(params.id);
            json(res, 200, { ok: true, data: cancelled });
        } catch (error) {
            json(res, 400, { ok: false, error: (error as Error).message });
        }
    };
}

export function deleteTaskRoute(): RouteHandler {
    return async (_req, res, params) => {
        try {
            const deleted = await deleteTask(params.id);
            json(res, deleted ? 200 : 404, { ok: deleted });
        } catch (error) {
            json(res, 400, { ok: false, error: (error as Error).message });
        }
    };
}

export function runOnceRoute(): RouteHandler {
    return async (req, res) => {
        try {
            const raw = await readBody(req, 64 * 1024);
            const parsed = raw ? JSON.parse(raw) : {};
            const validated = validateRunOnceInput(parsed);
            if (!validated.ok) throw new Error(validated.error);
            await runQueuedJobsOnce();
            json(res, 200, { ok: true });
        } catch (error) {
            json(res, 500, { ok: false, error: (error as Error).message });
        }
    };
}
