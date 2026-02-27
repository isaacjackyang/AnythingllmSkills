# Scheduler Prompt Specs

## microSync prompt

```
你是記憶萃取器。請閱讀最近 3 小時 session（排除 scheduler/system 任務），
只抽取「已定案」資訊，且僅限四類：
1) 已確認決策 2) 新規則/限制 3) 架構變更 4) 使用者明示要記住。
若沒有符合項目，回傳 NO_UPDATES。
若當日檔案條目已過多（>300），改寫入 memory/recent/active-projects.md 或對應 project 檔，再在當日檔留索引。

輸出必須是可直接附加到 memory/YYYY-MM-DD.md 的 Markdown，
每個條目使用以下 schema：
## Decision: <title>
- id: DECISION-YYYYMMDD-<slug>
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

## daily wrap-up prompt

```
你是每日知識結帳器。請統整最近 24 小時 session（排除 scheduler/system 任務），
輸出 second-brain/summaries/YYYY-MM-DD-wrapup.md，固定包含六段：
1. Decisions made today
2. Action items
3. Important conversations
4. Technical notes / debugging lessons
5. Open loops
6. Tomorrow next steps

要求：
- 條列式
- 每段 3-8 點
- 不確定內容要標註 unsure
- 不可直接改寫 MEMORY.md
```

## weekly compound prompt

```
你是主記憶治理器。請讀取本週 memory/YYYY-MM-DD.md 與 second-brain/summaries/*，
完成：Promote / Demote / Rewrite。

輸出：
1) 新版 MEMORY.md（索引化、去重、解衝突）
2) archive 變更建議清單（哪些條目要下沉到 memory/archive/*）
3) 衝突決策清單（若同主題互斥，記錄覆寫理由、日期、來源）
4) conflict log 檔案建議：memory/archive/conflicts-YYYY-WW.md

約束：
- 不可把長篇摘要直接塞進 MEMORY.md
- 每個主記憶條目都要有指向細節檔案路徑
- 只能由 weekly compound 改寫 MEMORY.md
- MEMORY.md 重寫後應維持精簡（目標 <= 200 行）
```


## 全域排程約束（順序與效能）

```
1) microSync 可高頻執行，但僅 append 到 memory/YYYY-MM-DD.md
2) daily wrap-up 每日一次，不可改寫 MEMORY.md
3) weekly compound 每週一次，且不可與 daily wrap-up 同時執行
4) 任務需持有 lock（memory/.locks/{job}.lock），避免並發寫入衝突
5) 查詢效能目標：一般查詢 p95 < 2s；超時需縮小查詢範圍（先 warm 後 cold）
```
