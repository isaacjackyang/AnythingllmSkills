# Approval UI (Control Plane)

This folder is intentionally separate from AnythingLLM UI.

Minimum workflow:
1. Show pending high-risk proposals.
2. Provide Approve/Reject actions with approver identity.
3. Post decision back to Gateway `/approvals/:id` endpoint.
4. Persist decision logs for audit.
