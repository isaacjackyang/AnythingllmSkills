# local-file-search-open (AnythingLLM Custom Skill)

這個 skill 讓 AnythingLLM agent 在回答 RAG 之外，還可以：

1. 依關鍵字搜尋 Windows 本機檔案（預設 `D:\`）
2. 可選擇直接用檔案總管定位到檔案（`explorer /select,`）

## 檔案結構

- `plugin.json`：skill manifest（名稱、參數 schema、entrypoint）
- `handler.js`：實際搜尋與開啟檔案總管的執行邏輯

## 參數

- `keyword` (required): 檔名關鍵字（不分大小寫）
- `rootPath` (optional): 搜尋起始路徑，預設 `D:\`
- `maxResults` (optional): 最多回傳筆數，預設 20（上限 100）
- `openExplorer` (optional): 是否開啟檔案總管定位第一筆結果，預設 `false`

## 在 AnythingLLM 的建議操作

1. 把 `local-file-search-open` 資料夾放到 AnythingLLM 的 custom skills 目錄。
2. 在 AnythingLLM 的 Agent / Skill 設定頁啟用此 skill。
3. 在系統提示詞（System Prompt）加入路由規則，例如：

```text
當使用者詢問「找檔案、搜尋本機、D槽、打開位置、檔案總管」等意圖時，優先呼叫 local-file-search-open skill。
先用 keyword 搜尋，再把結果摘要回覆使用者；若使用者要求「打開位置」，將 openExplorer 設為 true。
```

## 測試範例

- 只搜尋：

```json
{
  "keyword": "報價",
  "rootPath": "D:\\",
  "maxResults": 10,
  "openExplorer": false
}
```

- 搜尋並開啟檔案所在位置：

```json
{
  "keyword": "合約",
  "rootPath": "D:\\",
  "maxResults": 5,
  "openExplorer": true
}
```

## 注意事項

- 此 skill 需在 **Windows 主機**上執行，因為會呼叫 `explorer.exe`。
- AnythingLLM 若跑在 Docker/Linux，請改成：
  - 讓 AnythingLLM 透過可存取 Windows 檔案系統的 bridge/service 呼叫，或
  - 把搜尋與開啟動作改由宿主機 API 代理。
