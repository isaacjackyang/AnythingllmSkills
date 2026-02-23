# OpenClaw-like Blueprint (AnythingLLM MVP)

這個 repo 提供一套能落地的最小集合：

- 4 個 custom skills（安全 PowerShell、sandbox 讀寫、GitHub API）
- 2 個 Agent Flow blueprint（BrowserTaskFlow / GitHubTaskFlow）
- 一套先後順序（先可觀測性，再高互動能力）

## 目錄

- `anythingllm-skills/ps-run-safe`：`ps_run_safe`
- `anythingllm-skills/file-read-sandbox`：`file_read_sandbox`
- `anythingllm-skills/file-write-sandbox`：`file_write_sandbox`
- `anythingllm-skills/git-api`：`git_api`
- `flows/BrowserTaskFlow.blueprint.json`
- `flows/GitHubTaskFlow.blueprint.json`

## A. Skills（最小集合）

## 1) `ps_run_safe`
- 只允許程式：`git`, `node`, `python`, `npm`, `pnpm`
- 阻擋字元：`;`, `&`, `|`, `` ` ``, `>`, `<`
- 可設定 timeout 與 cwd
- 適合放在需要命令執行的 Agent 能力裡，避免直接開 unrestricted shell

## 2) `file_read_sandbox`
- 僅允許讀取 `C:\agent_sandbox` 底下檔案
- 有 `maxBytes` 上限，避免一次拉太大檔

## 3) `file_write_sandbox`
- 僅允許寫入 `C:\agent_sandbox` 底下檔案
- 自動建立子目錄
- 支援覆寫與 append

## 4) `git_api`（可選）
- 走 GitHub REST API
- token 集中在環境變數 `GITHUB_TOKEN`
- endpoint 白名單路徑前綴：`/repos`, `/issues`, `/user`, `/orgs`, `/search`

## B. Agent Flows（固定套路）

## Flow 1: BrowserTaskFlow

路徑：`flows/BrowserTaskFlow.blueprint.json`

固定模式：
1. `LLM Instruction`：拆步驟（goal/steps/evidence）
2. `MCP browser tool`：逐步執行
3. `file_write_sandbox`：寫 `logs/browser_task_result.json`

## Flow 2: GitHubTaskFlow

路徑：`flows/GitHubTaskFlow.blueprint.json`

固定模式：
1. `LLM Instruction`：產出 branch/commit/PR 計畫
2. `API Call`（透過 `git_api` skill）
   - 列 issues
   - 建 PR
3. `file_write_sandbox`：寫 `logs/github_task_result.json`

## 24 小時內建議順序（避免跳步）

1. 先建立 `C:\agent_sandbox`，所有檔案 I/O 先鎖這裡
2. 啟用 `ps_run_safe`，只開你真的需要的命令
3. 先跑通 GitHubTaskFlow（列 issue → 建 branch/PR）
4. 最後才接 BrowserTaskFlow（因為最容易變黑盒）

## Debug（重點是 logs，不是感覺）

當你遇到「skill 開了又被關」「flow 執行到一半失敗」：

1. 用 Windows PowerShell 直接啟動 AnythingLLM Desktop 並打 verbose logs
2. 先檢查 skill 載入錯誤（manifest / entrypoint / runtime）
3. 檢查 flow block I/O（上一個 block 輸出是否匹配下一個 block 模板）
4. 檢查 `C:\agent_sandbox\logs\*.json` 是否有完整執行證據

> 沒有 log，就不要判斷 agent 行為是否穩定。

## 快速驗證（建議）

1. 建立 sandbox：
   - `mkdir C:\agent_sandbox`
2. 測 `file_write_sandbox`：寫一個測試 JSON 到 `logs/test.json`
3. 測 `file_read_sandbox`：讀回 `logs/test.json`
4. 測 `ps_run_safe`：跑 `git status`（不可帶任何 shell 串接）
5. 測 `git_api`：先 `GET /user` 驗證 token，再做 repo API

