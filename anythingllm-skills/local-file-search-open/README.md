# local_file_search_open (AnythingLLM Custom Skill)

這個 skill 讓 AnythingLLM agent 在回答 RAG 之外，還可以：

1. 依關鍵字搜尋 Windows 本機檔案（可選整機 / C 槽 / D 槽 / 自訂路徑）
2. 可選擇直接用檔案總管定位到檔案（`explorer /select,`）

## 檔案結構

- `plugin.json`：skill manifest（名稱、參數 schema、entrypoint）
- `handler.js`：實際搜尋與開啟檔案總管的執行邏輯

## 參數

- `keyword` (required): 檔名關鍵字（不分大小寫）
- `searchScope` (optional): 搜尋範圍，`all`（整機）、`c`（C:\）、`d`（D:\）、`custom`（使用 rootPath），預設 `d`
- `rootPath` (optional): 當 `searchScope=custom` 時的搜尋起始路徑，預設 `D:\`
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

- 搜尋 C 槽：

```json
{
  "keyword": "報價",
  "searchScope": "c",
  "maxResults": 10,
  "openExplorer": false
}
```

- 搜尋 D 槽並開啟檔案所在位置：

```json
{
  "keyword": "合約",
  "searchScope": "d",
  "maxResults": 5,
  "openExplorer": true
}
```

- 搜尋整機（所有可用磁碟）：

```json
{
  "keyword": "invoice",
  "searchScope": "all",
  "maxResults": 20,
  "openExplorer": false
}
```

- 搜尋自訂路徑：

```json
{
  "keyword": "meeting",
  "searchScope": "custom",
  "rootPath": "C:\\Users\\你的帳號\\Documents",
  "maxResults": 10,
  "openExplorer": false
}
```

## 注意事項

- 此 skill 需在 **Windows 主機**上執行，因為會呼叫 `explorer.exe`。
- AnythingLLM 若跑在 Docker/Linux，請改成：
  - 讓 AnythingLLM 透過可存取 Windows 檔案系統的 bridge/service 呼叫，或
  - 把搜尋與開啟動作改由宿主機 API 代理。

## 疑難排解：Skill 開啟後又自動變回 Off

如果你在 AnythingLLM Desktop（如 v1.8.4）勾選 skill 後，畫面又跳回 Off，常見原因如下：

1. **skill 放錯目錄層級**
   - AnythingLLM 會掃描 `custom skills` 目錄下的每個技能資料夾。
   - 正確結構應為：`.../custom-skills/local-file-search-open/plugin.json`。
   - `plugin.json` 內的 `name` 使用 `local_file_search_open`（僅英數與底線），避免部份版本對 tool 名稱驗證不通過而導致開關自動回復 Off。

2. **`plugin.json` 解析失敗或欄位缺失**
   - 至少要有 `name`、`version`、`entrypoint`、`parameters` 等基本欄位。
   - 若 JSON 格式有錯（多逗號、編碼異常）通常會導致技能載入失敗。

3. **`entrypoint` 指向錯誤**
   - 本技能 `plugin.json` 的 `entrypoint` 是 `handler.js`，檔名必須完全一致。

4. **執行環境不是 Windows 或權限受限**
   - 這個技能會呼叫 `explorer.exe`，若不是 Windows 主機或遭安全軟體阻擋，可能異常。

5. **預設路徑不存在（例如沒有 D 槽）**
   - 本技能預設 `rootPath = D:\\`；若你的電腦沒有 D 槽，第一次呼叫就會回傳錯誤。
   - 建議在呼叫時明確傳入存在的路徑（例如 `C:\\Users\\你的帳號\\Documents`）。

6. **桌面版暫存設定異常**
   - 偶發情況下設定檔損毀會造成 toggle 無法保存，重啟 AnythingLLM 後再重新啟用可先排查。

建議排查順序：先確認資料夾結構與 `plugin.json`/`handler.js` 一致，再檢查主機是否 Windows、`rootPath` 是否存在，最後看 Desktop 日誌中的 skill 載入錯誤訊息。
