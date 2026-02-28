import type { RouteHandler } from "../lib/router.js";
import { json, readBody } from "../lib/router.js";
import { decidePendingAction, getPendingActionById, listPendingActions } from "../core/approvals_store.js";
import { executeApprovedAction } from "../core/router.js";

export function listApprovalsRoute(): RouteHandler {
    return async (req, res) => {
        try {
            const url = new URL(req.url ?? "/", "http://localhost");
            const status = url.searchParams.get("status") ?? undefined;
            const type = url.searchParams.get("type") ?? undefined;
            const limit = Number(url.searchParams.get("limit") ?? 50);
            const data = await listPendingActions({
                status: status as "pending" | "approved" | "rejected" | "executed" | "expired" | undefined,
                type: type as "approval" | "confirm" | undefined,
                limit,
            });
            json(res, 200, { ok: true, data });
        } catch (error) {
            json(res, 400, { ok: false, error: (error as Error).message });
        }
    };
}

export function decideApprovalRoute(maxBodyBytes: number): RouteHandler {
    return async (req, res, params) => {
        try {
            const actionId = params.id;
            const decision = params.decision as "approve" | "reject";
            if (!["approve", "reject"].includes(decision)) throw new Error("invalid decision");

            const raw = await readBody(req, maxBodyBytes);
            const payload = raw ? JSON.parse(raw) : {};
            const actorId = String(payload.actor_id ?? "approval-ui").trim();
            const reason = typeof payload.reason === "string" ? payload.reason : undefined;

            const decided = await decidePendingAction(actionId, actorId, decision, reason);
            if (decision === "reject") {
                json(res, 200, { ok: true, data: decided });
                return;
            }

            const fresh = await getPendingActionById(actionId);
            if (!fresh) throw new Error("pending action not found after approval");

            if (fresh.requires_confirm_token) {
                json(res, 200, {
                    ok: true,
                    data: fresh,
                    next_step: "confirm_token_required",
                    confirm_token: fresh.confirm_token,
                });
                return;
            }

            const execution = await executeApprovedAction(fresh);
            json(res, 200, { ok: true, data: decided, execution });
        } catch (error) {
            json(res, 400, { ok: false, error: (error as Error).message });
        }
    };
}
