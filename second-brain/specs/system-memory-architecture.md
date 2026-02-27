# Agent Memory System Spec

## 1) 四層架構

### 1.1 載入層（Load Layer）
- 單一入口：`MEMORY.md`
- 原則：只放每次 session 都值得讀的索引內容。
- 不放：每日摘要、一次性討論、長篇技術細節。

### 1.2 萃取層（Extraction Layer）
- 排程工廠：`microSync` / `daily wrap-up` / `weekly compound`
- 職責：把原始對話轉成可保存知識，並決定升/留/下沉。

### 1.3 儲存層（Storage Layer）
- 熱記憶：`MEMORY.md`
- 暖記憶：`memory/YYYY-MM-DD.md`, `memory/recent/*.md`, `memory/projects/*.md`
- 冷記憶：`second-brain/summaries/*.md`, `second-brain/research/*.md`, `second-brain/devlogs/*.md`, `second-brain/specs/*.md`, `memory/archive/*.md`

### 1.4 檢索層（Retrieval Layer）
- 內建 `memory_search`：預設索引 `MEMORY.md` + `memory/**/*.md`
- second brain 必須透過 `extraPaths` 或 `qmd.paths` 顯式納入。
- 若改為 `memory.backend = "qmd"`，由 QMD 執行 BM25 + 向量 + rerank。

## 2) 邏輯順序（執行時序，避免流程打架）

> 關鍵原則：先萃取、再整理、最後重寫索引；檢索層永遠讀「已落地檔案」，不讀暫存。

1. **對話進來（T0）**：session transcript 產生。
2. **microSync（T+3h 內）**：僅把「已定案」寫入 `memory/YYYY-MM-DD.md`。
3. **daily wrap-up（D+1）**：生成完整日摘要到 `second-brain/summaries/`。
4. **weekly compound（W+1）**：讀 weekly warm/cold 輸出，重寫 `MEMORY.md`，並下沉 archive。
5. **memory search（查詢時）**：只對既有 markdown 索引查詢，不應觸發寫入。

### 2.1 禁止反向依賴
- `microSync` 不可讀寫 `MEMORY.md`。
- `daily wrap-up` 不可直接升級條目到 `MEMORY.md`。
- `weekly compound` 才能 promote/demote。
- 檢索工具不可在查詢時偷偷落檔（避免 read path 變 write path）。

## 3) 排程規格

### 3.1 microSync（每天 10:00 / 13:00 / 16:00 / 19:00 / 22:00）
**輸入**
- 最近 3 小時 session
- 排除 scheduler / bot 自身 session

**萃取規則**
- 只收錄：
  1. 已確認決策
  2. 新規則 / 新限制
  3. 架構變更
  4. 使用者明示「記住這件事」

**輸出**
- `memory/YYYY-MM-DD.md`（append）
- 若無符合項目：直接退出

**條目 schema（必填）**
```md
## Decision: <title>
- id: DECISION-YYYYMMDD-<slug>   # 用於去重
- date:
- source:
  - session_id:
  - session_path:
  - message_range:
- why:
- finding:
- conclusion:
- impact:
- confidence:
- status: active|superseded|archived
- supersedes: DECISION-... (optional)
- refs:
```

### 3.2 daily wrap-up（每日凌晨）
**輸入**
- 過去 24 小時 session（排除 scheduler）

**輸出**
- `second-brain/summaries/YYYY-MM-DD-wrapup.md`
- 固定六段：
  - Decisions made today
  - Action items
  - Important conversations
  - Technical notes / debugging lessons
  - Open loops
  - Tomorrow next steps

### 3.3 weekly compound（每週一次）
**輸入**
- 本週 `memory/YYYY-MM-DD.md`
- 本週 `second-brain/summaries/*`

**輸出**
- 重寫 `MEMORY.md`（不是 append）
- 過時內容下沉到 `memory/archive/*`
- 產生 `memory/archive/weekly-YYYY-WW.md`（記錄 promote/demote 變更）

**三步驟**
1. Promote：升級高價值、可重用規則進主記憶
2. Demote：移除過時或細節型內容到 archive / second-brain
3. Rewrite：去重、解衝突、維持索引清晰

