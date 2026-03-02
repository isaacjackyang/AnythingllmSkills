import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RouteHandler } from "../lib/router.js";
import { json } from "../lib/router.js";
import { buildPublicError } from "../lib/errors.js";
const execFileAsync = promisify(execFile);
export function systemInitRoute(initScriptPath: string): string {
    return String(async (_req, res) => {
        try {
            const { stdout } = await execFileAsync(process.execPath, [initScriptPath], {
                cwd: process.cwd(),
                timeout: 120000,
                maxBuffer: 1024 * 1024 * 4,
            });
            const parsed = stdout ? JSON.parse(stdout) : { ok: false, error: "empty init output" };
            if (!parsed.ok)
                throw new Error(parsed.error || "init failed");
            json(res, 200, parsed);
        }
        catch (error) {
            const publicError = buildPublicError(error, "初始化失敗", "SYSTEM_INIT_FAILED");
            json(res, 500, { ok: false, error: publicError.message, error_code: publicError.code });
        }
    });
}
