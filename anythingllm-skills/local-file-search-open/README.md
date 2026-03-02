# local-file-search-open Skill 說明（依目前程式行為）

## 文件維護狀態（2026-03-02）

- 已完成文件巡檢：本檔內容已依目前專案結構重新確認。
- 建議每次合併程式變更後，同步更新本檔中「啟動、驗證、限制」三類資訊。
- 本次檢查環境受 registry 權限限制，未能完成 `npm install` 與 TypeScript 測試依賴安裝；需在可存取 npm registry 的環境重跑完整測試。

---

> 這份說明以 `handler.js` 實作為準。
> 先說重點：**這個 skill 目前做「檔名搜尋」+「可選擇開啟 Explorer 定位第一筆結果」**，不提供檔案內容讀取；並新增了掃描保護機制（深度與逾時）。

---

## 1) 目前功能邊界（務必先搞清楚）

### 有做

1. 依 `keyword` 遞迴搜尋檔名。
2. 支援 `searchScope`：`all` / `c` / `d` / `custom`。
3. 可限制 `maxResults`（內部 clamp 到 1~100）。
4. 可限制 `maxDepth`（預設 12，內部 clamp 到 1~30）。
5. 可設定 `timeoutMs`（預設 15000ms，低於 1000ms 會被提升）。
6. 支援 allowlist（`allowlistRoots` 或環境變數 `LOCAL_FILE_SEARCH_ALLOWLIST`），會只掃描 allowlist 範圍內路徑。
7. 會略過常見高成本或系統目錄（如 `.git`、`node_modules`、`$Recycle.Bin`、`System Volume Information`）。
8. 會透過 `realpath` 去重避免循環掃描（例如符號連結造成重複/迴圈）。
9. `openExplorer=true` 且有結果時，會嘗試開啟 Windows Explorer 並定位第一筆結果。
10. 非 Windows 環境仍可搜尋，但 open explorer 會回「不支援」。

### 沒做

- ❌ 不讀取檔案內容（沒有 read API）
- ⚠️ 預設不強制 allowlist（需由 `allowlistRoots` 或環境變數啟用）
- ❌ 不做檔案寫入/刪除

---

## 2) 參數說明（輸入）

`handler({ input })` 目前使用欄位：

- `keyword`（必填）：搜尋關鍵字（比對檔名）
- `searchScope`（選填）：`all` / `c` / `d` / `custom`（預設 `d`）
- `rootPath`（選填）：當 `searchScope=custom` 時使用
- `maxResults`（選填）：預設 20，最大 100
- `openExplorer`（選填）：布林值，是否在有結果時開啟 Explorer
- `maxDepth`（選填）：掃描深度上限，預設 12
- `timeoutMs`（選填）：單次掃描逾時（毫秒），預設 15000
- `allowlistRoots`（選填）：允許掃描的根路徑陣列（也可用 `LOCAL_FILE_SEARCH_ALLOWLIST` 設定，支援 `;` / `,` / 換行分隔）

---

## 3) 輸出欄位（回傳）

成功時回傳類似：

- `ok`
- `keyword`
- `searchScope`
- `rootPath`
- `scannedRoots`
- `warning`
- `allowlist`（回報 allowlist 是否啟用、allowlist roots、被排除的 roots）
- `limits`（回報 maxResults / maxDepth / timeoutMs / elapsedMs / timeoutHit）
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

目前已支援 allowlist，但若未設定 allowlist 仍有風險：

- 在 Windows `all` 範圍下，若 allowlist 未啟用，仍可能掃描大量磁碟路徑。
- 正式環境建議務必設定 `allowlistRoots` 或 `LOCAL_FILE_SEARCH_ALLOWLIST`。
- 建議搭配 `searchScope=custom` + 受控 `rootPath`，縮小掃描面積。

---

## 7) 一句總結

`search_local_files`（原 `local-file-search-open`）現階段是「檔名搜尋 + Explorer 定位」且具備掃描治理（allowlist/深度/逾時/排除目錄）；正式環境建議強制啟用 allowlist。

---

## 8) 建議 System Prompt（可直接貼）

你是本機檔案搜尋助手，優先使用 `search_local_files` skill。

執行規則：
1. 先向使用者確認 `keyword`，若缺少則要求補充。
2. 未指定時，`searchScope` 預設用 `d`；只在使用者明確要求時改成 `all` 或 `custom`。
3. 當 `searchScope=custom` 時，必須要求使用者提供 `rootPath`。
4. 正式環境優先啟用 allowlist：以 `allowlistRoots`（或 `LOCAL_FILE_SEARCH_ALLOWLIST`）限制可掃描根路徑。
5. 預設 `maxResults=20`、`maxDepth=12`、`timeoutMs=15000`；若使用者要更快結果，可降低 `maxDepth` 與 `timeoutMs`。
6. 僅回傳檔名搜尋結果，不要宣稱已讀取檔案內容。
7. 只有在使用者明確要求時才設定 `openExplorer=true`。
8. 若回傳 `limits.timeoutHit=true`，請提示使用者縮小範圍（更精準 keyword、custom rootPath、較小 maxDepth）。
9. 若回傳 `allowlist.enabled=false`，請提示目前是高風險模式，建議先設定 allowlist 後再進行全域搜尋。

輸出規則：
- 先用一句話摘要是否有命中（`count`）。
- 接著列出前幾筆 `matches`。
- 若有 `warning`，務必明確顯示。
- 若 `ok=false`，直接解釋失敗原因並給下一步建議。


