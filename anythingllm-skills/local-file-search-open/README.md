# local-file-search-open Skill 說明（依目前程式行為）

## 文件維護狀態（2026-02-28）

- 已完成文件巡檢：本檔內容已依目前專案結構重新確認。
- 建議每次合併程式變更後，同步更新本檔中「啟動、驗證、限制」三類資訊。
- 本次檢查環境受 registry 權限限制，未能完成 `npm install` 與 TypeScript 測試依賴安裝；需在可存取 npm registry 的環境重跑完整測試。

---

> 這份說明以 `handler.js` 實作為準。
> 先說重點：**這個 skill 目前只做「檔名搜尋」+「可選擇開啟 Explorer 定位第一筆結果」**，不提供檔案內容讀取。

---

## 1) 目前功能邊界（務必先搞清楚）

### 有做

1. 依 `keyword` 遞迴搜尋檔名。
2. 支援 `searchScope`：`all` / `c` / `d` / `custom`。
3. 可限制 `maxResults`（內部會 clamp 到 1~100）。
4. `openExplorer=true` 且有結果時，會嘗試開啟 Windows Explorer 並定位第一筆結果。
5. 非 Windows 環境仍可搜尋，但 open explorer 會回「不支援」。

### 沒做

- ❌ 不讀取檔案內容（沒有 read API）
- ❌ 不做 allowlist 白名單保護
- ❌ 不做檔案寫入/刪除

---

## 2) 參數說明（輸入）

`handler({ input })` 目前使用欄位：

- `keyword`（必填）：搜尋關鍵字（比對檔名）
- `searchScope`（選填）：`all` / `c` / `d` / `custom`（預設 `d`）
- `rootPath`（選填）：當 `searchScope=custom` 時使用
- `maxResults`（選填）：預設 20，最大 100
- `openExplorer`（選填）：布林值，是否在有結果時開啟 Explorer

---

## 3) 輸出欄位（回傳）

成功時回傳類似：

- `ok`
- `keyword`
- `searchScope`
- `rootPath`
- `scannedRoots`
- `warning`
- `count`
- `matches`
- `explorer`
- `message`

失敗時常見是：
- `ok: false`
- `message: ...`

---

## 4) 平台行為差異

### Windows

- `c/d/all/custom` 會按磁碟路徑判斷。
- `openExplorer` 透過 `explorer.exe /select,<path>` 嘗試開啟。

### 非 Windows

- 搜尋根路徑會回退到 `rootPath` 或 `process.cwd()`。
- `openExplorer` 會回覆不支援訊息，不會真的打開檔案管理器。

---

## 5) 新手建議測試案例

1. `keyword` 有命中 → `count > 0`
2. `keyword` 無命中 → `count = 0`
3. `searchScope=custom` 且路徑不存在 → `ok=false`
4. `openExplorer=true` + 有命中（Windows）→ `explorer.opened=true`
5. `maxResults` 填超大值 → 結果筆數不超過 100

---

## 6) 風險提醒（專家視角）

因為目前沒有 allowlist：

- 在 Windows `all` 範圍下，可能掃描大量磁碟路徑。
- 若要上正式環境，建議先改成「固定受控根路徑」或加入 allowlist 驗證。
- 建議加上排除目錄、掃描深度或執行時間上限，避免掃描過久。

---

## 7) 一句總結

`local-file-search-open` 現階段是「檔名搜尋 + Explorer 定位」的實用小 skill；若要上線到高安全環境，需先補 allowlist 與掃描治理策略。
