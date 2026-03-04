# OpenClaw 原子化硬插件盤點與 AnythingLLM 硬體 Skills 設計報告

## 執行摘要

- 本報告把「硬插件」定義為 OpenClaw `plugins/extensions`（可載入 Gateway 行程的程式模組），並以 `openclaw.plugin.json` 與 JSON Schema 做設定驗證（不需執行插件程式碼）。
- 依 OpenClaw `extensions/` 盤點，整理出 38 個可識別插件 ID。
- 從「原子化」角度看，真正可作為可組裝 primitive 的主要是：`diffs`、`llm-task`、`lobster`、`voice-call`、`device-pair`、`phone-control`、`talk-voice`。
- Windows 可行性重點：OpenClaw 官方主軸是 Windows 透過 WSL2 跑 Gateway/CLI；因此「Windows 相容」多數等價於「WSL2 Linux 相容」。
- AnythingLLM 反作用力：skill 數量增加時，`plugin.json`（含 examples）也會增加 prompt 注入體積，可能抵銷「拆分以縮短上下文」的目標。

## 名詞定義（本報告採用）

- **硬插件（hard plugins）**：OpenClaw 的 plugins/extensions。
- **原子化（atomic）**：單一責任、可型別化輸入、可機器驗證輸出、可分類錯誤、可授權邊界。
- **MCP-Panel**：你要求的「硬體控制面板」語義（避免與 AnythingLLM 文件中的 MCP-Protocol 混淆）。

## 38 個插件盤點（bundled/extensions）

> 版本標記規則：
> - 若有獨立 `package.json`，採其 `version`。
> - 無獨立版本者，以主版本 `2026.3.3` 註記為「隨主版本出貨」。

| ID | 版本 | 主要型態 | 原子化價值 | Windows/WSL2 | MCP-Panel 關聯 |
|---|---:|---|---|---|---|
| acpx | 2026.3.2 | runtime backend | 部分 | ✅ | 低 |
| bluebubbles | 2026.2.13 | channel | 否 | ⚠️（需 macOS server） | 低 |
| copilot-proxy | 2026.3.2 | provider bridge | 否 | ✅ | 低 |
| device-pair | 2026.3.3 | pairing/control | 是 | ✅ | 中 |
| diagnostics-otel | 2026.2.18 | observability | 不適用 | ✅ | 低 |
| diffs | 2026.3.2 | tool | 是 | ✅ | 低 |
| discord | 2026.2.25 | channel | 否 | ✅ | 低 |
| feishu | 2026.3.2 | channel | 否 | ✅ | 低 |
| google-gemini-cli-auth | 2026.2.26 | provider auth | 否 | ✅ | 低 |
| googlechat | 2026.3.2 | channel | 否 | ✅ | 低 |
| imessage | 2026.3.2 | channel | 否 | ❌（macOS 依賴） | 低 |
| irc | 2026.2.13 | channel | 否 | ✅ | 低 |
| line | 2026.2.27 | channel | 否 | ✅ | 低 |
| llm-task | 2026.3.2 | tool | 是 | ✅ | 低 |
| lobster | 2026.3.2 | workflow tool | 是 | ✅ | 中（可包裝控制流程） |
| matrix | 2026.3.2 | channel | 否 | ✅ | 低 |
| mattermost | 2026.2.21 | channel | 否 | ✅ | 低 |
| memory-core | 2026.3.3 | memory slot | 部分 | ✅ | 低 |
| memory-lancedb | 2026.3.2 | memory slot | 部分 | ✅ | 低 |
| minimax-portal-auth | 2026.2.16 | provider auth | 否 | ✅ | 低 |
| msteams | 2026.2.23 | channel | 否 | ✅ | 低 |
| nextcloud-talk | 2026.3.2 | channel | 否 | ✅ | 低 |
| nostr | 2026.2.13 | channel | 否 | ✅ | 低 |
| open-prose | 2026.2.13 | skill pack/command | 否 | ✅ | 低 |
| phone-control | 2026.3.3 | command/gate | 是 | ✅ | 中 |
| qwen-portal-auth | 2026.3.3 | provider auth | 否 | ✅ | 低 |
| signal | 2026.2.22 | channel | 否 | ✅（建議 WSL2） | 低 |
| slack | 2026.2.22 | channel | 否 | ✅ | 低 |
| synology-chat | 2026.3.2 | channel | 否 | ✅ | 低 |
| talk-voice | 2026.3.3 | command/control | 是 | ✅ | 中 |
| telegram | 2026.3.2 | channel | 否 | ✅ | 低 |
| thread-ownership | 2026.3.3 | message hook | 不適用 | ✅ | 低 |
| tlon | 2026.2.25 | channel | 否 | ✅ | 低 |
| twitch | 2026.3.2 | channel | 否 | ✅ | 低 |
| voice-call | 2026.2.27 | tool/RPC | 是 | ✅ | 中 |
| whatsapp | 2026.2.22 | channel | 否 | ✅ | 低 |
| zalo | 2026.2.23 | channel | 否 | ✅ | 低 |
| zalouser | 2026.2.23 | channel | 否 | ✅ | 低 |

