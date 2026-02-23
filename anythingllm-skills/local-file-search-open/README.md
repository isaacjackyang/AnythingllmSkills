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

## 啟用後又跳回 OFF 的常見原因

1. **執行環境不是 Windows**
   - `openExplorer=true` 時需要 `explorer.exe`。
   - 若 AnythingLLM 跑在 Linux / Docker，沒有 `explorer.exe`，舊版實作可能觸發子程序錯誤。

2. **Skill 載入時發生 runtime error**
   - 例如執行器找不到 entrypoint、權限不足、Node 版本不相容。
   - 建議看 AnythingLLM server logs（通常會看到是哪個 skill 報錯）。

3. **搜尋根路徑不存在或不可存取**
   - 例如容器內沒有 `D:\`。
   - 建議先改 `rootPath` 到容器可見路徑測試。

4. **UI 有啟用但後端驗證失敗**
   - 前端顯示暫時 ON，後端載入失敗後會被回寫成 OFF。

## 排錯建議（最短路徑）

1. 先用 `openExplorer=false` 測試純搜尋。
2. 確認 AnythingLLM 所在環境看得到 `rootPath`。
3. 查看 AnythingLLM 後端 log，找 `local-file-search-open` 的錯誤堆疊。
4. 若 AnythingLLM 在 Docker/Linux：
   - 只保留搜尋功能，
   - 或改成呼叫宿主機 API 來打開檔案總管。

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

- 此 skill 的開啟檔案總管行為需在 **Windows 主機**上執行。
- AnythingLLM 若跑在 Docker/Linux，建議把「開啟檔案位置」改由宿主機 API 代理。
