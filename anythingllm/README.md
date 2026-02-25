# anythingllm/ 目錄說明（新手版）

這個資料夾不是拿來放「完整 AnythingLLM 原始碼」，而是放你在本專案中的 **Brain 側掛載點**。

## 你會看到什麼

- `workspaces/`：工作區相關掛載
- `agents/`：代理人設定掛載
- `skills/`：技能掛載

## 這有什麼用

當 Gateway 把任務送給 Brain（AnythingLLM）時，Brain 會依據這些掛載內容知道：

1. 目前有哪些能力可以用。
2. 哪些工作區與代理人可被路由。
3. 哪些技能可以被觸發。

## 新手建議

- 不要直接在這裡亂塞大量測試檔，先有明確命名。
- 每新增一個 skill 或 agent，務必在對應 README 或文件補上用途。
- 任何會影響執行權限的改動，都要搭配 Gateway policy 檢查。

一句話：`anythingllm/` 是 Brain 的「可用資源目錄」，不是單純備份資料夾。
