# AnythingLLM Skills 專案總說明（新手超詳細版）

> 這份文件是給「第一次接觸這個專案的人」。
> 如果你只想知道一句話：**這個 repo 是一套把聊天機器人、風險控管、工具呼叫、審批流程串在一起的工程骨架**。

---

## 1. 這個專案到底在做什麼？

你可以把它想成一條「訊息處理生產線」：

1. 使用者從外部通道（例如 Telegram）丟一句話進來。
2. Gateway 收到後，先做解析與風險判斷。
3. Gateway 會找 AnythingLLM（Brain）產生 Proposal（建議執行方案）。
4. Policy 決定這個 Proposal 能不能執行、要不要人工審批。
5. Tool Runner 真的去做工具呼叫（例如 shell、HTTP、資料庫、排程）。
6. 結果回傳給 AnythingLLM 生成自然語言回覆。
7. 最後再從通道回給使用者。

如果你是非工程背景，請記住：
- **AnythingLLM** = 思考與回覆（腦）
- **Gateway** = 流程管理與守門（神經系統）
- **Skills/Tools** = 真正做事的手腳（執行端）

---

## 2. 專案主要資料夾（你最常看的）

- `gateway/`：流程主控（連接器、路由、政策、審計、工具執行）
- `anythingllm/`：Brain 側的掛載骨架（workspaces / agents / skills）
- `anythingllm-skills/`：實際技能（Skill）範本與實作
- `mcp-open-in-explorer/`：一個 MCP server 範例（只負責打開檔案總管定位檔案）

---

## 3. 先決條件（先確認，不然後面一定卡）

請先準備：

- Node.js `>= 20`（建議 LTS）
- npm / npx
- 可用的 AnythingLLM 實例
- （若走 Telegram）可用的 bot token 與 webhook HTTPS 網址

檢查指令：

```powershell
node -v
npm -v
npx -v
```

如果版本太舊，先升級再繼續，不要硬跑。

---

## 4. 一鍵初始化（建議第一次都跑）

本 repo 內建腳本：

```powershell
.\scripts\bootstrap_gateway.ps1
```

它會做幾件事：

- 檢查 Node.js / npm / npx 是否存在
- 初始化 `package.json`（若不存在）
- 安裝本地開發依賴（TypeScript/tsx）
- 產生 `.env.gateway` 範本（已存在就不覆蓋）
- 驗證 `tsc` 與 `tsx` 可執行

如果你只是想看環境變數模板：

```powershell
.\scripts\bootstrap_gateway.ps1 -PrintEnv
```

如果你公司網路限制 npm 安裝：

```powershell
.\scripts\bootstrap_gateway.ps1 -SkipTooling
```

---

## 5. 啟動 Gateway（最小路徑）

```powershell
.\scripts\start_gateway.ps1
```

如果想啟動後直接打開 Approval UI：

```powershell
.\scripts\start_gateway.ps1 -OpenUi
```

啟動後，先做健康檢查：

```powershell
Invoke-RestMethod http://localhost:8787/healthz
Invoke-RestMethod http://localhost:8787/lifecycle
```

如果第一個就不通，先不要看 Telegram、不要看 Skill。先把 Gateway 本身跑起來。

---

## 6. Skill 開發規範（重點）

目前採用 **Single Binary CLI First**：

- Skill 專注在「輸入驗證 + 路由」
- 有副作用的事（寫檔、跑命令、連 API）盡量集中到自有 CLI
- 避免臨時拼接 Python/JS 腳本
- 維持可審計、可重現、可追蹤

你可以把輸出想成固定契約，至少包含：

- `ok`
- `action`
- `data` 或 `error`
- `audit`

這樣未來要 debug 才不會靠猜。

---

## 7. 推薦落地順序（照這個做，成功率最高）

1. 先確認 `gateway/server.ts` 可啟動。
2. 先用健康檢查 API 驗證 Gateway 活著。
3. 再串 AnythingLLM API（確認 token 與 endpoint）。
4. 再啟用單一 Skill（先最安全的讀/寫檔）。
5. 再加高風險能力（例如 shell command）。
6. 最後再接外部通道（Telegram/LINE/Web UI）與審批流程。

不要一口氣全上，會很難定位錯誤來源。

---

## 8. 除錯心法（給新手）

遇到問題時請依序檢查：

1. **程序有沒有啟動？**（server process）
2. **埠有沒有在聽？**（預設 8787）
3. **健康檢查是否 200？**
4. **環境變數是否真的載入？**（不要只編輯不 `source`）
5. **日誌有沒有 trace_id / audit？**
6. **外部服務 token 是否可用？**

原則：
- 先確定基礎可用，再看業務邏輯。
- 先看 logs，再改程式。
- 一次只改一件事。

---

## 9. 常見問題（FAQ）

### Q1：我什麼都設了，但還是不能用？
通常是 `.env` 沒載入到目前 shell。請重新載入後再啟動。

### Q2：為什麼有 Proposal / Policy / Approval 這麼多層？
因為這是把「能做」和「該不該做」分離，降低誤操作風險。

### Q3：我可以直接讓模型執行 shell 嗎？
技術上可以，但不建議。請先做 action allowlist、參數驗證、審計留痕。

---

## 10. 下一步該看哪裡？

- 想跑 Gateway：看 `gateway/README.md`
- 想做 Approval UI：看 `gateway/web/approval_ui/README.md`
- 想做 Skill：看 `anythingllm-skills/local-file-search-open/README.md`
- 想用 MCP Explorer：看 `mcp-open-in-explorer/README.md`（包含白名單/路徑設定位置說明）
- 想了解 Brain 掛載：看 `anythingllm/README.md`

---

## 11. 一句總結

如果你照這份 README 從「先啟動 Gateway」開始，逐步把能力一個一個接上，
你會得到一個 **可控、可審計、可擴充** 的 AnythingLLM 自動化系統，而不是一個「能跑但不敢上線」的黑盒子。
