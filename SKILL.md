---
name: single-binary-cli-first
description: Enforce a deterministic skill pattern where agents only orchestrate approved commands from an in-repo Rust/Go single-binary CLI, with strict JSON contracts, dry-run/confirm gating, and no on-demand Python/JS/TS scripts.
---

# Single Binary CLI First

## 何時使用

當你要建立或更新任何 Skill，且目標是：

- 降低 runtime 依賴
- 提升可重播與可驗證性
- 讓低成本模型也可穩定執行

## 核心規範

1. Skill 只做路由與驗證，不承接複雜執行邏輯。
2. 所有副作用由自有單一 Rust/Go CLI 承接。
3. 禁止在 Skill 執行期間臨時生成 Python/JS/TS 腳本來完成任務。
4. 禁止依賴未審核第三方 Skill Hub。

## CLI 介面最小集合（示例）

- `xxx-cli open <target> --json`
- `xxx-cli go <action> <arg> --json`
- `xxx-cli close --json`

> 可以擴充子命令，但必須保持小而穩定的命令面。

## JSON 回應契約（必須）

```json
{
  "ok": true,
  "code": "OK",
  "message": "summary",
  "data": {},
  "evidence": [],
  "trace_id": "uuid",
  "schema_version": "1.0.0",
  "confirm_token": "optional"
}
```

- Skill 只能依 `ok/code/data` 判斷流程。
- 若 `schema_version` 不相容，Skill 必須立即中止。
- 不可回傳僅自然語言輸出取代 JSON。

## 副作用安全閘（必須）

任何寫入/刪除/外部呼叫都需兩段式：

1. `--dry-run --json` 取得變更計畫與 `confirm_token`
2. `--confirm-token <token> --json` 進行實際執行

若缺 token 或 token 失效，CLI 必須回：

- `ok=false`
- `code=NEED_CONFIRM`

## Determinism 與可重播

每次執行都要回傳：

- `trace_id`
- `inputs_hash`
- `environment_fingerprint`
- `steps[]`（摘要）

## Skill 內容應該長這樣

Skill 文件只保留：

- 何時呼叫哪個 CLI 命令
- 每個命令的成功與失敗碼
- 何時 retry / 何時 fail-fast

不要放：

- 「臨時寫一段 Python/JS/TS」的流程
- 與主流程無關的工具教學

## 建議首批 CLI 子命令

- `xxx-cli fs list --json`
- `xxx-cli fs read --json`
- `xxx-cli fs search --json`
- `xxx-cli plan diff --dry-run --json`
- `xxx-cli plan apply --confirm-token <token> --json`
- `xxx-cli run status --json`
