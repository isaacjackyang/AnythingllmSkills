# Trust Boundary（AnythingLLM Skills Gateway）

## 安全模型聲明

本系統預設是 **單一團隊/單租戶內網環境**，不是敵對多租戶強隔離平台。

- 目標：可控自動化、可審批、可追溯。
- 非目標：惡意租戶彼此對抗、跨租戶資料機密隔離保證。

## 邊界與責任

1. **Gateway 進程邊界**
   - 承接通道 ingress、策略判斷、工具調用與審批。
   - 必須啟用 API 金鑰、速率限制與審計記錄。

2. **工具執行邊界**
   - `http_request`、`db_query`、`run_job` 屬於受控工具。
   - 高風險動作需 approval + confirm token。
   - shell/elevated 能力預設關閉，除非明確授權與白名單。

3. **記憶與資料邊界**
   - 記憶檔案依 `memory_namespace`、`agent_id` 做邏輯隔離。
   - 敏感憑證不可寫入 memory markdown。

## 推薦部署拓樸

### A. 單機（開發/小型團隊）
- Gateway、AnythingLLM、向量/檔案儲存同機。
- 僅允許內網訪問，反向代理統一 TLS 與 API Key。

### B. 分離部署（準生產）
- Gateway 與工具執行面分離（最少不同容器/主機）。
- 憑證由 secret manager 注入，不落地 repo。
- 任務資料庫與審計日誌使用獨立持久層並限制讀寫身分。

## Elevated 與憑證存放原則

- Elevated 能力需明確審批流程與短效 token。
- 所有外部服務 token（Telegram/LINE/AnythingLLM）只放環境變數或 secret manager。
- 禁止把 token 寫入 `memory/`、`second-brain/`、log 與 commit。

