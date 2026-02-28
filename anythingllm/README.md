# anythingllm/ 目錄說明（定位與邊界）

## 文件維護狀態（2026-02-28）

- 已完成文件巡檢：本檔內容已依目前專案結構重新確認。
- 建議每次合併程式變更後，同步更新本檔中「啟動、驗證、限制」三類資訊。
- 本次檢查環境受 registry 權限限制，未能完成 `npm install` 與 TypeScript 測試依賴安裝；需在可存取 npm registry 的環境重跑完整測試。

---

這個目錄在本 repo 的角色是：
**放 AnythingLLM 相關掛載與整合素材的預留位置**。

目前它不是 AnythingLLM 主程式碼，也不是可直接啟動的服務目錄。

---

## 1) 你應該怎麼理解這個資料夾

- 這裡放的是「你要對接 Brain 時的配置與結構約定」。
- 真正執行邏輯主要在 `gateway/`。
- AnythingLLM 本體通常在其他部署位置（Docker、獨立主機、其他 repo）。

---

## 2) 為什麼這樣設計

把 Gateway 與 Brain 本體分離有三個好處：

1. Gateway 可獨立迭代治理能力（policy / audit / task control）。
2. AnythingLLM 升級時不會綁死在同一份程式樹。
3. 部署拓撲更彈性（同一個 Gateway 對不同 Brain 環境）。

---

## 3) 新手常見誤解

- 誤解 A：以為 `anythingllm/` 裡會有完整 server 程式。→ 目前沒有。
- 誤解 B：在這裡亂放臨時檔。→ 不建議，會污染掛載邏輯。
- 誤解 C：改這裡就會立即改變 Gateway 行為。→ Gateway 行為以 `gateway/` 代碼為主。

---

## 4) 建議維護規則

- 若新增 agent / workspace / skill 掛載約定，請同步更新本目錄說明。
- 涉及權限或資料邊界的設定，務必同步檢查 Gateway policy。
- 保持命名穩定（環境名稱、agent 名稱、workspace 名稱不要隨意改）。

一句話：`anythingllm/` 在本專案是「Brain 整合契約的掛載位」，不是執行核心。
