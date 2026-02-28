import type { Event } from "./event";
import type { ToolProposal } from "./proposals/schema";
import { getHistory } from "./conversation_store";

export interface BrainClient {
  propose(event: Event): Promise<ToolProposal>;
  summarize(event: Event, toolResult: unknown): Promise<string>;
}

export interface AnythingLlmClientConfig {
  baseUrl: string;
  apiKey: string;
  model?: string;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

interface ChatResponse {
  textResponse?: string;
  response?: string;
  text?: string;
}

export class AnythingLlmClient implements BrainClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model?: string;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;

  constructor(config: AnythingLlmClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.maxRetries = Math.max(0, Math.floor(config.maxRetries ?? 1));
    this.retryBaseDelayMs = Math.max(50, Math.floor(config.retryBaseDelayMs ?? 200));
  }

  async propose(event: Event): Promise<ToolProposal> {
    const systemInstruction = [
      "You are a proposal-only agent that follows SLOW THINKING (組合泛化).",
      "Core principle: decompose big problems into small steps, maintain strict logic within each small scope.",
      "",
      "Before proposing, always think step by step:",
      "1. DECOMPOSE: Break the user's request into the smallest independent sub-tasks.",
      "2. IDENTIFY: Find the single smallest actionable step that can be done right now.",
      "3. VERIFY: In that small scope, confirm the logic is sound — inputs are valid, the tool is appropriate, the risk is correctly assessed.",
      "4. PROPOSE: Return exactly ONE tool_proposal for that step. If the full task needs N steps, propose only step 1 now.",
      "",
      "Never execute tools directly.",
      "Return only JSON matching:",
      "{trace_id,type:'tool_proposal',tool,risk,inputs,reason,idempotency_key}",
      "In the 'reason' field, briefly describe: (a) the decomposed sub-tasks, (b) why this step is first, (c) what comes next.",
      "No markdown and no prose outside the JSON.",
    ].join("\n");

    const userPrompt = JSON.stringify({
      mode: "tool_proposal",
      event,
      conversation_history: getHistory(event.conversation.thread_id),
      allowed_tools: ["http_request", "run_job", "db_query", "send_message", "shell_command", "forward_to_agent"],
      risk_levels: ["low", "medium", "high"],
    });

    const raw = await this.chat(event.workspace, event.message.text, systemInstruction, userPrompt);
    const proposal = this.extractJson<ToolProposal>(raw);
    if (proposal.trace_id !== event.trace_id) {
      proposal.trace_id = event.trace_id;
    }
    return proposal;
  }

  async summarize(event: Event, toolResult: unknown): Promise<string> {
    const systemInstruction = [
      "You are a concise assistant. Summarize tool results for the end user in Traditional Chinese.",
      "Follow SLOW THINKING: if the result indicates more steps are needed, clearly state what was completed and what remains.",
      "Structure: (1) 完成的步驟, (2) 結果摘要, (3) 下一步建議（如有）.",
    ].join("\n");
    const userPrompt = JSON.stringify({ mode: "reply", event, toolResult, conversation_history: getHistory(event.conversation.thread_id) });
    return this.chat(event.workspace, event.message.text, systemInstruction, userPrompt);
  }

  private async chat(workspace: string, message: string, system: string, context: string): Promise<string> {
    const url = `${this.baseUrl}/api/v1/workspace/${encodeURIComponent(workspace)}/chat`;
    const payload = {
      message,
      mode: "chat",
      system,
      context,
      model: this.model,
    };

    if (!this.apiKey) {
      throw new Error("ANYTHINGLLM_API_KEY is empty. Please set it in .env.gateway before sending commands.");
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(payload),
        });
      } catch (error) {
        const details = (error as Error).message || "unknown error";
        if (attempt < this.maxRetries) {
          await sleep(this.retryBaseDelayMs * (attempt + 1));
          continue;
        }
        throw new Error(`AnythingLLM connection failed (${url}): ${details}`);
      }

      if (!response.ok) {
        const body = await response.text();
        if (attempt < this.maxRetries && isRetryableStatus(response.status)) {
          await sleep(this.retryBaseDelayMs * (attempt + 1));
          continue;
        }
        throw new Error(`AnythingLLM chat failed (${response.status}): ${body}`);
      }

      const data = (await response.json()) as ChatResponse;
      return data.textResponse ?? data.response ?? data.text ?? "";
    }

    throw new Error("AnythingLLM chat failed: retry budget exhausted");
  }

  private extractJson<T>(raw: string): T {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonText = fenced?.[1] ?? raw;
    return JSON.parse(jsonText) as T;
  }
}


function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
