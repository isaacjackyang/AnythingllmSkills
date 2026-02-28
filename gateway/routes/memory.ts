import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RouteHandler } from "../lib/router.js";
import { json, readBody, parseQuery } from "../lib/router.js";
import { buildPublicError } from "../lib/errors.js";
import { recordLearning, searchLearning } from "../core/memory/evolution.js";
import { getLdbArchitectureSnapshot } from "../core/memory/ldb_architecture.js";
import type { ResolveAgentContext } from "./types.js";

const execFileAsync = promisify(execFile);

export function memoryFilesRoute(memoryBrowseRoots: string[]): RouteHandler {
    return async (_req, res) => {
        try {
            const files = await listMemoryFiles(memoryBrowseRoots);
            json(res, 200, { ok: true, data: files });
        } catch {
            json(res, 500, { ok: false, error: "讀取記憶檔案清單失敗" });
        }
    };
}

export function memoryFileRoute(memoryBrowseRoots: string[], memoryRootFile: string, maxReadBytes: number): RouteHandler {
    return async (req, res) => {
        try {
            const requestUrl = new URL(req.url ?? "/", "http://localhost");
            const target = String(requestUrl.searchParams.get("path") ?? "").trim();
            if (!target) throw new Error("path is required");
            const resolvedPath = resolveMemoryPath(target, memoryBrowseRoots, memoryRootFile);
            const content = await readFile(resolvedPath, "utf8");
            const truncated = content.length > maxReadBytes;
            const safeContent = truncated ? content.slice(0, maxReadBytes) : content;
            json(res, 200, { ok: true, data: { path: toRepoRelativePath(resolvedPath), content: safeContent, truncated } });
        } catch (error) {
            const publicError = buildPublicError(error, "讀取記憶檔案失敗", "MEMORY_FILE_READ_FAILED");
            json(res, 400, { ok: false, error: publicError.message, error_code: publicError.code });
        }
    };
}

export function memorySearchRoute(): RouteHandler {
    return async (req, res) => {
        try {
            const requestUrl = new URL(req.url ?? "/", "http://localhost");
            const query = String(requestUrl.searchParams.get("q") ?? "").trim();
            const limit = Number(requestUrl.searchParams.get("limit") ?? 20);
            if (!query) throw new Error("q is required");
            const result = await searchLearning(query, limit);
            json(res, 200, { ok: true, data: result.items, warning: result.warning });
        } catch (error) {
            const publicError = buildPublicError(error, "LanceDB 搜尋失敗", "MEMORY_SEARCH_FAILED");
            json(res, 400, { ok: false, error: publicError.message, error_code: publicError.code });
        }
    };
}

export function memoryLearnRoute(resolveAgentContext: ResolveAgentContext, workspace: string, maxBodyBytes: number): RouteHandler {
    return async (req, res) => {
        try {
            const raw = await readBody(req, maxBodyBytes);
            const payload = raw ? JSON.parse(raw) : {};
            const context = await resolveAgentContext(typeof payload.agent_id === "string" ? payload.agent_id : undefined);
            const scope = String(payload.scope ?? `${workspace}:${context.agent_name}`).trim();
            const kind = String(payload.kind ?? "methodology").trim() as "pitfall" | "methodology" | "decision";
            const title = String(payload.title ?? "manual learning").trim();
            const summary = String(payload.summary ?? "").trim();
            const details = (payload.details && typeof payload.details === "object") ? payload.details : {};
            if (!summary) throw new Error("summary is required");
            if (!["pitfall", "methodology", "decision"].includes(kind)) throw new Error("invalid learning kind");
            const result = await recordLearning({ scope, kind, title, summary, details, memory_namespace: context.memory_namespace });
            json(res, 200, { ok: true, data: result });
        } catch (error) {
            const publicError = buildPublicError(error, "記憶寫入失敗", "MEMORY_WRITE_FAILED");
            json(res, 400, { ok: false, error: publicError.message, error_code: publicError.code });
        }
    };
}

export function memoryArchitectureRoute(): RouteHandler {
    return async (_req, res) => {
        json(res, 200, { ok: true, data: getLdbArchitectureSnapshot() });
    };
}

export function memoryWorkflowsListRoute(workflowScriptPath: string): RouteHandler {
    return async (_req, res) => {
        json(res, 200, {
            ok: true,
            data: { jobs: ["microsync", "daily-wrapup", "weekly-compound"], script: toRepoRelativePath(workflowScriptPath) },
        });
    };
}

export function memoryWorkflowsRunRoute(workflowScriptPath: string, maxBodyBytes: number): RouteHandler {
    return async (req, res) => {
        try {
            const raw = await readBody(req, maxBodyBytes);
            const payload = raw ? JSON.parse(raw) : {};
            const job = String(payload.job ?? "").trim();
            const date = String(payload.date ?? "").trim();
            const dryRun = Boolean(payload.dryRun);
            if (!["microsync", "daily-wrapup", "weekly-compound"].includes(job)) {
                throw new Error("invalid workflow job");
            }
            const args = [workflowScriptPath, "run", job];
            if (date) args.push("--date", date);
            if (dryRun) args.push("--dry-run");
            const { stdout } = await execFileAsync(process.execPath, args, { cwd: process.cwd(), timeout: 20_000, maxBuffer: 1024 * 1024 });
            const parsed = stdout ? JSON.parse(stdout) : { ok: false, error: "empty workflow output" };
            if (!parsed.ok) throw new Error(parsed.error || "workflow execution failed");
            json(res, 200, { ok: true, data: parsed.data });
        } catch (error) {
            const publicError = buildPublicError(error, "固定工作流程執行失敗", "MEMORY_WORKFLOW_FAILED");
            json(res, 400, { ok: false, error: publicError.message, error_code: publicError.code });
        }
    };
}

/* ── helpers ────────────────────────────────────────── */

async function listMemoryFiles(roots: string[]): Promise<Array<{ path: string; size: number; updated_at: string }>> {
    const files: Array<{ path: string; size: number; updated_at: string }> = [];
    for (const root of roots) {
        await walkMemoryDir(root, files);
    }
    return files;
}

async function walkMemoryDir(dirPath: string, files: Array<{ path: string; size: number; updated_at: string }>): Promise<void> {
    let entries;
    try {
        entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        const full = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            await walkMemoryDir(full, files);
        } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".json"))) {
            try {
                const info = await stat(full);
                files.push({ path: toRepoRelativePath(full), size: info.size, updated_at: info.mtime.toISOString() });
            } catch { /* skip */ }
        }
    }
}

function resolveMemoryPath(relativePath: string, roots: string[], rootFile: string): string {
    if (relativePath === "MEMORY.md" || relativePath === "./MEMORY.md") return rootFile;
    const normalised = path.normalize(relativePath).replace(/\\/g, "/");
    if (normalised.includes("..")) throw new Error("path traversal denied");
    for (const root of roots) {
        const candidate = path.resolve(root, "..", normalised);
        if (candidate.startsWith(root) || candidate === rootFile) return candidate;
    }
    throw new Error("path outside allowed memory roots");
}

function toRepoRelativePath(fullPath: string): string {
    return path.relative(process.cwd(), fullPath).replace(/\\/g, "/");
}
