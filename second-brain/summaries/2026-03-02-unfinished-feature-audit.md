# 必要但尚未完成功能：快速稽核（2026-03-02）

## 稽核範圍
- `second-brain/specs/openclaw-gap-analysis.md` 的 P0/P1 項
- `gateway/` 核心路由、任務與 worker 實作
- 既有進度校正文檔 `second-brain/summaries/pi-vs-our-agent.md`

## 結論（必要且未完成）

### 1) 任務執行器仍是 no-op（高優先）
- `gateway/workers/job_runner.ts` 明確註記 `TODO`，且目前會把任務標記完成但不做真實執行。
- 這會讓 task queue 在功能上「看起來成功、實際未執行」，屬於必要功能缺口。

建議下一步：
1. 先定義 `task.name -> handler` 的 dispatch table。
2. 對每種 handler 補最少一個整合測試（成功/失敗各一）。
3. 將 no-op 完成路徑改為「未知 task.name 直接 fail + audit 記錄」。

### 2) trust-boundary 文件缺失（P0 文件治理）
- gap 分析將 `docs/security/trust-boundary.md` 列為 P0。
- 目前 repo 未見 `docs/security/trust-boundary.md`，僅有 `gateway/SECURITY_REVIEW.md`。

建議下一步：
1. 新增 trust-boundary 文件，明確「非敵對多租戶」假設。
2. 列出單機/分離部署兩種推薦拓樸。
3. 對 elevated 工具與憑證存放加入責任邊界。

### 3) memory 最小驗證器尚未落地（P0 可驗證性）
- 規格要求對 `id/date/source/session_id/message_range/confidence` 進行最小驗證。
- 目前在 specs 與 summary 有描述，但未見獨立 lint/check 腳本或模組落地。

建議下一步：
1. 新增 `scripts/validate_memory_entries.mjs`（或同等模組）。
2. 先針對 `memory/**/*.md` 做 frontmatter/欄位檢查。
3. 將檢查加入 release checklist 或 CI smoke。

### 4) control-plane schema 契約檔未齊（P1）
- P1 要求至少覆蓋 `/api/agent/command`、`/api/tasks/run-once`、`/ingress/*`。
- 目前程式有型別與路由邏輯，但未見集中化 schema 契約檔與自動驗證流程。

建議下一步：
1. 在 `gateway/` 下新增 `schemas/`（JSON Schema 或 zod schema）。
2. 在 ingress 與 command route 啟用 runtime validate。
3. 補一個 contract test 驗證 schema 與 route 一致。

## 已完成但不列為缺口
- `idempotency_key` 在 proposal / task store 已有可見實作。
- approval / policy / audit 骨架已存在，非「從零缺失」。

## 排序建議（只看必要性）
1. `job_runner` 真實執行（避免假成功）
2. memory 最小驗證器（避免記憶品質漂移）
3. trust-boundary 文件（安全邊界明文化）
4. control-plane schema（對外契約一致化）
