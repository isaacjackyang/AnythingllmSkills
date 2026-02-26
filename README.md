# AnythingLLM Skills 專案總說明（新手超詳細版）

> 這份文件是給「第一次接觸這個專案的人」。
> 如果你只想知道一句話：**這個 repo 是一套把聊天機器人、風險控管、工具呼叫、審批流程串在一起的工程骨架**。

---

## 1. 這個專案到底在做什麼？

你可以把它想成一條「訊息處理生產線」：

1. 使用者從外部通道（例如 Telegram / LINE / Web UI）丟一句話進來。
2. Gateway 收到後，先做事件整理與風險判斷。
3. Gateway 向 AnythingLLM（Brain）要求 Proposal（建議執行方案）。
4. Policy 決定 Proposal 允許 / 拒絕 / 需審批。
5. Tool Runner 實際執行工具（shell / HTTP / DB / queue job 等）。
6. 結果回傳給 AnythingLLM 生成自然語言。
7. 最後再從通道回給使用者。

如果你是非工程背景，請記住：
- **AnythingLLM** = 思考與回覆（腦）
- **Gateway** = 流程管理與守門（神經系統）
- **Skills/Tools** = 真正做事的手腳（執行端）

---

## 2. 專案主要資料夾（你最常看的）

- `gateway/`：流程主控（連接器、路由、政策、審計、工具執行）
- `anythingllm/`：Brain 側掛載骨架（workspaces / agents / skills）
- `anythingllm-skills/`：實際技能（Skill）範本與實作
- `mcp-open-in-explorer/`：MCP server 範例（本機檔案定位）

---

## 3. 先決條件（先確認，不然後面一定卡）

請先準備：

- Node.js `>= 20`
- npm / npx
- 可用的 AnythingLLM 實例（含 API Key）
- （若走 Telegram）可用 bot token 與可公開 HTTPS webhook

檢查指令：

```powershell
node -v
npm -v
npx -v
```

---

## 4. 初始化（建議第一次必跑）

```powershell
.\scripts\bootstrap_gateway.ps1
```

這個腳本會：

- 檢查 `node / npm / npx`
- 若不存在則建立 `package.json`
- 安裝開發依賴（`typescript` / `tsx` / `@types/node`）
- 產生 `.env.gateway`（已存在不覆蓋）
- 產生 `scripts/start_gateway.ps1`（已存在不覆蓋）

只看 env 範本：

```powershell
.\scripts\bootstrap_gateway.ps1 -PrintEnv
```

公司網路限制安裝時：

```powershell
.\scripts\bootstrap_gateway.ps1 -SkipTooling
```

---

## 5. 快速檢查與修復（新增）

如果你遇到「已填 key 但啟動失敗 / Web 通道不通」：

```powershell
.\check_and_fix_gateway.ps1
```

它會做什麼：

1. 列出需求掃描結果（`OK` / `MISSING`）
   - `node` / `npm` / `npx`
   - `scripts/bootstrap_gateway.ps1`
   - `.env.gateway`
   - `scripts/start_gateway.ps1`
   - `gateway/web/approval_ui/index.html`
2. 缺檔時自動呼叫 bootstrap 補齊（可用 `-ForceBootstrap` 強制）
3. 檢查 `.env.gateway` 的 `ANYTHINGLLM_API_KEY` / `ANYTHINGLLM_BASE_URL`
4. 檢查 `npx tsx` 是否可執行
5. 可選：自動啟動 gateway 並檢查 `/healthz`

常用參數：

```powershell
# 只掃描/修復，不啟動
.\check_and_fix_gateway.ps1 -NoStart

# 強制重跑 bootstrap 產物
.\check_and_fix_gateway.ps1 -ForceBootstrap

# 略過 bootstrap 依賴安裝
.\check_and_fix_gateway.ps1 -SkipTooling
```

---

## 6. 啟動 Gateway（正式流程）

```powershell
.\scripts\start_gateway.ps1
```

目前 `start_gateway.ps1` 行為：

1. 載入 `.env.gateway`
2. 背景啟動 `npx tsx gateway/server.ts`
3. 輪詢 `http://localhost:8787/healthz`（預設等待 20 秒）
4. 健康檢查後再嘗試開啟 Approval UI：
   - 先開 `http://localhost:8787/approval-ui`
   - 若失敗，退回開本地 `gateway/web/approval_ui/index.html`
5. 最後等待 gateway process 結束

不自動開 UI：

```powershell
.\scripts\start_gateway.ps1 -NoOpenUi
```

手動健康檢查：

```powershell
Invoke-RestMethod http://localhost:8787/healthz
Invoke-RestMethod http://localhost:8787/lifecycle
```

---

## 7. Web 通道為何最先測？

Web 通道通常最容易先打通，因為不需要 webhook 簽章與外部平台設定。

最小驗證：

1. `healthz` 正常
2. 開 `/approval-ui`
3. 測試 `POST /api/agent/command`

若第 1 步失敗，請先修 Gateway 啟動，不要直接追 Telegram/LINE。

---

## 8. 推薦落地順序（照這個做成功率高）

1. 先確認 `gateway/server.ts` 可啟動
2. 先驗證 `healthz` / `lifecycle`
3. 再確認 AnythingLLM base URL + API key
4. 再開 Web UI command path
5. 最後才接 Telegram / LINE webhook

---

## 9. 常見問題（FAQ）

### Q1：我填了 key 還是失敗？
常見是 `.env.gateway` 沒被載入、`ANYTHINGLLM_BASE_URL` 不對，或 `tsx` 其實沒法執行（公司 registry / proxy 封鎖）。

### Q2：為什麼 start script 顯示有開 UI 但看不到？
新版會先等健康檢查，再開 URL；若 URL 無法開，會 fallback 開本地 HTML。請看啟動輸出的 warning 判斷是哪一段失敗。

### Q3：Web 通道會不會也被「停用」？
會。若 `web_ui` channel disabled，`/api/agent/command` 會回 `503`。

---

## 10. 下一步該看哪裡？

- 想跑 Gateway：看 `gateway/README.md`
- 想看 Approval UI：看 `gateway/web/approval_ui/README.md`
- 想做 Skill：看 `anythingllm-skills/local-file-search-open/README.md`
- 想用 MCP Explorer：看 `mcp-open-in-explorer/README.md`
- 想了解 Brain 掛載：看 `anythingllm/README.md`

---

## 11. 一句總結

請先把「Gateway 啟動 + healthz + Web 通道」打通，再往外擴展。
這樣會得到一個 **可控、可審計、可擴充** 的系統，而不是難以定位問題的黑盒。
