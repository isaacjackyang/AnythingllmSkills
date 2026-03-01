# Handoff Playbook

## 標準流
1. `planner -> executor`：給可執行子任務、驗收條件、風險。
2. `executor -> reviewer`：給變更摘要、測試結果、已知限制。
3. `reviewer -> archivist`：給可沉澱規則、重複問題、修正建議。
4. `archivist -> planner`：回饋可重用策略，供下一輪規劃。

## 交接最低要求
- 必須符合 `handoff.schema.json`。
- `next_actions` 至少 1 項，且為可執行句子。
- `status=blocked` 時，`risks` 必須說明阻塞原因。
- `confidence < 0.6` 時，下一站優先回 `planner` 重新拆解。

## 回退策略
- schema 不符：直接退回來源 agent 重送。
- 關鍵資訊缺漏（goal/outputs/next_actions）：標記 `needs_clarification`。
- 任務風險升高：優先 `reviewer -> planner`，暫停執行。
