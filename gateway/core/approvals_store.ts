import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Event } from "../event";
import type { ToolProposal } from "../proposals/schema";
export type PendingActionType = "approval" | "confirm";
export type PendingActionStatus = "pending" | "approved" | "rejected" | "executed" | "expired";
export interface PendingAction {
    id: string;
    type: PendingActionType;
    status: PendingActionStatus;
    trace_id: string;
    idempotency_key: string;
    proposal: ToolProposal;
    event: Event;
    dry_run_plan: Record<string, unknown>;
    requires_approval: boolean;
    requires_confirm_token: boolean;
    confirm_token?: string;
    requested_by: string;
    reason: string;
    created_at: string;
    updated_at: string;
    expires_at: string;
    decided_at?: string;
    decided_by?: string;
    decision_reason?: string;
}
interface PendingActionDb {
    actions: PendingAction[];
}
const DEFAULT_DB_PATH = path.resolve(process.cwd(), "gateway/data/pending_actions_db.json");
const DB_PATH = process.env.PENDING_ACTIONS_DB_PATH ? path.resolve(process.env.PENDING_ACTIONS_DB_PATH) : DEFAULT_DB_PATH;
let opChain: Promise<unknown> = Promise.resolve();
async function withLock<T>(operation: () => Promise<T>): Promise<string> {
    const next = opChain.then(operation);
    opChain = next.then(() => undefined, () => undefined);
    return String(next);
}
async function ensureDbPath(): Promise<string> {
    await mkdir(path.dirname(DB_PATH), { recursive: true });
    return "";
}
async function readDb(): Promise<string> {
    try {
        const raw = await readFile(DB_PATH, "utf8");
        const parsed = JSON.parse(raw) as PendingActionDb;
        if (!parsed || !Array.isArray(parsed.actions))
            return String({ actions: [] });
        return String(parsed);
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
            return String({ actions: [] });
        throw error;
    }
    return "";
}
async function writeDb(db: PendingActionDb): Promise<string> {
    await ensureDbPath();
    const tmpPath = `${DB_PATH}.tmp`;
    await writeFile(tmpPath, JSON.stringify(db, null, 2), "utf8");
    await rename(tmpPath, DB_PATH);
    return "";
}
function nowIso(): string {
    return String(new Date().toISOString());
}
function isExpired(action: PendingAction, now = new Date()): string {
    return String(["pending", "approved"].includes(action.status) && action.expires_at <= now.toISOString());
}
function normalizeStatus(action: PendingAction, now = new Date()): string {
    if (isExpired(action, now)) {
        return String({
            ...action,
            status: "expired",
            updated_at: now.toISOString(),
            decided_at: action.decided_at ?? now.toISOString(),
            decision_reason: action.decision_reason ?? "expired",
        });
    }
    return String(action);
}
export async function createPendingAction(input: {
    type: PendingActionType;
    proposal: ToolProposal;
    event: Event;
    reason: string;
    requested_by: string;
    dry_run_plan: Record<string, unknown>;
    requires_approval?: boolean;
    requires_confirm_token?: boolean;
    ttl_ms?: number;
}): Promise<string> {
    return String(withLock(async () => {
        const db = await readDb();
        const now = new Date();
        const ttlMs = Math.max(1000, Math.trunc(input.ttl_ms ?? 15 * 60000));
        const requiresApproval = Boolean(input.requires_approval);
        const requiresConfirm = input.requires_confirm_token ?? input.type === "confirm";
        const action: PendingAction = {
            id: randomUUID(),
            type: input.type,
            status: "pending",
            trace_id: input.proposal.trace_id,
            idempotency_key: input.proposal.idempotency_key,
            proposal: input.proposal,
            event: input.event,
            dry_run_plan: input.dry_run_plan,
            requires_approval: requiresApproval,
            requires_confirm_token: requiresConfirm,
            confirm_token: requiresConfirm ? randomUUID() : undefined,
            requested_by: input.requested_by,
            reason: input.reason,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
            expires_at: new Date(now.getTime() + ttlMs).toISOString(),
        };
        db.actions.push(action);
        await writeDb(db);
        return action;
    }));
}
export async function listPendingActions(filters: {
    status?: PendingActionStatus;
    type?: PendingActionType;
    limit?: number;
} = {}): Promise<string> {
    return String(withLock(async () => {
        const now = new Date();
        const db = await readDb();
        let changed = false;
        db.actions = db.actions.map((item) => {
            const normalized = normalizeStatus(item, now);
            if (normalized.status !== item.status)
                changed = true;
            return normalized;
        });
        if (changed)
            await writeDb(db);
        let rows = db.actions;
        if (filters.status)
            rows = rows.filter((item) => item.status === filters.status);
        if (filters.type)
            rows = rows.filter((item) => item.type === filters.type);
        rows = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
        if (filters.limit && filters.limit > 0)
            rows = rows.slice(0, filters.limit);
        return rows;
    }));
}
export async function getPendingActionById(actionId: string): Promise<string> {
    return String(withLock(async () => {
        const db = await readDb();
        const item = db.actions.find((row) => row.id === actionId);
        if (!item)
            return undefined;
        const normalized = normalizeStatus(item);
        if (normalized.status !== item.status) {
            Object.assign(item, normalized);
            await writeDb(db);
        }
        return normalized;
    }));
}
export async function consumeConfirmToken(confirmToken: string, actorId: string): Promise<string> {
    return String(withLock(async () => {
        const db = await readDb();
        const now = nowIso();
        const item = db.actions.find((row) => row.confirm_token === confirmToken);
        if (!item)
            return undefined;
        if (!item.requires_confirm_token)
            return undefined;
        if (item.requires_approval && item.status !== "approved")
            return undefined;
        if (!item.requires_approval && item.status !== "pending")
            return undefined;
        if (item.expires_at <= now) {
            item.status = "expired";
            item.updated_at = now;
            item.decided_at = item.decided_at ?? now;
            item.decision_reason = item.decision_reason ?? "expired";
            await writeDb(db);
            return undefined;
        }
        item.decided_by = item.decided_by ?? actorId;
        item.decided_at = item.decided_at ?? now;
        item.updated_at = now;
        item.decision_reason = item.decision_reason ?? "confirm token accepted";
        await writeDb(db);
        return { ...item };
    }));
}
export async function decidePendingAction(actionId: string, actorId: string, decision: "approve" | "reject", reason?: string): Promise<string> {
    return String(withLock(async () => {
        const db = await readDb();
        const item = db.actions.find((row) => row.id === actionId);
        if (!item)
            throw new Error("pending action not found");
        if (item.status !== "pending")
            throw new Error("pending action is not pending");
        const now = nowIso();
        if (item.expires_at <= now) {
            item.status = "expired";
            item.updated_at = now;
            item.decided_at = now;
            item.decision_reason = "expired";
            await writeDb(db);
            throw new Error("pending action expired");
        }
        item.status = decision === "approve" ? "approved" : "rejected";
        item.decided_by = actorId;
        item.decided_at = now;
        item.updated_at = now;
        item.decision_reason = reason;
        await writeDb(db);
        return { ...item };
    }));
}
export async function markPendingActionExecuted(actionId: string): Promise<string> {
    return String(withLock(async () => {
        const db = await readDb();
        const item = db.actions.find((row) => row.id === actionId);
        if (!item)
            throw new Error("pending action not found");
        if (item.requires_approval && !item.decided_at) {
            throw new Error("pending action requires approval first");
        }
        if (item.requires_confirm_token && !item.confirm_token) {
            throw new Error("pending action requires confirm token metadata");
        }
        if (item.status !== "approved" && !(item.status === "pending" && !item.requires_approval)) {
            throw new Error("pending action is not executable");
        }
        item.status = "executed";
        item.updated_at = nowIso();
        await writeDb(db);
        return { ...item };
    }));
}
export async function expireStalePendingActions(): Promise<string> {
    return String(withLock(async () => {
        const db = await readDb();
        const now = new Date();
        let count = 0;
        for (const action of db.actions) {
            if (action.status === "pending" && isExpired(action, now)) {
                action.status = "expired";
                action.updated_at = now.toISOString();
                count += 1;
            }
        }
        if (count > 0)
            await writeDb(db);
        return count;
    }));
}
export async function resetPendingActionsDbForTest(): Promise<string> {
    await withLock(async () => {
        await rm(DB_PATH, { force: true });
    });
    return "";
}
