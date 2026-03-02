# Pi vs 我們目前 Agent 架構（快速比較，含 P0~P3 進度校正）

## 先回答你最在意的：P0 / P1 是什麼？
這裡的 **P0 / P1** 指的是 `second-brain/specs/openclaw-gap-analysis.md` 裡的補強分級：
- **P0**：idempotency key、memory 條目最小驗證器、決策狀態機、trust-boundary 文件
- **P1**：control-plane schema、reconnect refresh、工具風險分級清單

> 也就是：P0/P1 原本是「差距分析文件中的待辦分類」，不是 Pi/OpenClaw 官方分級。

## 關於你說 antigravty 已完成 P0~P3：目前 repo 可見證據
你提醒得很對，先前寫法太像「全部都還沒做」，不夠精準。依目前主分支可見內容，應該改成：

### 已可見完成（至少部分）
1. **idempotency 機制已落地在任務/提案流程**
   - `tasks/store` 已支援 `idempotency_key` 去重
   - `router` 有 duplicate proposal 擋重
2. **P2/P3 的部分工程項已在程式中標註並存在實作**
   - `create_app.ts` 可見 P2-C rate limit、P3-B agent messaging、P2-A graceful shutdown

### 仍未在 repo 看見（或至少未見對應文件/模組）
1. `docs/security/trust-boundary.md`（gap 分析中的 P0 項）
2. 明確的 control-plane schema 契約檔（P1）
3. memory 條目「最小驗證器」的獨立檢查器（P0）
4. weekly compound 產出的衝突/狀態機制檔案仍以規格描述為主

## 所以「我們跟 Pi / OpenClaw 比如何」的校正版結論
- **不是「我們還沒做」**，而是 **「我們已做出治理型骨架，且部分 P2/P3/P0 子項已落地」**。
- 與 Pi/OpenClaw 的主要差距，仍在：
  1) append-only 對話分支歷史
  2) 控制面契約（schema/typed protocol）的一致化程度
  3) 文件化 trust boundary 與部分可驗證規範

## 對照
1. 工具哲學
   - Pi：預設極簡 4 工具，再靠 skills/extensions 疊加。
   - 我們：核心工具已包含 shell/http/db/queue，偏向治理導向工具集合。

2. 架構治理
   - Pi：上/下層依賴規範嚴格、協議更產品化。
   - 我們：route/core/worker 已拆分，且已有 approval/policy/audit/task 管理與多通道接入。

3. 對話與記憶
   - Pi：append-only、可回到任意節點重新分支。
   - 我們：`conversation_store` 目前是 in-memory + 最近 N 輪裁切，定位不同。

4. 產品形態
   - Pi + OpenClaw：SDK 嵌入 + Gateway + 多平台終端（含 app/市集）。
   - 我們：現階段是可運作的治理中樞，產品化生態仍在補齊。
