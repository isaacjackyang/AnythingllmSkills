# mcp-open-in-explorer（Windows-only）完整說明

## 文件維護狀態（2026-02-28）

- 已完成文件巡檢：本檔內容已依目前專案結構重新確認。
- 建議每次合併程式變更後，同步更新本檔中「啟動、驗證、限制」三類資訊。
- 本次檢查環境受 registry 權限限制，未能完成 `npm install` 與 TypeScript 測試依賴安裝；需在可存取 npm registry 的環境重跑完整測試。

---

> 這是一個單一職責的 MCP Server：
> **只提供 `open_local_file({ path })`，把指定檔案/資料夾交給 Windows Explorer 定位。**

---

## 1) 這個工具解決什麼問題

LLM 告訴你檔案路徑後，使用者常還要手動開檔案總管搜尋。
這個 server 讓代理能直接呼叫：

- `explorer.exe /select, <path>`

並透過 allow roots 限制可操作範圍。

---

## 2) 功能邊界

### 有做
- 驗證目標路徑是否落在 allow roots 內
- 合法後啟動 Explorer 並定位該路徑
- 以 stdio 方式提供 MCP 工具給主程式

### 沒做
- 不讀檔
- 不寫檔
- 不搜尋檔案

---

## 3) 平台限制（非常重要）

`src/index.ts` 會檢查 `process.platform === "win32"`。
不是 Windows 原生環境會直接退出（例如 Linux container / WSL）。

---

## 4) 安裝與建置

```powershell
cd mcp-open-in-explorer
npm install
npm run build
```

建置成功後需有：
- `dist/index.js`

---

## 5) 啟動方式

### A. 直接 node 啟動

```powershell
node dist/index.js C:\agent_sandbox
```

多根目錄：

```powershell
node dist/index.js C:\agent_sandbox D:\project_data
```

### B. 環境變數設定 allow roots

```powershell
$env:OPEN_IN_EXPLORER_ALLOW_ROOTS = "C:\agent_sandbox;D:\project_data"
node dist/index.js
```

> CLI 與環境變數可同時使用，程式會合併兩者。

### C. 使用專案腳本（推薦）

```powershell
.\start_open_in_explorer.ps1 -AllowRoots C:\agent_sandbox
```

常用參數：
- `-SkipInstall`
- `-SkipBuild`
- `-HealthCheck`
- `-HealthCheckTimeoutSeconds`

腳本會額外產生：
- `dist/anythingllm_mcp_servers.json`

---

## 6) 與 AnythingLLM 整合

可先跑：

```powershell
.\start_open_in_explorer.ps1 -SkipInstall -SkipBuild -HealthCheck
Get-Content .\dist\anythingllm_mcp_servers.json
```

重點：
- `open-in-explorer.args[0]` 是 `dist/index.js` 路徑
- `open-in-explorer.args[1...]` 才是 allow roots

---

## 7) EXE 打包（可選）

```powershell
.\bootstrap_open_in_explorer.ps1 -BuildExe
```

輸出：
- `dist/mcp-open-in-explorer-win-x64.exe`

也可指定輸出目錄：

```powershell
.\bootstrap_open_in_explorer.ps1 -BuildExe -ExeOutputDir D:\deploy\open-in-explorer
```

---

## 8) 故障排查（高頻）

### 問題：AnythingLLM 顯示 `Connection closed`
優先檢查：
1. 是否在 Windows 原生環境執行。
2. `dist/index.js` 是否存在。
3. 啟動程序是否找得到 `node`。

快速本機測試：

```powershell
node dist/index.js C:\agent_sandbox
```

若可看到 ready 訊息，通常代表 server 啟動正常。

---

## 9) 安全建議

- allow roots 請最小化，不要貪方便開整顆系統碟。
- 把它視為「定位工具」，不要把它當檔案讀寫能力。
- 若同時用 filesystem MCP，請分離權限與審計策略。

---

## 10) 一句總結

`mcp-open-in-explorer` 是一把「只能幫你打開抽屜定位檔案」的小鑰匙；它刻意不做其他事情，來保持風險可控。
