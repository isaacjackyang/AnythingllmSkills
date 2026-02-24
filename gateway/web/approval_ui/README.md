# Approval UI (Control Plane)

This folder is intentionally separate from AnythingLLM UI.

Minimum workflow:
1. Show pending high-risk proposals.
2. Provide Approve/Reject actions with approver identity.
3. Post decision back to Gateway `/approvals/:id` endpoint.
4. Persist decision logs for audit.

## Demo UI

- `index.html` 提供啟動畫面，包含 `Start Agent` 按鈕與秘書風格全身動畫角色，可作為控制面原型。
