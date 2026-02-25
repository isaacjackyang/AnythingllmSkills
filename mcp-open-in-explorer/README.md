# open-in-explorer MCP server (Windows only)

A minimal MCP server that exposes **one tool only**:

- `open_in_explorer({ path })`

Behavior:
- Validates `path` is inside one of the allowlisted roots.
- Calls `explorer.exe /select, <path>` with `spawn(..., { shell: false })`.
- Does **not** provide file read/write/search capabilities.

## Install & build

```bash
cd mcp-open-in-explorer
npm install
npm run build
```

## Run locally

```bash
node dist/index.js C:\agent_sandbox
```

## AnythingLLM MCP config sample

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

> Note: this server must run on Windows Desktop where `explorer.exe` is available.
