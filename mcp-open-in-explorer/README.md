# open-in-explorer MCP server (Windows only)

A minimal MCP server that exposes **one tool only**:

- `open_in_explorer({ path })`

Behavior:
- Validates `path` is inside one of the allowlisted roots.
- Calls `explorer.exe /select, <path>` with `spawn(..., { shell: false })`.
- Does **not** provide file read/write/search capabilities.

---

## 1) Prerequisites

- OS: **Windows 10/11 Desktop** (must have `explorer.exe`).
- Runtime: **Node.js 18+** (recommended 20 LTS).
- Package manager: `npm` (ships with Node.js).
- Permission model: decide one or more allowlisted root folders in advance (for example `C:\agent_sandbox`).

Quick check:

```powershell
node -v
npm -v
where explorer
```

---

## 2) Source build (compile TypeScript)

```powershell
cd mcp-open-in-explorer
npm install
npm run build
```

Expected output:
- Compiled entry file: `dist/index.js`

Build a distributable Windows x64 executable:

```powershell
# from mcp-open-in-explorer
npm run package:win-x64
```

Expected output:
- `dist/mcp-open-in-explorer-win-x64.exe`

Optional clean rebuild:

```powershell
# from mcp-open-in-explorer
if (Test-Path dist) { Remove-Item -Recurse -Force dist }
npm run build
```

---

## 3) Local run (manual)

Run with one allowlisted root:

```powershell
node dist/index.js C:\agent_sandbox
```

Run with multiple allowlisted roots:

```powershell
node dist/index.js C:\agent_sandbox D:\project_data E:\shared_workspace
```

> The process stays attached to the terminal. Keep this console open while testing.

---

## 4) AnythingLLM MCP integration

Example MCP config:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "C:\\agent_sandbox"
      ]
    },
    "open-in-explorer": {
      "command": "node",
      "args": [
        "C:\\agent_sandbox\\mcp-open-in-explorer\\dist\\index.js",
        "C:\\agent_sandbox"
      ]
    }
  }
}
```

Recommended pairing:
- Keep `filesystem` for actual file operations (read/write/search if you allow them).
- Keep `open-in-explorer` strictly for desktop reveal behavior (`explorer /select`).

---

## 5) Deployment options

### Option A: simplest (manual start)

- Open PowerShell on login.
- Run:

```powershell
node C:\agent_sandbox\mcp-open-in-explorer\dist\index.js C:\agent_sandbox
```

Use this for development or low-frequency internal usage.

### Option B: auto-start via Task Scheduler (recommended for desktop)

1. Build once (`npm run build`).
2. Open **Task Scheduler** → **Create Task**.
3. General:
   - Name: `mcp-open-in-explorer`
   - Run only when user is logged on (important for desktop explorer interaction).
4. Triggers:
   - At log on (your service account/user).
5. Actions:
   - Program/script: `node`
   - Add arguments:
     ```
     C:\agent_sandbox\mcp-open-in-explorer\dist\index.js C:\agent_sandbox
     ```
   - Start in:
     ```
     C:\agent_sandbox\mcp-open-in-explorer
     ```
6. Save and run once manually to verify.

### Option C: service wrapper (NSSM)

If your environment standardizes on Windows services, use NSSM to wrap Node process.

Example:

```powershell
nssm install mcp-open-in-explorer "C:\Program Files\nodejs\node.exe" "C:\agent_sandbox\mcp-open-in-explorer\dist\index.js C:\agent_sandbox"
nssm set mcp-open-in-explorer AppDirectory "C:\agent_sandbox\mcp-open-in-explorer"
nssm start mcp-open-in-explorer
```

> Note: if Explorer interaction is required in an interactive desktop session, Task Scheduler (logon scope) is usually more predictable than service-session execution.

### Option D: run packaged exe (Windows x64)

If you built `dist/mcp-open-in-explorer-win-x64.exe`, you can deploy without requiring Node.js on the target machine:

```powershell
C:\agent_sandbox\mcp-open-in-explorer\dist\mcp-open-in-explorer-win-x64.exe C:\agent_sandbox
```

MCP config example:

```json
{
  "mcpServers": {
    "open-in-explorer": {
      "command": "C:\\agent_sandbox\\mcp-open-in-explorer\\dist\\mcp-open-in-explorer-win-x64.exe",
      "args": ["C:\\agent_sandbox"]
    }
  }
}
```

Notes:
- This executable target is **Windows x64 only**.
- If the destination machine is Windows ARM64, build a separate ARM64 target.

---

## 6) Upgrade workflow

When updating code:

```powershell
cd C:\agent_sandbox\mcp-open-in-explorer
git pull
npm install
npm run build
```

Then restart your runner:
- Task Scheduler task: end and run again, or logoff/logon.
- NSSM service: `nssm restart mcp-open-in-explorer`.

---

## 7) Validation checklist

After deployment, verify:

1. MCP server process is alive.
2. AnythingLLM can discover the tool `open_in_explorer`.
3. Calling the tool with an allowed path opens File Explorer and selects the file/folder.
4. Calling the tool with a disallowed path is denied.

Suggested test paths:
- Allowed: `C:\agent_sandbox\logs\task.log`
- Disallowed: `C:\Windows\System32\drivers\etc\hosts`

---

## 8) Security notes

- Keep allowlisted roots as narrow as possible (principle of least privilege).
- Do not add sensitive system roots (`C:\`, `C:\Windows`, user profile root) unless absolutely required.
- This server is intentionally limited to reveal action only; avoid adding read/write operations here.

---

## 9) Troubleshooting

### `explorer.exe` does not open
- Confirm running on Windows Desktop session (not headless server core).
- Confirm user session is interactive.
- Run `where explorer` and direct command test:
  ```powershell
  explorer.exe /select,"C:\agent_sandbox"
  ```

### Tool not visible in AnythingLLM
- Check MCP config JSON escaping (`\\` in JSON paths).
- Verify executable path to `dist/index.js` is correct.
- Restart AnythingLLM or reconnect MCP servers.

### Build fails
- Check Node version (`node -v`, should be 18+).
- Delete `node_modules` and reinstall:
  ```powershell
  Remove-Item -Recurse -Force node_modules
  npm install
  npm run build
  ```

---

## 10) Quick start (copy/paste)

```powershell
cd C:\agent_sandbox\mcp-open-in-explorer
npm install
npm run build
node dist/index.js C:\agent_sandbox
```

Then wire this command into AnythingLLM MCP config and test with an allowed path.

> Note: this server must run on Windows Desktop where `explorer.exe` is available.
