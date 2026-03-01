# Planner Memory Rules

## 讀取優先序
1. shared task memory（本任務上下文）
2. planner private memory（過去拆解品質）
3. long-term memory（已驗證流程模板）

## 寫入規則
- 寫入 private：本輪拆解是否被 reviewer 判定可執行。
- 寫入 shared：任務分解、依賴圖、驗收條件。
- 寫入 long-term（候選）：重複 2 次以上且驗收成功的拆解模式。
