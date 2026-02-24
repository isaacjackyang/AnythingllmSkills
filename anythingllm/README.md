# AnythingLLM (Brain Side)

Use this area for workspace-specific prompts, agents, and skills.

Suggested structure:
- `workspaces/`: workspace routing metadata (`workspace -> default agent`).
- `agents/`: agent instructions that output only `tool_proposal` JSON for side effects.
- `skills/`: constrained skills for analysis and proposal drafting.

Rule of thumb: high-risk API keys and final execution remain in Gateway.
