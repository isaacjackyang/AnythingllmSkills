# Approval UI（Gateway 控制台）說明

## 文件維護狀態（2026-02-28）

- 已完成文件巡檢：本檔內容已依目前專案結構重新確認。
- 建議每次合併程式變更後，同步更新本檔中「啟動、驗證、限制」三類資訊。
- 本次檢查環境受 registry 權限限制，未能完成 `npm install` 與 TypeScript 測試依賴安裝；需在可存取 npm registry 的環境重跑完整測試。

---

> 這個 UI 是 Gateway 附帶的「控制面板 + 測試前台」，不是完整產品前端。

---

## 1) 這個 UI 實際用途

目前 `index.html` 主要負責：

- 顯示 Gateway 存活狀態（health/lifecycle）
- 管理 Agent 控制狀態（start/pause/resume/stop）
- 管理 channel enable/disable
- 發送 web command 到 `/api/agent/command`
- 可在 UI 直接開啟記憶檔：`/api/memory/files` + `/api/memory/file`
- 可在 UI 一鍵執行固定記憶流程：`/api/memory/workflows/run`（microSync / daily-wrapup / weekly-compound）
- 提供路徑選擇：`經 AnythingLLM` 或 `直連 Ollama（gpt-oss）`
- 依 `/api/inference/routes` 自動顯示可用路徑（例如未設定 AnythingLLM API Key 時會自動切到 Ollama）
- API 資料流拓樸會依目前選擇的路徑高亮，避免「假連線」視覺誤導
- 呈現簡化的操作輸出區，方便快速驗證流程

你可以把它當「運維與驗證工具頁」。

---

## 2) 它不是什麼

- 不是 AnythingLLM 官方聊天 UI
- 不是完整工單/審核平台
- 不是多租戶管理後台

---

## 3) 載入方式

### A. 走 Gateway route（建議）

`http://localhost:8787/approval-ui`

優點：
- 與後端同源，少掉本地檔案跨域問題
- 最接近實際部署行為

### B. 本地檔案 fallback

`gateway/web/approval_ui/index.html`

在 `start_gateway.ps1` 中，若 URL 開啟失敗會嘗試 fallback。

---

## 4) UI 依賴 API（請確認 Gateway 有開）

- `GET /healthz`
- `GET /api/agent/control`
- `POST /api/agent/control`
- `GET /api/channels`
- `POST /api/channels`
- `POST /api/agent/command`
- `GET /api/memory/files`
- `GET /api/memory/file?path=...`
- `GET /api/memory/workflows`
- `POST /api/memory/workflows/run`
- `GET /api/memory/architecture`
- `POST /api/memory/learn`
- `GET /api/memory/search?q=...`
- `POST /api/system/init`

只要其中任何關鍵 API 失敗，UI 上部分功能就會失效或顯示異常。

---

## 5) 新手驗證流程（最穩）

1. 先初始化依賴：
   ```powershell
   node scripts/init_gateway_env.mjs
   ```
2. 在 repo root 啟動 Gateway：
   ```powershell
   .\scripts\start_gateway.ps1
   ```
3. 先檢查：
   ```powershell
   Invoke-RestMethod http://localhost:8787/healthz
   ```
4. 開啟 `http://localhost:8787/approval-ui`。
5. 先做控制測試：`Start -> Pause -> Resume -> Stop`。
6. 再測 web command：送一段簡單文本，確認有 response/trace。

---

## 6) 常見問題

### Q1：頁面打得開，但按鈕沒反應？
先看 `healthz`、`/api/agent/control`、`/api/channels` 是否正常回 200。

### Q2：送 command 回 503？
通常是 `web_ui` channel 被停用，請在 channel 控制中重新 enable。

### Q3：為什麼顯示 disconnected？
channel 的 `connected` 依近期 activity 計算，不一定代表永久故障。

---

## 7) 給維運的建議

- 這個頁面適合 smoke test，不建議當最終商用前台。
- 若要客製化，優先保留 health/control/channel 三區塊，這是排障最關鍵資訊。

一句話：Approval UI 是 Gateway 的「操作儀表板」，不是主產品介面。
