# Executor Memory Rules

## 讀取優先序
1. planner handoff（本輪執行契約）
2. shared task memory（目前進度）
3. executor private memory（常見失敗與修正手法）

## 寫入規則
- 寫入 private：有效解法、失敗模式、環境限制。
- 寫入 shared：執行結果、證據路徑、阻塞點。
- 寫入 long-term（候選）：可複用 SOP，且 reviewer 通過。
