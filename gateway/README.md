# Gateway 使用說明（把你當第一次碰後端的人）

> 你可以把 Gateway 想成「總調度中心」。
> 所有外部訊息、風險判斷、工具執行、審計記錄，幾乎都經過它。

---

## 1. Gateway 負責哪些事？

Gateway 主要做 6 件事：

1. 接收外部訊息（Telegram/LINE/Web UI）
2. 把訊息整理成內部事件格式（含 trace_id）
3. 向 AnythingLLM 要 Proposal（建議執行方案）
4. 套用 Policy（判斷允許/拒絕/需審批）
5. 呼叫 Tool Runner 執行工具
6. 把結果回傳給通道使用者

---

## 2. 目錄導覽（不要全看，先看這幾個）

- `server.ts`：Gateway 主入口
- `connectors/`：外部通道（例如 Telegram）
- `core/router.ts`：核心流程編排
- `core/policy/`：風險政策
- `core/tools/`：可被執行的工具
- `core/audit/`：審計與紀錄
- `workers/`：背景工作執行

---

## 3. 啟動前檢查

請先確認：

```powershell
node -v
npm -v
npx -v
```

建議 Node.js >= 20。

---

## 4. 最快啟動方式

在 repo 根目錄執行：

```powershell
npx tsx gateway/server.ts
```

如果成功，預設監聽：`http://localhost:8787`

檢查：

```powershell
Invoke-RestMethod http://localhost:8787/healthz
Invoke-RestMethod http://localhost:8787/lifecycle
```

---

## 5. Telegram 串接（簡化流程）

1. 準備 bot token。
2. 設定 webhook 指向你的 Gateway ingress。
3. 若有設定 secret，確認 header 正確。
4. 從 Telegram 發送測試訊息。
5. 在 Gateway logs 找 trace_id 追整條鏈路。

如果 webhook 都收不到，先檢查 HTTPS 與公開網域，不要先怪程式。

---

## 6. Approval / 控制 API 概念

Gateway 支援控制層 API，通常用於：

- 切換 agent 狀態（start/pause/resume/stop）
- 查看或處理審批任務
- 查詢通道是否啟用

如果通道被停用，對應 ingress 可能回 `503`。

---

## 7. 除錯順序（最重要）

請嚴格照這個順序：

1. `healthz` 是否正常
2. 環境變數是否有載入
3. 連接器是否收到請求
4. Proposal API 是否成功
5. Policy 是否拒絕
6. Tool 是否執行失敗
7. 回覆是否在最終節點丟失

這樣你可以快速知道「卡在哪一層」。

---

## 8. 安全原則（務必遵守）

- 高風險工具一定要走 policy + approval
- 工具輸入做 schema 驗證與 allowlist
- 每次決策要可回放（audit log）
- 不要把生產金鑰寫死在程式碼

---

## 9. 新手常見錯誤

1. 沒載入 `.env` 就直接啟動
2. 本機能跑，但 webhook 用的是內網網址
3. 把所有工具一次打開，出問題無法定位
4. 沒有 trace_id，導致無法追 log

---

## 10. 一句總結

Gateway 的關鍵價值是「把 AI 執行流程變成可治理系統」，
不是只讓模型「會呼叫工具」而已。
