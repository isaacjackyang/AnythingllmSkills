import path from "node:path";
import { spawn } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

function normalizeWindowsPath(inputPath: string): string {
  return path.win32.normalize(path.resolve(inputPath));
}

function trimTrailingSeparators(inputPath: string): string {
  const parsed = path.win32.parse(inputPath);
  if (inputPath === parsed.root) {
    return inputPath;
  }

  return inputPath.replace(/[\\/]+$/, "");
}

function toComparablePath(inputPath: string): string {
  return trimTrailingSeparators(normalizeWindowsPath(inputPath)).toLowerCase();
}

function assertWithinRoots(targetPath: string, allowRoots: string[]): string {
  const resolvedTarget = normalizeWindowsPath(targetPath);
  const comparableTarget = toComparablePath(targetPath);

  const allowed = allowRoots.some((root) => {
    const comparableRoot = toComparablePath(root);
    return (
      comparableTarget === comparableRoot ||
      comparableTarget.startsWith(`${comparableRoot}${path.win32.sep}`)
    );
  });

  if (!allowed) {
    throw new Error(
      `Path not allowed. target="${resolvedTarget}" allowRoots=${JSON.stringify(allowRoots)}`,
    );
  }

  return resolvedTarget;
}

async function openInExplorerSelect(targetPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("explorer.exe", ["/select,", targetPath], {
      shell: false,
      stdio: "ignore",
      windowsHide: false,
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`explorer.exe exited with code=${code}`));
    });
  });
}

async function main(): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("open-in-explorer is Windows-only (requires explorer.exe).");
  }

  const cliRoots = process.argv.slice(2);
  const envRoots = (process.env.OPEN_IN_EXPLORER_ALLOW_ROOTS ?? "")
    .split(";")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  const allowRoots = [...cliRoots, ...envRoots];
  if (allowRoots.length < 1) {
    throw new Error(
      "Usage: node dist/index.js <allowRoot1> [allowRoot2 ...] OR set OPEN_IN_EXPLORER_ALLOW_ROOTS=C:\\a;D:\\b",
    );
  }

  const server = new McpServer({
    name: "open-in-explorer",
    version: "0.1.0",
  });

  server.tool(
    "open_in_explorer",
    "Open Windows Explorer and select a file or folder path. This tool only supports allowlisted roots.",
    {
      path: z.string().min(1).describe("Windows file/folder path to select in Explorer."),
    },
    async ({ path: rawPath }) => {
      const safePath = assertWithinRoots(rawPath, allowRoots);
      await openInExplorerSelect(safePath);

      return {
        content: [
          {
            type: "text",
            text: `OK: opened Explorer and selected: ${safePath}`,
          },
        ],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`open-in-explorer MCP server ready. allowRoots=${JSON.stringify(allowRoots)}`);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
