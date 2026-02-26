# mcp-open-in-explorer（Windows 專用）超詳細說明

> 這是一個非常小、非常單一用途的 MCP Server：
> **它只提供一個工具：`open_in_explorer({ path })`**。

如果你只看一句話：
**它只能把允許路徑的檔案/資料夾在 Windows 檔案總管中打開並定位，不負責讀寫檔案內容。**

---

## 1) 這個專案解決什麼問題？

很多時候 AI 回你「檔案在某路徑」，但你還是要自己手動開檔案總管去找。

這個 MCP 工具讓 AI 可以直接幫你：
- 呼叫 `explorer.exe /select, <path>`
- 把檔案定位出來

重點是它做了白名單限制，避免 AI 亂開系統敏感路徑。

---

## 2) 功能邊界（非常重要）

### 有做
- 驗證 `path` 是否在 allowlist 根目錄內
- 合法才呼叫 Explorer
- 最小攻擊面（只做一件事）

### 沒做
- 不提供檔案讀取
- 不提供檔案寫入
- 不提供全文搜尋

如果你需要讀寫搜尋，請搭配 filesystem MCP server。

---

## 3) 先決條件

- Windows 10/11（需有 `explorer.exe`）
- Node.js 18+（建議 20 LTS）
- npm

快速檢查：

```powershell
node -v
npm -v
where explorer
```

只要 `where explorer` 找不到，這工具就不用往下看了。

---

## 4) 建置（TypeScript 編譯）

```powershell
cd mcp-open-in-explorer
npm install
npm run build
```

成功後應有：
- `dist/index.js`

---

## 5) 本機啟動（手動）

### 單一 allowlist 根目錄

```powershell
node dist/index.js C:\agent_sandbox
```

### 多個 allowlist 根目錄

```powershell
node dist/index.js C:\agent_sandbox D:\project_data E:\shared_workspace
```

注意：這個程序會一直掛在前景，測試期間請不要關終端機。

---



## 白名單（allowlist）要去哪裡設定？

你有兩種設定方式，可以同時使用：

1. **啟動參數（最常見）**
   - 在 `node dist/index.js` 後面直接帶路徑
   - 例如：`node dist/index.js C:\agent_sandbox D:\project_data`

2. **環境變數 `OPEN_IN_EXPLORER_ALLOW_ROOTS`**
   - 用分號 `;` 分隔多個根目錄
   - 例如：

```powershell
$env:OPEN_IN_EXPLORER_ALLOW_ROOTS = "C:\agent_sandbox;D:\project_data"
node dist/index.js
```

若兩者都設定，程式會把兩邊合併成最終白名單。

另外，AnythingLLM 的 MCP 設定檔（例如 `anythingllm_mcp_servers.json`）裡，
`open-in-explorer.args` 內傳給 `index.js` 的那些路徑，就是你現在實際在用的白名單來源之一。


### 在 AnythingLLM 設定檔中，哪一段是白名單？

以本 repo 的 `anythingllm_mcp_servers.json` 為例：

- `open-in-explorer.args[0]`：`index.js` 的路徑（不是白名單）
- `open-in-explorer.args[1...]`：每一個都是白名單根目錄

也就是說，你要放寬或新增可開啟範圍，就在 `args` 後段加路徑，例如：

```json
"open-in-explorer": {
  "command": "node",
  "args": [
    "C:\\agent_sandbox\\mcp-open-in-explorer\\dist\\index.js",
    "C:\\agent_sandbox",
    "D:\\project_data"
  ]
}
```

如果你不想把白名單寫在 args，也可以改用環境變數 `OPEN_IN_EXPLORER_ALLOW_ROOTS`。

## 5.1) 一鍵啟動（PowerShell）

專案內提供 `start_open_in_explorer.ps1`，可一鍵完成 install/build 並啟動：

```powershell
cd mcp-open-in-explorer
.\start_open_in_explorer.ps1 -AllowRoots C:\agent_sandbox
```

多白名單範例：

```powershell
.\start_open_in_explorer.ps1 -AllowRoots C:\agent_sandbox, D:\project_data
```

常用參數：
- `-SkipInstall`：跳過 `npm install`
- `-SkipBuild`：跳過 `npm run build`
- `-NoPause`：結束時不等待按鍵

---

## 5.2) 啟動前檢查 / 安裝 / 打包 EXE（PowerShell）

如果你要先做「環境檢查 + 安裝 + 編譯」，或要打包成可帶去其他電腦的 exe，可使用：

```powershell
cd mcp-open-in-explorer
.\bootstrap_open_in_explorer.ps1
```

打包 exe：

```powershell
.\bootstrap_open_in_explorer.ps1 -BuildExe
```

打包後複製到指定資料夾（例如網路磁碟或安裝包目錄）：

```powershell
.\bootstrap_open_in_explorer.ps1 -BuildExe -ExeOutputDir D:\deploy\open-in-explorer
```

