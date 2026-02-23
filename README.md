# OpenClaw-like Blueprint (AnythingLLM MVP)

這版改成更接近 OpenClaw 的技能風格：

- **action-based 介面**：每個 skill 都用明確 `action`
- **嚴格 schema**：`additionalProperties: false`
- **可觀測輸出**：統一 `ok/action/data(or error)/audit`
- **最小可重現流程**：plan → execute → report

## Skills

### 1) `ps_run_safe`
- action: `run`
- 只允許 `git/node/python/npm/pnpm`
- 擋掉高風險 token（`;`, `|`, `&`, `` ` `` 等）
- 回傳結構化執行結果（exitCode/stdout/stderr/duration）

### 2) `file_read_sandbox`
- action: `read_text`
- 僅允許讀取 `C:\agent_sandbox` 內檔案
- 支援 `maxBytes`

### 3) `file_write_sandbox`
- action: `write_text` / `append_text`
- 僅允許寫入 `C:\agent_sandbox` 內檔案
- 自動建目錄

### 4) `git_api`（可選）
- action: `get_user` / `list_issues` / `create_pull_request`
- 使用 `GITHUB_TOKEN`
- 限制 owner/repo 格式，避免任意 endpoint

## Flows

### `flows/BrowserTaskFlow.blueprint.json`
- LLM 先產生固定 JSON 計畫
- Browser tool 依步驟執行
- 用 `file_write_sandbox(action=write_text)` 存證據

### `flows/GitHubTaskFlow.blueprint.json`
- LLM 先產生 PR 計畫 JSON
- 透過 `git_api` 執行 `list_issues` + `create_pull_request`
- 用 `file_write_sandbox(action=write_text)` 記錄操作

## 建議落地順序

1. 先建立 `C:\agent_sandbox`
2. 先跑通 `file_write_sandbox`/`file_read_sandbox`
3. 再啟用 `ps_run_safe`
4. 再接 `git_api` 與 GitHub flow
5. 最後接 browser flow

## Debug 原則

- 一律看 logs，不靠感覺
- skill 輸出必須有 `ok/action/audit`
- flow 執行完要在 `C:\agent_sandbox\logs\*.json` 留痕