### 3.4 工作流衝突防呆
- **唯一寫入責任**：
  - `microSync` 只可寫 `memory/YYYY-MM-DD.md`
  - `daily wrap-up` 只可寫 `second-brain/summaries/*.md`
  - `weekly compound` 才能改寫 `MEMORY.md`
- **避免重覆寫入**：以 `id` 去重，同 `id` 僅保留最新且 confidence 較高版本。
- **來源可追溯**：每筆決策需包含 `session_id/session_path/message_range`。
- **狀態衝突**：若同主題有互斥結論，weekly compound 必須在 archive 記錄「覆寫原因與日期」。

## 4) 效能治理（必做，不然會越跑越慢）

### 4.1 檔案大小與切分門檻
- `MEMORY.md`：目標 <= 200 行。
- `memory/YYYY-MM-DD.md`：單檔建議 <= 300 decision 條；超過則切 `memory/recent/` 專題檔。
- `second-brain/summaries/*.md`：每檔建議 < 1,500 行；超過分卷。

### 4.2 索引更新策略
- `microSync` 頻率高，應避免每次全量重建索引。
- builtin 建議依 dirty-file 增量更新；QMD 建議保留 debounce（例如 15s）與 interval（例如 5m）。
- `weekly compound` 執行時暫停大量背景索引重建，避免 I/O 爭搶。

### 4.3 查詢效能策略
- 預設 `maxResults` 維持 4~8 筆，先小後大。
- 查詢先打 warm（`memory/`）再擴冷（`second-brain/`），避免每次跨全庫。
- 僅在需要跨月追溯時納入 `archive/research/devlogs`。

### 4.4 排程互鎖（避免同時寫）
- `daily wrap-up` 與 `weekly compound` 不可同時跑。
- 建議用 lock file：`memory/.locks/{job}.lock`。
- 任一 job 超時時需 fail-fast 並釋放 lock。

## 5) MEMORY.md 治理原則
- 只保留「每次都值得先看」的內容。
- 每個條目優先寫「摘要 + 連結路徑」。
- 不可直接新增長段落；超過 5 行說明必須拆到 warm/cold 檔案。

## 6) 檢索設定範例

### 6.1 Built-in memory_search
```json
{
  "agents": {
    "defaults": {
      "memorySearch": {
        "enabled": true,
        "provider": "openai",
        "model": "text-embedding-3-small",
        "extraPaths": [
          "./second-brain/summaries",
          "./second-brain/research",
          "./second-brain/devlogs",
          "./second-brain/specs"
        ]
      }
    }
  }
}
```

### 6.2 QMD backend
```json
{
  "memory": {
    "backend": "qmd",
    "citations": "auto",
    "qmd": {
      "includeDefaultMemory": true,
      "update": { "interval": "5m", "debounceMs": 15000 },
      "limits": { "maxResults": 6, "timeoutMs": 4000 },
      "paths": [
        { "name": "second-brain", "path": "./second-brain", "pattern": "**/*.md" },
        { "name": "memory-archive", "path": "./memory/archive", "pattern": "**/*.md" }
      ]
    }
  }
}
```

## 7) 最小可行上線順序
1. `MEMORY.md` + `memory/YYYY-MM-DD.md`
2. Built-in memory search + extraPaths（先納入 summaries）
3. 補 session recall metadata（session id / message index / timestamp）
4. 擴充 cold memory（research / devlogs / specs / archive）
5. 視規模升級為 QMD backend

## 8) 驗證清單
- 類型 A：近期決策（上週做了什麼）
- 類型 B：跨月原因追溯（為何放棄某方案）
- 類型 C：冷記憶技術細節（過往 pipeline 設計）

每次驗證至少檢查：
- 是否附來源
- 是否附日期
- 是否附路徑
- 是否標示不確定性
- 查詢延遲是否可接受（建議 p95 < 2s）

## 9) OpenClaw 差異補強
- 差異分析與補強路線圖：`second-brain/specs/openclaw-gap-analysis.md`
- 建議先完成 P0（idempotency key、memory 條目驗證、決策狀態機、trust-boundary 文件）。