## 關鍵觀察

1. **多數插件是通道或授權，不是硬體 primitive。**
2. **真正能提高穩定性的關鍵在 gating、approval、resumable workflow，不只是把功能切更碎。**
3. **Windows 生產可行性要以 WSL2 為預設。**
4. **AnythingLLM skills「數量過多」會增加 prompt 注入負擔。**

## AnythingLLM 落地策略（建議）

- 採「10–15 個最小 primitive + 1 個 workflow 層」而不是 50+ 常駐 skills。
- 高風險操作採兩段式：`plan` → `apply`（必要時 confirm token）。
- 每個 skill 統一回傳 JSON 字串，欄位至少包含：
  - `ok`, `code`, `message`, `data`, `meta`。
- 錯誤碼至少分：`INVALID_INPUT`, `PERMISSION_DENIED`, `TIMEOUT`, `UPSTREAM_ERROR`, `CONFLICT`。

## 建議的原子技能集合（示例）

### Windows primitives

- `win_fs_list`
- `win_fs_read_text`
- `win_fs_write_text_plan`
- `win_fs_write_text_apply`
- `win_process_list`
- `win_process_kill`
- `win_service_status`
- `win_registry_get`
- `win_registry_set_plan`
- `win_registry_set_apply`
- `win_net_dns_get`
- `win_net_dns_set`
- `win_firewall_rule_add_plan`
- `win_firewall_rule_add_apply`

### MCP-Panel primitives（假設情境）

- `hcp_bmc_power_cycle`
- `hcp_plc_read_register`
- `hcp_plc_write_register`
- `hcp_pdu_outlet_set`
- `hcp_kvm_switch_port`

## 實作範本（AnythingLLM skill）

- 必填參數：`target`, `action`, `dryRun`, `timeoutMs`。
- 寫入型操作加上：`confirm`。
- 安全預設：`dryRun=true`。
- 僅在 `dryRun=false` 且確認 token 正確時執行副作用。

```json
{
  "ok": true,
  "code": "OK",
  "message": "applied",
  "data": {
    "before": {},
    "after": {},
    "rollbackHint": "..."
  },
  "meta": {
    "durationMs": 142,
    "traceId": "...",
    "warnings": []
  }
}
```

## 風險與治理清單

- 名詞治理：內部將硬體面板統一稱 `MCP-Panel`（或 `HCP`），避免與 MCP-Protocol 混用。
- 權限治理：高風險操作必須 allowlist + approval gate + audit log。
- 穩定性治理：設定 timeout/retry budget/重入保護/loop guard。
- 供應鏈治理：僅安裝可信來源 skills/plugin，並進行版本鎖定。

## 可執行下一步

1. 先挑 10 個最小技能做 MVP（以只讀和低風險為主）。
2. 對 4 個高風險技能加 `plan/apply` + rollback hint。
3. 建立單一 workflow skill（resumable），負責跨技能的審批與續跑。
4. 進行 Windows Desktop 與 WSL2 的實測矩陣（權限、網路、重啟恢復）。
