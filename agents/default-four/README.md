# Default Four Agents（gptoss20b）

這組預設配置讓你用同一個模型 `gptoss20b`，透過不同靈魂與記憶分工，形成可協作多 Agent。

## 角色
- planner：規劃與拆解
- executor：執行與落地
- reviewer：品質與風險審查
- archivist：沉澱與記憶治理

## 檔案約定（每個 agent）
- `system-prompt.md`：可直接貼入 AnythingLLM 的 system prompt
- `soul.md`：角色靈魂（人格、價值、邊界）
- `heartbeat.md`：每輪心跳檢查清單
- `memory.md`：該 Agent 的記憶讀寫規則

## 共享規格
- `shared/handoff.schema.json`：agent 交接 JSON 契約
- `shared/handoff-playbook.md`：什麼時候交接、怎麼交接、失敗怎麼回退
- `shared/handoff.example.json`：可直接套用的交接範例
- `registry.json`：預設四 agent 清單與檔案路徑