常用參數：
- `-SkipInstall`：跳過 `npm install`
- `-SkipBuild`：跳過 `npm run build`
- `-BuildExe`：執行 `npm run package:win-x64`
- `-ExeOutputDir <path>`：把 exe 額外複製到指定路徑
- `-NoPause`：結束時不等待按鍵

> 建議流程：先在開發機 `-BuildExe`，再把 `mcp-open-in-explorer-win-x64.exe` 帶到目標 Windows x64 主機執行。

---

## 5.3) 你說的兩種流程（正確）

是的，你理解的流程是正確的，分成兩條路：

1. **Source 腳本流程（最直覺）**
   - 先跑：`./bootstrap_open_in_explorer.ps1`（或直接 `./start_open_in_explorer.ps1`）
   - 再到 AnythingLLM 的 MCP 設定中啟用/重載 `open-in-explorer` server

2. **EXE 佈署流程（跨機器）**
   - 在打包機跑：`./bootstrap_open_in_explorer.ps1 -BuildExe`
   - 把 `dist/mcp-open-in-explorer-win-x64.exe` 複製到目標 Windows x64 機器
   - 在 AnythingLLM 的 MCP 設定把 command 指向該 exe，然後啟用/重載 server

> 補充：兩種方式最終都要在 AnythingLLM 端把 `open-in-explorer` MCP server 打開（或 reload）才會生效。

---

## 6) 與 AnythingLLM 整合（MCP 設定）

範例：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:\\agent_sandbox"]
    },
    "open-in-explorer": {
      "command": "node",
      "args": [
        "C:\\agent_sandbox\\mcp-open-in-explorer\\dist\\index.js",
        "C:\\agent_sandbox"
      ]
    }
  }
}
```

建議角色分工：
- `filesystem`：讀/寫/搜尋
- `open-in-explorer`：純定位與開啟

這樣權限更清楚，安全性更好。

---

## 7) 佈署方式（從簡到穩定）

### A. 手動啟動（最簡單）

```powershell
node C:\agent_sandbox\mcp-open-in-explorer\dist\index.js C:\agent_sandbox
```

適合：開發環境、偶爾用。

### B. Task Scheduler（推薦）

- 在使用者登入時自動啟動
- 較適合需要桌面互動（Explorer）的情境

關鍵設定：
- Run only when user is logged on
- Program: `node`
- Args: `...\dist\index.js C:\agent_sandbox`
- Start in: 專案目錄

### C. NSSM 服務包裝

若公司標準是 Windows 服務可用 NSSM。
但若你需要與桌面 session 穩定互動，Task Scheduler 通常更直覺。

---

## 8) 常見錯誤排查（AnythingLLM 顯示 Connection closed）

如果 AnythingLLM 顯示：

- `MCP error -32000: Connection closed`
- `This MCP server is not running`

最常見原因是 **MCP 主程式不是在 Windows 平台啟動**。

`open-in-explorer` 啟動時會先檢查 `process.platform === "win32"`；若不是，就會直接退出。

### 你目前這組設定的檢查重點

```text
Command: node
Arguments: C:\agent_sandbox\mcp-open-in-explorer\dist\index.js C:\agent_sandbox
```

1. `dist/index.js` 是否真的存在（先在該機器執行過 `npm run build`）
2. AnythingLLM 是否跑在 Windows 原生環境（不是 Linux container / WSL）
3. `node` 是否可被 AnythingLLM 啟動程序找到（PATH 內可執行）

### 建議快速驗證（在同一台主機）

```powershell
node C:\agent_sandbox\mcp-open-in-explorer\dist\index.js C:\agent_sandbox
```

- 若看到 `open-in-explorer MCP server ready...`，代表服務可正常啟動。
- 若看到 `Windows-only` 相關錯誤，代表啟動環境不是 Windows。 

---

## 8) 打包成 exe（可選）

```powershell
npm run package:win-x64
```

輸出：
- `dist/mcp-open-in-explorer-win-x64.exe`

可直接用：

```powershell
C:\agent_sandbox\mcp-open-in-explorer\dist\mcp-open-in-explorer-win-x64.exe C:\agent_sandbox
```

注意：這個產物是 Windows x64 專用。

---

## 9) 更新流程

```powershell
cd C:\agent_sandbox\mcp-open-in-explorer
git pull
npm install
npm run build
```

再重啟你的啟動方式（Task Scheduler / NSSM / 手動）。

---

## 10) 驗收清單（務必逐條確認）

1. 程序有正常存活
2. AnythingLLM 看得到 `open_in_explorer`
3. 合法路徑可正常開啟
4. 非法路徑會被拒絕

測試建議：
- Allowed: `C:\agent_sandbox\logs\task.log`
- Denied: `C:\Windows\System32\drivers\etc\hosts`

---

## 11) 安全提醒

- allowlist 請設定最小範圍，不要貪方便設太大。
- 不要把這個工具誤當成檔案讀寫工具。
- 若你同時啟用 filesystem MCP，請分開管控權限與審計。

一句話總結：
**mcp-open-in-explorer 是一把「只會開抽屜」的安全小鑰匙，不是萬能鑰匙。**
