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
