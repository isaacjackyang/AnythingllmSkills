# local_file_open Skill 說明

此 skill 用於驗證本機檔案路徑並在 Windows Explorer 中定位該檔案。  
**適用於 AnythingLLM Desktop + Ollama**。

## 功能定位

- 由 MCP server 或使用者直接提供目標檔案路徑。
- 本 skill 負責驗證路徑與 allowlist，並在 Windows 嘗試用 Explorer 定位該檔案。

## 輸入參數

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `filePath` | string | ✅ | 目標檔案的絕對路徑（也相容 `path` 別名） |
| `openExplorer` | boolean | ❌ | 是否開啟 Explorer（預設 `true`） |
| `allowlistRoots` | array | ❌ | 允許的根路徑清單 |

> 若未設定 `allowlistRoots`，系統會讀取環境變數 `LOCAL_FILE_SEARCH_ALLOWLIST`（支援 `;` / `,` / 換行分隔）。

## 行為流程

1. 檢查 `filePath` 是否存在且為檔案（非目錄）。
2. 若有啟用 allowlist，驗證檔案路徑是否位於允許範圍內。
3. `openExplorer=true` 時，以 `explorer.exe /select,<filePath>` 開啟定位。
4. 回傳 JSON 字串結果。

## 回傳格式

handler 回傳 **JSON 字串**（AnythingLLM 規定），解析後包含：

- `ok` — 是否成功
- `filePath` — canonical 後的目標檔案路徑
- `directoryPath` — 目標檔案所在資料夾
- `allowlist` — allowlist 狀態與根路徑資訊
- `explorer` — 開啟 Explorer 結果
- `warning` — 如 allowlist 未啟用、非 Windows 等提示
- `message` — 摘要訊息

## AnythingLLM 相容性

- 使用 `module.exports.runtime = { handler }` 匯出格式
- handler 回傳值為 `JSON.stringify(result)` 字串
- 支援 `this.introspect()` 在 UI 顯示執行狀態

## 注意事項

- 此 skill **不做搜尋**、**不讀檔內容**、**不做寫入/刪除**。
- 非 Windows 主機會回傳 Explorer 不支援警示。
