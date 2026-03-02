# local_file_open Skill 說明

此 skill 已改為「純開啟工具」，不再負責任何搜尋流程。

## 功能定位

- 由 MCP server 先完成搜尋，並提供目標檔案路徑。
- 本 skill 只負責驗證路徑與 allowlist，並在 Windows 嘗試用 Explorer 定位該檔案。

## 輸入參數

- `filePath`（必填）：目標檔案路徑。
  - 也相容 `path` 作為別名。
- `openExplorer`（選填）：是否嘗試開啟 Explorer（預設 `true`）。
- `allowlistRoots`（選填）：允許的根路徑清單。
  - 也可使用環境變數 `LOCAL_FILE_SEARCH_ALLOWLIST`（支援 `;` / `,` / 換行分隔）。

## 行為

1. 檢查 `filePath` 是否存在。
2. 檢查 `filePath` 是否為檔案（非目錄）。
3. 若有啟用 allowlist，驗證檔案路徑是否位於 allowlist 範圍內。
4. `openExplorer=true` 時，在 Windows 以 `explorer.exe /select,<filePath>` 嘗試開啟定位。

## 回傳重點

- `ok`：是否成功。
- `filePath`：canonical 後的目標檔案路徑。
- `directoryPath`：目標檔案所在資料夾。
- `allowlist`：allowlist 狀態與根路徑資訊。
- `explorer`：開啟 Explorer 結果。
- `warning`：如 allowlist 未啟用、非 Windows 等提示。
- `message`：摘要訊息。

## 注意事項

- 此 skill **不做搜尋**、**不讀檔內容**、**不做寫入/刪除**。
- 非 Windows 主機會回傳 Explorer 不支援警示。
