# Approval UI (Control Plane)

This folder is intentionally separate from AnythingLLM UI.

Minimum workflow:
1. Show pending high-risk proposals.
2. Provide Approve/Reject actions with approver identity.
3. Post decision back to Gateway `/approvals/:id` endpoint.
4. Persist decision logs for audit.

## Demo UI

- `index.html` 現在會呼叫 Gateway 控制 API（`GET/POST /api/agent/control`），並可透過 `/approval-ui` 直接載入。
- 支援 `Start/Pause/Resume/Stop` 實際控制狀態切換，不再只是純前端假資料。
