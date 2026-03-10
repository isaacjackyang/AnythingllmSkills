# local-file-search-open (AnythingLLM Custom Skill)

這個 skill 讓 AnythingLLM agent 在回答 RAG 之外，還可以：

1. 依關鍵字搜尋 Windows 本機檔案（預設 `D:\`）
2. 可選擇直接用檔案總管定位到檔案（`explorer /select,`）

## 檔案結構

- `plugin.json`：新版 manifest 格式
- `skill.json`：相容舊版（含 Desktop 1.8.x）manifest 格式
- `handler.js`：實際搜尋與開啟檔案總管邏輯
- `index.js`：舊版常見 entrypoint 相容層

## 你的版本（Windows Desktop v1.8.4）建議安裝方式

> 1.8.x 常見情況是 manifest key 或 entrypoint 載入規則與新版不同，造成 UI 開啟後自動回 OFF。

1. 將 `local-file-search-open` 整個資料夾放到 AnythingLLM custom skills 目錄。
2. **優先保留 `skill.json` + `index.js` 組合**（這組是給舊版相容）。
3. 若你先前只有 `plugin.json`，請不要只放單一檔，建議四個檔案一起放（`skill.json/plugin.json/index.js/handler.js`）。
4. 重啟 AnythingLLM Desktop 後再到 Skill 頁開啟。


## 衝突修復（manifest/entrypoint）

為了避免不同版本讀到不同 entrypoint 造成行為衝突，現在已統一：

- `plugin.json` → `entrypoint: index.js`
- `skill.json` → `entrypoint: index.js`

`index.js` 只做相容轉發到 `handler.js`，可同時支援多種 loader 呼叫方式。

## 參數

- `keyword` (required): 檔名關鍵字（不分大小寫）
- `rootPath` (optional): 搜尋起始路徑，預設 `D:\`
- `maxResults` (optional): 最多回傳筆數，預設 20（上限 100）
- `openExplorer` (optional): 是否開啟檔案總管定位第一筆結果，預設 `false`

## 為什麼會「ON 之後又 OFF」

在 Desktop 1.8.4，常見是以下幾種：

1. **manifest/entrypoint 不符合該版載入規則**（最常見）
2. **skill 執行時丟錯**（例如 `openExplorer` 在非 Windows 或 `spawn` 錯誤未被接住）
3. **路徑不可見**（`rootPath` 指到 AnythingLLM 程序存取不到的位置）

這份 skill 已做的穩定化：
- `openExplorer` 非 Windows 直接回傳錯誤物件，不 crash。
- `spawn` 掛上 `error`/`spawn` 事件，避免未捕捉異常。
- `maxResults` 做數值正規化。

## 建議 System Prompt 路由規則

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

## 快速排錯

1. 先設 `openExplorer=false`，只測搜尋。
2. `rootPath` 先改成 `C:\Users\<你的帳號>\Desktop` 測試。
3. 重新啟動 AnythingLLM Desktop 再切 ON。
4. 看後端 log 裡是否有 `local-file-search-open` 或 `Cannot find module`。
